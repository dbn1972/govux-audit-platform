"use client";
import { useEffect, useState } from "react";

import { BAND_COLOR as bandColor } from "@/lib/score";
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
    <div style={{ minHeight: "100vh", background: "var(--gx-surface-sunken)" }}>
      {/* the platform's own identity strip — this page had its own hand-rolled
          tricolour in three different oranges and greens to the rest of the app */}
      <div className="govux-strip" />
      <header className="bg-white border-bottom">
        <div className="container py-2 d-flex align-items-center flex-wrap gap-2">
          <span className="gx-brand-name">GovUX Studio</span>
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

      <div className="container gx-section" style={{ paddingBlock: "2rem" }}>
        {err && <div className="alert alert-warning">{err}</div>}
        {meta && (<>
          <div className="gx-page-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h1 className="mb-1">{meta.title}</h1>
              <div className="gx-muted">{meta.purpose}</div>
            </div>
          </div>

          <div className="gx-callout mb-4">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <div>
              <b>An AI-generated prototype, not a government service.</b> Built with GovUX Studio on
              the UX4G Design System to demonstrate a design direction. Nothing here is official, and
              no form on it submits anywhere.
            </div>
          </div>

          <div className="d-flex flex-wrap gap-3 mb-3">
            {(meta.files || []).map((f: string) => (
              <div key={f} role="button" onClick={() => setActive(f)} className="border rounded overflow-hidden bg-white"
                style={{ width: 220, boxShadow: active === f ? "0 0 0 2px var(--gx-action)" : undefined }}>
                <div style={{ height: 150, overflow: "hidden", pointerEvents: "none" }}>
                  <iframe title={f} src={src(f)} sandbox="allow-same-origin"
                    style={{ width: 1180, height: 800, border: 0, transform: "scale(.186)", transformOrigin: "top left" }} />
                </div>
                <div className="small text-truncate px-2 py-1 border-top">{f}</div>
              </div>
            ))}
          </div>

          {active && (
            <div className="gx-card"><div className="gx-card-body">
              <div className="d-flex align-items-center mb-2"><span className="fw-semibold small">{active}</span>
                <span className="ms-auto btn-group btn-group-sm">
                  {DEVICES.map(([l, w]) => <button key={l} className={`btn ${device === w ? "btn-secondary" : "btn-outline-secondary"}`} onClick={() => setDevice(w)}>{l}</button>)}
                </span></div>
              <div className="border rounded d-flex justify-content-center" style={{ background: "#f6f8fa", overflow: "auto" }}>
                <iframe title="preview" src={src(active)} sandbox="allow-same-origin" style={{ width: device, height: 680, border: 0, background: "#fff" }} />
              </div>
            </div></div>
          )}

        </>)}
      </div>
    </div>
  );
}
