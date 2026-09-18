"use client";
import { useEffect, useState } from "react";

import { BAND_COLOR as bandColor, bandStyle } from "@/lib/score";
import SiteFooter from "@/components/SiteFooter";
import GovBanner from "@/components/GovBanner";
import Icon from "@/components/Icon";
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
    <div style={{ minHeight: "100vh", background: "var(--ux4g-bg-neutral)" }}>
      <GovBanner />
      <header className="ux4g-bg-neutral-elevated ux4g-bb-1">
        <div className="ux4g-container ux4g-py-xs ux4g-d-flex ux4g-ai-center ux4g-flex-wrap ux4g-gap-xs">
          <span className="gx-brand-name">GovUX Studio</span>
          <span className="gx-muted ux4g-fs-14">· public demo · AI-generated draft</span>
          {meta && <span className="gx-pill ux4g-ml-xs" style={bandStyle(meta.band)}>GovUX {meta.score} · Band {meta.band}</span>}
          <div className="ux4g-ml-auto ux4g-d-flex ux4g-gap-xs">
            <a className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" target="_blank" rel="noopener" href={`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`}>WhatsApp</a>
            <a className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" target="_blank" rel="noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}>Facebook</a>
            <a className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" href={`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + "\n\n" + url)}`}>Email</a>
            <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied!" : "Copy link"}</button>
          </div>
        </div>
      </header>

      <div className="ux4g-container gx-section" style={{ paddingBlock: "2rem" }}>
        {err && <div className="ux4g-alert ux4g-alert-warning">{err}</div>}
        {meta && (<>
          <div className="gx-page-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h1 className="ux4g-mb-2xs">{meta.title}</h1>
              <div className="gx-muted">{meta.purpose}</div>
            </div>
          </div>

          <div className="gx-callout ux4g-mb-m">
            <Icon name="info-circle" size={20} />
            <div>
              <b>An AI-generated prototype, not a government service.</b> Built with GovUX Studio on
              the UX4G Design System to demonstrate a design direction. Nothing here is official, and
              no form on it submits anywhere.
            </div>
          </div>

          <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-s ux4g-mb-s">
            {(meta.files || []).map((f: string) => (
              <div key={f} role="button" onClick={() => setActive(f)} className="ux4g-b-1 ux4g-radius-m ux4g-o-hidden ux4g-bg-neutral-elevated"
                style={{ width: 220, boxShadow: active === f ? "0 0 0 2px var(--ux4g-border-color-primary-default)" : undefined }}>
                <div style={{ height: 150, overflow: "hidden", pointerEvents: "none" }}>
                  <iframe title={f} src={src(f)} sandbox="allow-same-origin"
                    style={{ width: 1180, height: 800, border: 0, transform: "scale(.186)", transformOrigin: "top left" }} />
                </div>
                <div className="ux4g-fs-14 ux4g-line-clamp-1 ux4g-px-xs ux4g-py-2xs ux4g-bt-1">{f}</div>
              </div>
            ))}
          </div>

          {active && (
            <div className="gx-card"><div className="gx-card-body">
              <div className="ux4g-d-flex ux4g-ai-center ux4g-mb-xs"><span className="ux4g-fw-semibold ux4g-fs-14">{active}</span>
                <span className="ux4g-ml-auto ux4g-d-inline-flex ux4g-gap-2xs">
                  {DEVICES.map(([l, w]) => <button key={l} className={`ux4g-btn ux4g-btn-sm ${device === w ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`} onClick={() => setDevice(w)}>{l}</button>)}
                </span></div>
              <div className="ux4g-b-1 ux4g-radius-m ux4g-d-flex ux4g-jc-center" style={{ background: "#f6f8fa", overflow: "auto" }}>
                <iframe title="preview" src={src(active)} sandbox="allow-same-origin" style={{ width: device, height: 680, border: 0, background: "#fff" }} />
              </div>
            </div></div>
          )}

        </>)}
      </div>
      <SiteFooter />
    </div>
  );
}
