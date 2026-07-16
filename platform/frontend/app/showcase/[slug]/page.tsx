"use client";
import { useEffect, useState } from "react";

const bandColor: Record<string, string> = { A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c" };
const DEVICES: [string, number][] = [["Mobile", 375], ["Tablet", 768], ["Desktop", 1180]];

export default function Showcase({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const [meta, setMeta] = useState<any>(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState("");
  const [device, setDevice] = useState(1180);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/public/showcase/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(m => { setMeta(m); setActive((m.files || [])[0] || ""); })
      .catch(() => setErr("This showcase is not available (it may have been unpublished)."));
  }, [slug]);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `${meta?.title || "Government prototype"} — a GovUX Studio demo`;
  const src = (f: string) => `/api/v1/public/showcase/${slug}/${f}`;

  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fa" }}>
      <div style={{ height: 4, background: "linear-gradient(90deg,#ff7700 33%,#fff 33% 66%,#008000 66%)" }} />
      <header className="bg-white border-bottom">
        <div className="container py-2 d-flex align-items-center flex-wrap gap-2">
          <span className="fw-bold" style={{ color: "#4a2bc2" }}>GovUX Studio</span>
          <span className="text-secondary small">· public demo · AI-generated draft</span>
          {meta && <span className="badge ms-2" style={{ background: (bandColor[meta.band] || "#5c636a") + "22", color: bandColor[meta.band] || "#5c636a" }}>GovUX {meta.score} · Band {meta.band}</span>}
          <div className="ms-auto d-flex gap-2">
            <a className="btn btn-sm btn-outline-success" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`}>WhatsApp</a>
            <a className="btn btn-sm btn-outline-primary" target="_blank" rel="noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>Facebook</a>
            <a className="btn btn-sm btn-outline-secondary" href={`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + "\n\n" + url)}`}>Email</a>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied!" : "Copy link"}</button>
          </div>
        </div>
      </header>

      <div className="container py-4">
        {err && <div className="alert alert-warning">{err}</div>}
        {meta && (<>
          <h1 className="h3" style={{ color: "#171717" }}>{meta.title}</h1>
          <p className="text-secondary">{meta.purpose}</p>

          <div className="d-flex flex-wrap gap-3 mb-3">
            {(meta.files || []).map((f: string) => (
              <div key={f} role="button" onClick={() => setActive(f)} className="border rounded overflow-hidden bg-white"
                style={{ width: 220, boxShadow: active === f ? "0 0 0 2px #4a2bc2" : undefined }}>
                <div style={{ height: 150, overflow: "hidden", pointerEvents: "none" }}>
                  <iframe title={f} src={src(f)} sandbox="allow-same-origin"
                    style={{ width: 1180, height: 800, border: 0, transform: "scale(.186)", transformOrigin: "top left" }} />
                </div>
                <div className="small text-truncate px-2 py-1 border-top">{f}</div>
              </div>
            ))}
          </div>

          {active && (
            <div className="card shadow-sm"><div className="card-body">
              <div className="d-flex align-items-center mb-2"><span className="fw-semibold small">{active}</span>
                <span className="ms-auto btn-group btn-group-sm">
                  {DEVICES.map(([l, w]) => <button key={l} className={`btn ${device === w ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setDevice(w)}>{l}</button>)}
                </span></div>
              <div className="border rounded d-flex justify-content-center" style={{ background: "#f6f8fa", overflow: "auto" }}>
                <iframe title="preview" src={src(active)} sandbox="allow-same-origin" style={{ width: device, height: 680, border: 0, background: "#fff" }} />
              </div>
            </div></div>
          )}
          <p className="text-secondary small mt-3">This is an AI-generated prototype for demonstration, built with GovUX Studio on the UX4G Design System. Not an official government website.</p>
        </>)}
      </div>
    </div>
  );
}
