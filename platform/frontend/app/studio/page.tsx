"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const bandColor: Record<string, string> = { A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c" };
const ACCENTS = [
  ["ux4g-purple #4a2bc2", "UX4G Purple (default)"],
  ["ux4g-saffron #f70", "Saffron"],
  ["ux4g-green #080", "Green"],
];
const DEVICES: [string, number][] = [["Mobile", 375], ["Tablet", 768], ["Desktop", 1180]];

export default function Studio() {
  const [department, setDepartment] = useState("");
  const [purpose, setPurpose] = useState("");
  const [pagesText, setPagesText] = useState("Home, About, Services, Contact");
  const [language, setLanguage] = useState("English");
  const [mode, setMode] = useState("light");
  const [accent, setAccent] = useState(ACCENTS[0][0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [run, setRun] = useState<any>(null);
  const [active, setActive] = useState("");
  const [html, setHtml] = useState("");
  const [device, setDevice] = useState(1180);
  const poll = useRef<any>(null);

  useEffect(() => () => clearInterval(poll.current), []);

  async function submit() {
    setErr(""); setRun(null); setHtml(""); setActive("");
    const pages = pagesText.split(",").map(s => s.trim()).filter(Boolean);
    if (!department || !purpose || !pages.length) { setErr("Fill in the organisation, purpose and at least one page."); return; }
    setBusy(true);
    try {
      const r = await api.studioCreate({ department, purpose, pages, language, mode, accent });
      pollRun(r.id);
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Could not start generation.");
    }
  }

  function pollRun(id: string) {
    clearInterval(poll.current);
    const tick = async () => {
      try {
        const s = await api.studioGet(id);
        setRun(s);
        if (s.status !== "generating") {
          clearInterval(poll.current); setBusy(false);
          if (s.files?.length) openPage(id, s.files[0]);
        }
      } catch { clearInterval(poll.current); setBusy(false); setErr("Lost the run."); }
    };
    tick();
    poll.current = setInterval(tick, 2500);
  }

  async function openPage(id: string, file: string) {
    setActive(file);
    setHtml(await api.studioPreview(id, file));
  }

  async function download() {
    const blob = await api.studioDownload(run.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `govux-studio-${run.id}.zip`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
      <h1 className="h3 mb-0">Design Studio</h1>
      <p className="text-secondary small">Describe your site — Studio generates UX4G-conformant, accessible,
        cross-linked pages and refines them until they pass the GovUX audit. AI generates; the deterministic
        engine scores. Preview the screens and download the HTML.</p>

      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card shadow-sm"><div className="card-body">
            <label className="form-label fw-semibold" htmlFor="s-dept">Organisation / Department</label>
            <input id="s-dept" className="form-control mb-2" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Department of Posts" />
            <label className="form-label fw-semibold" htmlFor="s-purpose">Purpose</label>
            <textarea id="s-purpose" className="form-control mb-2" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Citizen services portal for savings schemes" />
            <label className="form-label fw-semibold" htmlFor="s-pages">Pages (comma-separated)</label>
            <input id="s-pages" className="form-control mb-2" value={pagesText} onChange={e => setPagesText(e.target.value)} />
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label fw-semibold" htmlFor="s-lang">Language</label>
                <input id="s-lang" className="form-control" value={language} onChange={e => setLanguage(e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold" htmlFor="s-mode">Theme</label>
                <select id="s-mode" className="form-select" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </div>
            </div>
            <label className="form-label fw-semibold mt-2" htmlFor="s-accent">Accent (approved)</label>
            <select id="s-accent" className="form-select mb-3" value={accent} onChange={e => setAccent(e.target.value)}>
              {ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-primary w-100" onClick={submit} disabled={busy}>
              {busy ? "Generating & refining…" : "✨ Generate pages"}</button>
            <p className="text-secondary small mt-2 mb-0">The colour theme is a constrained, contrast-safe choice — it never lowers the score.</p>
          </div></div>
        </div>

        <div className="col-lg-8">
          {run == null && (
            <div className="card shadow-sm h-100"><div className="card-body d-flex align-items-center justify-content-center text-secondary" style={{ minHeight: 360 }}>
              {busy ? <span><span className="spinner-border spinner-border-sm me-2" />Generating and auditing…</span>
                : "Your generated screens will appear here."}
            </div></div>
          )}
          {run?.status === "failed" && <div className="alert alert-danger">Generation failed: {run.error}</div>}
          {run?.status === "scored" && (
            <div className="card shadow-sm"><div className="card-body">
              <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
                <div><span className="score-value" style={{ fontSize: 30 }}>{run.score}</span>
                  <span className="badge ms-1" style={{ background: (bandColor[run.band] || "#5c636a") + "22", color: bandColor[run.band] || "#5c636a" }}>Band {run.band}</span></div>
                <span className="text-secondary small">GovUX static score · {run.iterations} refine(s) · ₹{run.billing?.cost_inr} · {run.billing?.output_tokens} out-tokens</span>
                <button className="btn btn-outline-primary btn-sm ms-auto" onClick={download}>⬇ Download HTML (.zip)</button>
              </div>
              <div className="d-flex flex-wrap gap-1 mb-2">
                {(run.files || []).map((f: string) => (
                  <button key={f} onClick={() => openPage(run.id, f)}
                    className={`btn btn-sm ${active === f ? "btn-primary" : "btn-outline-secondary"}`}>{f}</button>
                ))}
                <span className="ms-auto btn-group btn-group-sm">
                  {DEVICES.map(([l, w]) => (
                    <button key={l} className={`btn ${device === w ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setDevice(w)}>{l}</button>
                  ))}
                </span>
              </div>
              <div className="border rounded d-flex justify-content-center" style={{ background: "#f6f8fa", overflow: "auto" }}>
                <iframe title="preview" srcDoc={html} sandbox="allow-same-origin"
                  style={{ width: device, height: 620, border: 0, background: "#fff" }} />
              </div>
              {run.findings?.length > 0 && (
                <details className="mt-2"><summary className="small text-secondary">Residual findings ({run.findings.length})</summary>
                  <ul className="small text-secondary mb-0 mt-1">{run.findings.slice(0, 12).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                </details>
              )}
              <p className="text-secondary small mt-2 mb-0">⚠️ AI-generated draft — human review required before use. A full browser audit runs once deployed to a URL.</p>
            </div></div>
          )}
        </div>
      </div>
    </div></AppShell>
  );
}
