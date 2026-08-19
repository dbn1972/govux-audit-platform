"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

import { BAND_COLOR as bandColor, bandStyle } from "@/lib/score";
const ACCENTS = [["ux4g-purple #4a2bc2", "UX4G Purple (default)"], ["ux4g-saffron #f70", "Saffron"], ["ux4g-green #080", "Green"]];
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
  const [htmls, setHtmls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);      // filename open in large view
  const [device, setDevice] = useState(1180);
  const [history, setHistory] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const poll = useRef<any>(null);

  useEffect(() => { api.listStudio().then(setHistory).catch(() => {}); return () => clearInterval(poll.current); }, []);

  async function submit() {
    setErr(""); setRun(null); setHtmls({}); setZoom(null);
    const pages = pagesText.split(",").map(s => s.trim()).filter(Boolean);
    if (!department || !purpose || !pages.length) { setErr("Fill in the organisation, purpose and at least one page."); return; }
    setBusy(true);
    try { pollRun((await api.studioCreate({ department, purpose, pages, language, mode, accent })).id); }
    catch (e: any) { setBusy(false); setErr(e?.message || "Could not start generation."); }
  }

  function pollRun(id: string) {
    clearInterval(poll.current);
    const tick = async () => {
      try {
        const s = await api.studioGet(id);
        setRun(s);
        if (s.status !== "generating") {
          clearInterval(poll.current); setBusy(false);
          const map: Record<string, string> = {};
          for (const f of s.files || []) map[f] = await api.studioPreview(id, f);
          setHtmls(map); setZoom((s.files || [])[0] || null);
          api.listStudio().then(setHistory).catch(() => {});
        }
      } catch { clearInterval(poll.current); setBusy(false); setErr("Lost the run."); }
    };
    tick(); poll.current = setInterval(tick, 2500);
  }

  async function openRun(id: string) {
    setErr(""); setHtmls({}); setZoom(null);
    const s = await api.studioGet(id); setRun(s);
    const map: Record<string, string> = {};
    for (const f of s.files || []) map[f] = await api.studioPreview(id, f);
    setHtmls(map); setZoom((s.files || [])[0] || null);
  }

  async function togglePublish() {
    const next = !run.published;
    const r = await api.studioPublish(run.id, next, run.title);
    setRun({ ...run, published: r.published, public_slug: r.public_slug });
  }

  async function download() {
    const blob = await api.studioDownload(run.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `govux-studio-${run.id}.zip`; a.click();
    URL.revokeObjectURL(url);
  }

  const publicUrl = run?.public_slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/showcase/${run.public_slug}` : "";
  const shareText = `${run?.title || "Government prototype"} — a GovUX Studio demo`;
  const share = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + " " + publicUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`,
    email: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareText + "\n\n" + publicUrl)}`,
  };

  return (
    <AppShell><div className="gx-page">
      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mb-1">Design Studio</h1>
          <div className="gx-muted">
            Describe your service and Studio generates UX4G-conformant, accessible, cross-linked
            pages, refining them until they pass the audit. AI generates; the deterministic engine
            scores — the two never swap roles.
          </div>
        </div>
      </div>
      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="row g-3">
        <div className="col-lg-3">
          <div className="gx-card mb-3"><div className="gx-card-body">
            <label className="form-label" htmlFor="s-dept">Organisation</label>
            <input id="s-dept" className="form-control mb-2" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Department of Posts" />
            <label className="form-label" htmlFor="s-purpose">Purpose</label>
            <textarea id="s-purpose" className="form-control mb-2" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Citizen services portal" />
            <label className="form-label" htmlFor="s-pages">Pages (comma-separated)</label>
            <input id="s-pages" className="form-control mb-2" value={pagesText} onChange={e => setPagesText(e.target.value)} />
            <div className="row g-2">
              <div className="col-6"><label className="form-label" htmlFor="s-lang">Language</label>
                <input id="s-lang" className="form-control" value={language} onChange={e => setLanguage(e.target.value)} /></div>
              <div className="col-6"><label className="form-label" htmlFor="s-mode">Theme</label>
                <select id="s-mode" className="form-select" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="light">Light</option><option value="dark">Dark</option></select></div>
            </div>
            <label className="form-label fw-semibold small mt-2" htmlFor="s-accent">Accent</label>
            <select id="s-accent" className="form-select form-select-sm mb-3" value={accent} onChange={e => setAccent(e.target.value)}>
              {ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn btn-primary w-100" onClick={submit} disabled={busy}>
              {busy ? "Generating & refining…" : "✨ Generate pages"}</button>
          </div></div>

          {history.length > 0 && (
            <div className="gx-card"><div className="gx-card-head">Your prototypes</div>
              <div className="list-group list-group-flush">
                {history.slice(0, 10).map(h => (
                  <button key={h.id} className="list-group-item list-group-item-action small text-start" onClick={() => openRun(h.id)}>
                    <div className="fw-semibold text-truncate">{h.department || "Untitled"}</div>
                    <span className="gx-muted">{h.status === "scored" ? `${h.score} · Band ${h.band}` : h.status} · {h.pages} pages</span>
                  </button>
                ))}
              </div></div>
          )}
        </div>

        <div className="col-lg-9">
          {run == null && (
            <div className="gx-card h-100"><div className="gx-card-body d-flex align-items-center justify-content-center gx-muted" style={{ minHeight: 400 }}>
              {busy ? <span><span className="spinner-border spinner-border-sm me-2" />Generating and auditing…</span> : "Your generated screens will appear here — like a design board."}
            </div></div>
          )}
          {run?.status === "failed" && <div className="alert alert-danger">Generation failed: {run.error}</div>}
          {run?.status === "generating" && (
            <div className="gx-card"><div className="gx-card-body gx-empty gx-muted">
              <span className="spinner-border text-primary mb-2" /><div>Generating and refining toward the audit target…</div></div></div>
          )}

          {run?.status === "scored" && (<>
            <div className="gx-card mb-3"><div className="gx-card-body d-flex align-items-center flex-wrap gap-2">
              <div><span className="score-value" style={{ fontSize: 28 }}>{run.score}</span>
                <span className="badge ms-1" style={bandStyle(run.band)}>Band {run.band}</span></div>
              {/* a static analysis of generated markup, not an audit of a live
                  site — saying which is the difference between a claim and a hint */}
              <span className="gx-muted small">
                Static score of the generated markup · {run.iterations} refinement{run.iterations === 1 ? "" : "s"}
                {run.billing?.cost_inr != null && <> · ₹{run.billing.cost_inr}</>}
              </span>
              <div className="ms-auto d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={download}><i className="bi bi-download me-1" aria-hidden="true" />Download .zip</button>
                <button className={`btn btn-sm ${run.published ? "btn-success" : "btn-primary"}`} onClick={togglePublish}>
                  {run.published
                    ? <><i className="bi bi-check2 me-1" aria-hidden="true" />Published — Unpublish</>
                    : <><i className="bi bi-globe2 me-1" aria-hidden="true" />Publish public demo</>}</button>
              </div>
            </div></div>

            {run.published && publicUrl && (
              <div className="alert alert-success d-flex flex-wrap align-items-center gap-2">
                <span className="small">Public demo: <a href={publicUrl} target="_blank" rel="noopener">{publicUrl}</a></span>
                <div className="ms-auto d-flex gap-2">
                  <a className="btn btn-sm btn-outline-success" href={share.whatsapp} target="_blank" rel="noopener">WhatsApp</a>
                  <a className="btn btn-sm btn-outline-primary" href={share.facebook} target="_blank" rel="noopener">Facebook</a>
                  <a className="btn btn-sm btn-outline-secondary" href={share.email}>Email</a>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? "Copied!" : "Copy link"}</button>
                </div>
              </div>
            )}

            {/* Figma-style board of screens */}
            <div className="gx-card mb-3"><div className="gx-card-body">
              <div className="d-flex align-items-center mb-2"><span className="fw-semibold">Screens ({run.files?.length})</span></div>
              <div className="d-flex flex-wrap gap-3">
                {(run.files || []).map((f: string) => (
                  <div key={f} role="button" onClick={() => setZoom(f)} className="border rounded overflow-hidden"
                    style={{ width: 220, boxShadow: zoom === f ? "0 0 0 2px var(--gx-action)" : undefined }}>
                    <div style={{ height: 150, overflow: "hidden", background: "#fff", pointerEvents: "none" }}>
                      <iframe title={f} srcDoc={htmls[f] || ""} sandbox="allow-same-origin"
                        style={{ width: 1180, height: 800, border: 0, transform: "scale(.186)", transformOrigin: "top left" }} />
                    </div>
                    <div className="small text-truncate px-2 py-1 border-top">{f}</div>
                  </div>
                ))}
              </div>
            </div></div>

            {/* Expanded preview of the selected screen */}
            {zoom && (
              <div className="gx-card"><div className="gx-card-body">
                <div className="d-flex align-items-center mb-2"><span className="fw-semibold small">{zoom}</span>
                  <span className="ms-auto btn-group btn-group-sm">
                    {DEVICES.map(([l, w]) => <button key={l} className={`btn ${device === w ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setDevice(w)}>{l}</button>)}
                  </span></div>
                {/* the surround is chrome and follows the theme; the two #fff
                    below are the PAGE the prototype renders on — a generated
                    government page is white in both themes, and tinting it
                    would misrepresent what was built */}
                <div className="border rounded d-flex justify-content-center"
                  style={{ background: "var(--gx-surface-sunken)", overflow: "auto" }}>
                  <iframe title="preview" srcDoc={htmls[zoom] || ""} sandbox="allow-same-origin" style={{ width: device, height: 640, border: 0, background: "#fff" }} />
                </div>
              </div></div>
            )}
            <div className="gx-callout mt-3">
              <i className="bi bi-exclamation-triangle" aria-hidden="true" />
              <div>
                <b>An AI-generated draft, not a finished service.</b> It needs human review before
                anyone uses it, and the score above is static analysis of the markup — a real browser
                audit only runs once it is deployed to a URL.
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div></AppShell>
  );
}
