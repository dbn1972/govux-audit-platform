"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import SiteFooter from "@/components/SiteFooter";
import GovBanner from "@/components/GovBanner";
import SiteHeader from "@/components/SiteHeader";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { BAND_COLOR as bandCol } from "@/lib/score";

// UX4G-aligned public landing page for the FREE single-URL audit (no sign-in).
// This is the page the "UX4G Audit" link on ux4g.gov.in points to.

const NAVY = "var(--gx-navy-800)";

const CHECKS = [
  ["bi-universal-access-circle", "Accessibility — WCAG 2.2 AA", "Colour contrast, labels, alt text, keyboard and screen-reader support (axe-core)."],
  ["bi-bank", "GIGW 3.0", "Mandatory government-website elements: policies, contacts, RTI, search, metadata."],
  ["bi-speedometer2", "Core Web Vitals", "Real load speed (LCP), responsiveness and layout stability, via Lighthouse."],
  ["bi-shield-lock", "DPDP Act 2023 & security", "Reads the privacy notice for data-protection duties; checks HTTPS and security headers."],
  ["bi-phone", "Responsive & tap-target", "Works on mobile, tablet and desktop; WCAG 2.5.8 touch-target sizing."],
  ["bi-browser-chrome", "Cross-browser", "Rendered in Chrome, Firefox and Safari/WebKit to catch browser-specific breakage."],
];

export default function ScanLanding() {
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<any>(null);       // {scan_id,...}
  const [state, setState] = useState<any>(null);      // status payload
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<any>(null);   // {captcha_id, question}
  const [captchaAns, setCaptchaAns] = useState("");
  const poll = useRef<any>(null);

  useEffect(() => () => clearInterval(poll.current), []);

  function preCheck(raw: string): string | null {
    // instant client-side mirror of the server validator (server re-validates + SSRF-guards)
    let u = raw.trim();
    if (!u) return "Please enter a website address.";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = "https://" + u;
    let host: string;
    try {
      const parsed = new URL(u);
      if (!/^https?:$/i.test(parsed.protocol)) return "Only http and https addresses can be scanned.";
      host = parsed.hostname.toLowerCase();
    } catch { return "That doesn't look like a valid website address."; }
    if (!host || !host.includes(".")) return "That doesn't look like a valid website address.";
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":"))
      return "Enter a domain name (e.g. example.gov.in), not an IP address.";
    if (!/(\.gov\.in|\.nic\.in)$/i.test(host))
      return "Only .gov.in and .nic.in websites can be scanned.";
    return null;
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setState(null); setScan(null);
    const problem = preCheck(url);
    if (problem) { setErr(problem); return; }
    setBusy(true);
    clearInterval(poll.current);
    try {
      const payload: any = { url };
      if (captcha && captchaAns) payload.captcha = `${captcha.captcha_id}:${captchaAns}`;
      const r = await fetch("/api/v1/public/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        const det = d.detail;
        if (det && typeof det === "object" && det.captcha_required) {
          // free quota used up — fetch a challenge and ask the user to solve it
          const ch = await fetch("/api/v1/public/captcha").then(x => x.json());
          setCaptcha(ch); setCaptchaAns("");
          setErr(det.message || "Please solve the CAPTCHA to continue.");
        } else {
          setErr(typeof det === "string" ? det : "Could not start the scan.");
        }
        setBusy(false); return;
      }
      setCaptcha(null); setCaptchaAns("");
      setScan(d); setState({ status: "queued", queue_position: d.queue_position });
      poll.current = setInterval(async () => {
        const s = await fetch(`/api/v1/public/scan/${d.scan_id}`).then(x => x.json());
        setState(s);
        if (s.status === "completed" || s.status === "failed") { clearInterval(poll.current); setBusy(false); }
      }, 3000);
    } catch { setErr("Network error — please try again."); setBusy(false); }
  }

  const band = state?.band;

  return (
    <div>
      <GovBanner />

      <SiteHeader />

      {/* Hero + scanner */}
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
      <section id="scanner" className="gx-hero">
        <div className="ux4g-container gx-section">
          <div className="ux4g-text-center ux4g-mx-auto" style={{ maxWidth: 820 }}>
            <div>
              <span className="ux4g-tag-tonal-primary ux4g-tag-s ux4g-radius-full ux4g-mx-auto ux4g-mb-s" style={{ background: "var(--gx-brand-tint)", color: NAVY }}>
                Free · No sign-up · For .gov.in / .nic.in websites
              </span>
              <h1 className="gx-hero-title ux4g-mb-s">Free UX4G Website Audit</h1>
              <p className="gx-hero-lead ux4g-mb-m">
                Scan any government website against <b>GIGW 3.0</b>, <b>WCAG 2.2 AA accessibility</b>,
                <b> Core Web Vitals</b> and the <b>DPDP Act 2023</b> — and download a PDF report in seconds.
              </p>

              <form onSubmit={start} className="ux4g-mx-auto" style={{ maxWidth: 640 }}>
                <div className="ux4g-d-flex ux4g-gap-xs ux4g-ai-end">
                  <div className="ux4g-input-container ux4g-input-lg ux4g-input-default ux4g-flex-grow-1">
                    <div className="ux4g-input">
                      <span className="ux4g-input-leading-icon" aria-hidden="true"><Icon name="globe2" size={16} className="gx-muted" /></span>
                      <input className="ux4g-input-input" placeholder="e.g. digilocker.gov.in" value={url}
                        onChange={e => setUrl(e.target.value)} aria-label="Website URL to scan" required />
                    </div>
                  </div>
                  <button className="ux4g-btn ux4g-btn-primary ux4g-btn-lg ux4g-px-m" disabled={busy || !url}>
                    {busy ? <><Spinner size="sm" className="ux4g-mr-xs" />Scanning…</> : <><Icon name="search" size={16} className="ux4g-mr-xs" />Scan free</>}
                  </button>
                </div>
                <div className="ux4g-input-helper ux4g-mt-xs"><span className="ux4g-input-helper-text">Only public <code>.gov.in</code> / <code>.nic.in</code> pages · one page per free scan.</span></div>

                {captcha && (
                  <div className="gx-card ux4g-mt-s ux4g-mx-auto ux4g-text-start" style={{ maxWidth: 420 }}>
                    <div className="gx-card-body ux4g-py-s">
                      <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs ux4g-mb-xs">
                        <Icon name="shield-check" size={16} className="ux4g-text-warning" />
                        <span className="ux4g-fw-semibold">Quick check</span>
                        <span className="gx-muted ux4g-fs-14">(you’ve used your free scans)</span>
                      </div>
                      <div className="ux4g-input-container ux4g-input-md ux4g-input-default">
                        <label className="ux4g-label-m-default ux4g-fs-14 ux4g-mb-2xs">{captcha.question}</label>
                        <div className="ux4g-input">
                          <input className="ux4g-input-input" inputMode="numeric" value={captchaAns}
                            onChange={e => setCaptchaAns(e.target.value)} placeholder="Your answer"
                            aria-label={captcha.question} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form>
              {err && <div className="ux4g-alert ux4g-alert-warning ux4g-d-inline-block ux4g-mt-s ux4g-py-xs" role="alert">{err}</div>}
            </div>
          </div>

          {/* live result — announced to screen readers as the scan progresses */}
          {state && (
            <div className="ux4g-d-flex ux4g-jc-center ux4g-mt-m" aria-live="polite" aria-atomic="true">
              <div className="ux4g-w-100" style={{ maxWidth: 720 }}>
                <div className="gx-card">
                  <div className="gx-card-body">
                    {state.status !== "completed" && state.status !== "failed" && (
                      <div className="ux4g-text-center ux4g-py-s">
                        <Spinner className="ux4g-mb-xs" />
                        <div className="ux4g-fw-semibold" style={{ color: NAVY }}>
                          {state.status === "queued"
                            ? (state.queue_position > 0 ? `In queue — ${state.queue_position} scan${state.queue_position === 1 ? "" : "s"} ahead of you` : "You’re next in the queue…")
                            : "Scanning the page…"}
                        </div>
                        <div className="gx-muted ux4g-fs-14">Chromium · Firefox · Safari · Lighthouse · axe-core</div>
                      </div>
                    )}
                    {state.status === "failed" && (
                      <div className="ux4g-text-center ux4g-py-s ux4g-text-error">This site could not be scanned (it may block automated tools).</div>
                    )}
                    {state.status === "completed" && (
                      <div className="ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-m">
                        <div style={{ minWidth: 120 }}>
                          <div className="gx-label">GovUX score</div>
                          <div className="gx-score-figure" style={{ color: bandCol[band] || "var(--gx-navy-800)" }}>
                            {state.overall_score}
                          </div>
                          <div className="ux4g-fw-semibold" style={{ color: bandCol[band] || "var(--gx-text-muted)" }}>
                            Band {band}
                          </div>
                          {/* the same A–E ladder the full report draws, so the
                              number means the same thing before and after sign-in */}
                          <div className="gx-scale ux4g-mt-xs" style={{ maxWidth: 160 }} aria-hidden="true">
                            {["A", "B", "C", "D", "E"].map(b => (
                              <span key={b} className="gx-scale-step"
                                style={b === band ? { background: bandCol[b] } : undefined} />
                            ))}
                          </div>
                        </div>
                        <div className="ux4g-flex-grow-1">
                          <div className="ux4g-fw-semibold" style={{ color: NAVY }}>{state.url}</div>
                          <div className="gx-muted ux4g-fs-14 ux4g-mb-xs">
                            Scanned {state.url_scan_count} time{state.url_scan_count === 1 ? "" : "s"} on
                            GovUX · free single-page scan.
                          </div>
                          <a className="ux4g-btn ux4g-btn-primary ux4g-btn-md" href={`/api/v1/public/scan/${scan.scan_id}/pdf`}>
                            <Icon name="file-earmark-arrow-down" size={16} className="ux4g-mr-xs" />Download PDF report
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* What we check */}
      <section id="checks" className="ux4g-container gx-section">
        <div className="gx-section-head">
          <h2>What every scan checks</h2>
          <p>A single deterministic engine — no black box in the score.</p>
        </div>
        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          {CHECKS.map(([icon, title, desc]) => (
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-6 ux4g-lg-cols-span-4" key={title}>
              <div className="gx-card ux4g-h-100">
                <div className="gx-card-body">
                  <div className="gx-feature-icon ux4g-mb-s">
                    <Icon name={icon} size={24} />
                  </div>
                  <h3 className="ux4g-heading-2xs-strong ux4g-fw-bold" style={{ color: NAVY }}>{title}</h3>
                  <p className="gx-muted ux4g-fs-14 ux4g-mb-none">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="gx-section-tint">
        <div className="ux4g-container gx-section">
          <div className="gx-section-head"><h2>How it works</h2></div>
          <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-m ux4g-text-center">
            {[["1", "Paste a URL", "Any public .gov.in / .nic.in landing page — no sign-in needed."],
              ["2", "We scan &amp; queue", "One scan at a time; you’ll see your position in the queue."],
              ["3", "Get your score + PDF", "A 0–100 GovUX Score, an A–E band, and a downloadable report."]].map(([n, t, d]) => (
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-4" key={n}>
                <div className="gx-step-badge ux4g-mb-s">{n}</div>
                <h3 className="ux4g-heading-2xs-strong ux4g-fw-bold" style={{ color: NAVY }} dangerouslySetInnerHTML={{ __html: t }} />
                <p className="gx-muted ux4g-fs-14" dangerouslySetInnerHTML={{ __html: d }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for registered deep audits */}
      <section className="ux4g-container gx-section">
        <div className="gx-cta ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-jc-between ux4g-gap-s">
            <div>
              <h2 className="ux4g-heading-xs-strong ux4g-mb-2xs">Need a deeper audit?</h2>
              <p className="ux4g-mb-none" style={{ opacity: .85, maxWidth: "60ch" }}>Sign in with your government email to scan up to 10 pages, save reports,
                track scores over time, and request larger crawls.</p>
            </div>
            {/* light-on-dark CTA button: no ux4g light variant, colours inline (Rule 7) */}
            <Link href="/login" className="ux4g-btn ux4g-btn-lg ux4g-fw-semibold"
              style={{ background: "#fff", color: NAVY, border: "1px solid #fff" }}>Sign in with gov email</Link>
        </div>
      </section>

      </main>

      <SiteFooter />
    </div>
  );
}
