"use client";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
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
          <h1 className="ux4g-mb-2xs">Design Studio</h1>
          <div className="gx-muted">
            Describe your service and Studio generates UX4G-conformant, accessible, cross-linked
            pages, refining them until they pass the audit. AI generates; the deterministic engine
            scores — the two never swap roles.
          </div>
        </div>
      </div>
      {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

      <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
        <div className="ux4g-cols-span-12 ux4g-lg-cols-span-3">
          <div className="gx-card ux4g-mb-s"><div className="gx-card-body">
            <label className="form-label" htmlFor="s-dept">Organisation</label>
            <input id="s-dept" className="ux4g-input ux4g-w-100 ux4g-mb-xs" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Department of Posts" />
            <label className="form-label" htmlFor="s-purpose">Purpose</label>
            <textarea id="s-purpose" className="ux4g-input ux4g-w-100 ux4g-mb-xs" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Citizen services portal" />
            <label className="form-label" htmlFor="s-pages">Pages (comma-separated)</label>
            <input id="s-pages" className="ux4g-input ux4g-w-100 ux4g-mb-xs" value={pagesText} onChange={e => setPagesText(e.target.value)} />
            <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-xs">
              <div className="ux4g-cols-span-6"><label className="form-label" htmlFor="s-lang">Language</label>
                <input id="s-lang" className="ux4g-input ux4g-w-100" value={language} onChange={e => setLanguage(e.target.value)} /></div>
              <div className="ux4g-cols-span-6"><label className="form-label" htmlFor="s-mode">Theme</label>
                <select id="s-mode" className="ux4g-form-select" value={mode} onChange={e => setMode(e.target.value)}>
                  <option value="light">Light</option><option value="dark">Dark</option></select></div>
            </div>
            <label className="form-label ux4g-fw-semibold small ux4g-mt-xs" htmlFor="s-accent">Accent</label>
            <select id="s-accent" className="ux4g-form-select form-select-sm ux4g-mb-s" value={accent} onChange={e => setAccent(e.target.value)}>
              {ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-w-100" onClick={submit} disabled={busy}>
              {busy ? "Generating & refining…" : "✨ Generate pages"}</button>
          </div></div>

          {history.length > 0 && (
            <div className="gx-card"><div className="gx-card-head">Your prototypes</div>
              <div className="list-group list-group-flush">
                {history.slice(0, 10).map(h => (
                  <button key={h.id} className="list-group-item list-group-item-action small ux4g-text-start" onClick={() => openRun(h.id)}>
                    <div className="ux4g-fw-semibold ux4g-line-clamp-1">{h.department || "Untitled"}</div>
                    <span className="gx-muted">{h.status === "scored" ? `${h.score} · Band ${h.band}` : h.status} · {h.pages} pages</span>
                  </button>
                ))}
              </div></div>
          )}
        </div>

        <div className="ux4g-cols-span-12 ux4g-lg-cols-span-9">
          {run == null && (
            <div className="gx-card ux4g-h-100"><div className="gx-card-body ux4g-d-flex ux4g-ai-center ux4g-jc-center gx-muted" style={{ minHeight: 400 }}>
              {busy ? <span><span className="spinner-border spinner-border-sm me-2" />Generating and auditing…</span> : "Your generated screens will appear here — like a design board."}
            </div></div>
          )}
          {run?.status === "failed" && <div className="ux4g-alert ux4g-alert-error">Generation failed: {run.error}</div>}
          {run?.status === "generating" && (
            <div className="gx-card"><div className="gx-card-body gx-empty gx-muted">
              <span className="spinner-border text-primary ux4g-mb-xs" /><div>Generating and refining toward the audit target…</div></div></div>
          )}

          {run?.status === "scored" && (<>
            <div className="gx-card ux4g-mb-s"><div className="gx-card-body ux4g-d-flex ux4g-ai-center ux4g-flex-wrap ux4g-gap-xs">
              <div><span className="score-value" style={{ fontSize: 28 }}>{run.score}</span>
                <span className="ux4g-badge-m ux4g-ml-2xs" style={bandStyle(run.band)}>Band {run.band}</span></div>
              {/* a static analysis of generated markup, not an audit of a live
                  site — saying which is the difference between a claim and a hint */}
              <span className="gx-muted small">
                Static score of the generated markup · {run.iterations} refinement{run.iterations === 1 ? "" : "s"}
                {run.billing?.cost_inr != null && <> · ₹{run.billing.cost_inr}</>}
              </span>
              <div className="ux4g-ml-auto ux4g-d-flex ux4g-gap-xs">
                <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" onClick={download}><Icon name="download" size={16} className="ux4g-mr-2xs" />Download .zip</button>
                <button className={`ux4g-btn ux4g-btn-sm ${run.published ? "ux4g-btn-outline-neutral" : "ux4g-btn-primary"}`} onClick={togglePublish}>
                  {run.published
                    ? <><Icon name="check2" size={16} className="ux4g-mr-2xs" />Published — Unpublish</>
                    : <><Icon name="globe2" size={16} className="ux4g-mr-2xs" />Publish public demo</>}</button>
              </div>
            </div></div>

            {run.published && publicUrl && (
              <div className="ux4g-alert ux4g-alert-success ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-xs">
                <span className="small">Public demo: <a href={publicUrl} target="_blank" rel="noopener">{publicUrl}</a></span>
                <div className="ux4g-ml-auto ux4g-d-flex ux4g-gap-xs">
                  <a className="ux4g-btn ux4g-btn-sm ux4g-btn-outline-neutral" href={share.whatsapp} target="_blank" rel="noopener">WhatsApp</a>
                  <a className="ux4g-btn ux4g-btn-sm ux4g-btn-outline-primary" href={share.facebook} target="_blank" rel="noopener">Facebook</a>
                  <a className="ux4g-btn ux4g-btn-sm ux4g-btn-outline-neutral" href={share.email}>Email</a>
                  <button className="ux4g-btn ux4g-btn-sm ux4g-btn-outline-neutral" onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? "Copied!" : "Copy link"}</button>
                </div>
              </div>
            )}

            {/* Figma-style board of screens */}
            <div className="gx-card ux4g-mb-s"><div className="gx-card-body">
              <div className="ux4g-d-flex ux4g-ai-center ux4g-mb-xs"><span className="ux4g-fw-semibold">Screens ({run.files?.length})</span></div>
              <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-s">
                {(run.files || []).map((f: string) => (
                  <div key={f} role="button" onClick={() => setZoom(f)} className="ux4g-b-1 ux4g-radius-m ux4g-o-hidden"
                    style={{ width: 220, boxShadow: zoom === f ? "0 0 0 2px var(--gx-action)" : undefined }}>
                    <div style={{ height: 150, overflow: "hidden", background: "#fff", pointerEvents: "none" }}>
                      <iframe title={f} srcDoc={htmls[f] || ""} sandbox="allow-same-origin"
                        style={{ width: 1180, height: 800, border: 0, transform: "scale(.186)", transformOrigin: "top left" }} />
                    </div>
                    <div className="small ux4g-line-clamp-1 ux4g-px-xs ux4g-py-2xs ux4g-bt-1">{f}</div>
                  </div>
                ))}
              </div>
            </div></div>

            {/* Expanded preview of the selected screen */}
            {zoom && (
              <div className="gx-card"><div className="gx-card-body">
                <div className="ux4g-d-flex ux4g-ai-center ux4g-mb-xs"><span className="ux4g-fw-semibold small">{zoom}</span>
                  <span className="ux4g-ml-auto ux4g-d-inline-flex ux4g-gap-2xs">
                    {DEVICES.map(([l, w]) => <button key={l} className={`ux4g-btn ux4g-btn-sm ${device === w ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`} onClick={() => setDevice(w)}>{l}</button>)}
                  </span></div>
                {/* the surround is chrome and follows the theme; the two #fff
                    below are the PAGE the prototype renders on — a generated
                    government page is white in both themes, and tinting it
                    would misrepresent what was built */}
                <div className="ux4g-b-1 ux4g-radius-m ux4g-d-flex ux4g-jc-center"
                  style={{ background: "var(--gx-surface-sunken)", overflow: "auto" }}>
                  <iframe title="preview" srcDoc={htmls[zoom] || ""} sandbox="allow-same-origin" style={{ width: device, height: 640, border: 0, background: "#fff" }} />
                </div>
              </div></div>
            )}
            <div className="gx-callout ux4g-mt-s">
              <Icon name="exclamation-triangle" size={20} />
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
