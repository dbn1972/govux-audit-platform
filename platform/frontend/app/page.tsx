"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import { BAND_COLOR as bandCol } from "@/lib/score";

// UX4G-aligned public landing page for the FREE single-URL audit (no sign-in).
// This is the page the "UX4G Audit" link on ux4g.gov.in points to.

const NAVY = "var(--ux-navy)";

// Footer destinations. The standards point at the bodies that publish them, not
// at our summary of them: a reader checking whether we grade correctly needs the
// source, and these outlive anything we would write about them.
const FOOTER_LINKS: [string, string][] = [
  ["Accessibility", "https://www.ux4g.gov.in/foundations/accessibility"],
  ["GIGW 3.0", "https://guidelines.india.gov.in/"],
  ["WCAG 2.2 AA", "https://www.w3.org/TR/WCAG22/"],
  ["Privacy Policy", "https://www.ux4g.gov.in/privacy-policy"],
  ["Terms", "https://www.ux4g.gov.in/terms-of-use"],
  ["Contact", "https://www.ux4g.gov.in/contact"],
];
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
  const [fontScale, setFontScale] = useState(100);
  const [captcha, setCaptcha] = useState<any>(null);   // {captcha_id, question}
  const [captchaAns, setCaptchaAns] = useState("");
  const poll = useRef<any>(null);

  useEffect(() => { document.documentElement.style.fontSize = fontScale + "%"; }, [fontScale]);
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
      <a href="#scanner" className="visually-hidden-focusable position-absolute top-0 start-0 m-2 btn btn-sm btn-dark">Skip to main content</a>

      {/* Government of India top bar */}
      {/* The Government of India banner is fixed in both themes, like the
          tricolour strip: it is national identity, not our chrome, and a
          department's masthead does not lighten because a visitor prefers a
          light UI. Measured 11:1, so it needs no theme variant. */}
      <div style={{ background: "#12243b", color: "#dfe7f1" }}>
        <div className="container d-flex align-items-center justify-content-between py-1" style={{ fontSize: 12.5 }}>
          <span className="d-flex align-items-center gap-2">
            <span aria-hidden>🇮🇳</span> <b>Government of India</b>
            <span className="d-none d-sm-inline" style={{ color: "#b9c4d6" }}>| Ministry of Electronics &amp; Information Technology</span>
          </span>
          <span className="d-flex align-items-center gap-3">
            <span className="btn-group" role="group" aria-label="Text size">
              <button className="btn btn-sm btn-link text-decoration-none py-0 px-1" style={{ color: "#dfe7f1", minWidth: 30, minHeight: 24 }} onClick={() => setFontScale(s => Math.min(140, s + 10))} aria-label="Increase text size">A+</button>
              <button className="btn btn-sm btn-link text-decoration-none py-0 px-1" style={{ color: "#dfe7f1", minWidth: 30, minHeight: 24 }} onClick={() => setFontScale(100)} aria-label="Reset text size">A</button>
              <button className="btn btn-sm btn-link text-decoration-none py-0 px-1" style={{ color: "#dfe7f1", minWidth: 30, minHeight: 24 }} onClick={() => setFontScale(s => Math.max(80, s - 10))} aria-label="Decrease text size">A−</button>
            </span>
            <span className="d-none d-sm-inline">English ▾</span>
          </span>
        </div>
      </div>

      {/* Brand header */}
      <header className="bg-white border-bottom">
        <a href="#main" className="gx-skip">Skip to main content</a>
        <div className="container d-flex align-items-center justify-content-between py-2">
          <div className="d-flex align-items-center gap-2">
            <BrandMark size={40} />
            <div>
              <div className="gx-brand-name" style={{ fontSize: 18 }}>GovUX Audit</div>
              <div className="gx-brand-sub">UX4G · GIGW 3.0 · WCAG 2.2 AA</div>
            </div>
          </div>
          <nav className="d-flex align-items-center gap-3">
            <a href="#checks" className="text-decoration-none d-none d-md-inline" style={{ color: NAVY }}>What we check</a>
            <a href="#how" className="text-decoration-none d-none d-md-inline" style={{ color: NAVY }}>How it works</a>
            <ThemeToggle />
            <Link href="/login" className="btn btn-outline-primary btn-sm">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero + scanner */}
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
      <section id="scanner" className="gx-hero">
        <div className="container gx-section">
          <div className="row justify-content-center text-center">
            <div className="col-lg-9">
              <span className="badge rounded-pill px-3 py-2 mb-3" style={{ background: "var(--gx-brand-tint)", color: NAVY }}>
                Free · No sign-up · For .gov.in / .nic.in websites
              </span>
              <h1 className="gx-hero-title mb-3">Free UX4G Website Audit</h1>
              <p className="gx-hero-lead mb-4">
                Scan any government website against <b>GIGW 3.0</b>, <b>WCAG 2.2 AA accessibility</b>,
                <b> Core Web Vitals</b> and the <b>DPDP Act 2023</b> — and download a PDF report in seconds.
              </p>

              <form onSubmit={start} className="mx-auto" style={{ maxWidth: 640 }}>
                <div className="input-group input-group-lg shadow-sm">
                  <span className="input-group-text bg-white"><i className="bi bi-globe2 gx-muted" /></span>
                  <input className="form-control" placeholder="e.g. digilocker.gov.in" value={url}
                    onChange={e => setUrl(e.target.value)} aria-label="Website URL to scan" required />
                  <button className="btn btn-primary px-4" disabled={busy || !url}>
                    {busy ? <><span className="spinner-border spinner-border-sm me-2" />Scanning…</> : <><i className="bi bi-search me-2" />Scan free</>}
                  </button>
                </div>
                <div className="form-text mt-2">Only public <code>.gov.in</code> / <code>.nic.in</code> pages · one page per free scan.</div>

                {captcha && (
                  <div className="card border-warning-subtle bg-white mt-3 mx-auto text-start" style={{ maxWidth: 420 }}>
                    <div className="card-body py-3">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <i className="bi bi-shield-check text-warning" />
                        <span className="fw-semibold">Quick check</span>
                        <span className="gx-muted small">(you’ve used your free scans)</span>
                      </div>
                      <label className="form-label small mb-1">{captcha.question}</label>
                      <input className="form-control" inputMode="numeric" value={captchaAns}
                        onChange={e => setCaptchaAns(e.target.value)} placeholder="Your answer"
                        aria-label={captcha.question} />
                    </div>
                  </div>
                )}
              </form>
              {err && <div className="alert alert-warning d-inline-block mt-3 py-2" role="alert">{err}</div>}
            </div>
          </div>

          {/* live result — announced to screen readers as the scan progresses */}
          {state && (
            <div className="row justify-content-center mt-4" aria-live="polite" aria-atomic="true">
              <div className="col-lg-8">
                <div className="gx-card">
                  <div className="gx-card-body">
                    {state.status !== "completed" && state.status !== "failed" && (
                      <div className="text-center py-3">
                        <div className="spinner-border text-primary mb-2" role="status" />
                        <div className="fw-semibold" style={{ color: NAVY }}>
                          {state.status === "queued"
                            ? (state.queue_position > 0 ? `In queue — ${state.queue_position} scan${state.queue_position === 1 ? "" : "s"} ahead of you` : "You’re next in the queue…")
                            : "Scanning the page…"}
                        </div>
                        <div className="gx-muted small">Chromium · Firefox · Safari · Lighthouse · axe-core</div>
                      </div>
                    )}
                    {state.status === "failed" && (
                      <div className="text-center py-3 text-danger">This site could not be scanned (it may block automated tools).</div>
                    )}
                    {state.status === "completed" && (
                      <div className="d-flex flex-wrap align-items-center gap-4">
                        <div style={{ minWidth: 120 }}>
                          <div className="gx-label">GovUX score</div>
                          <div className="gx-score-figure" style={{ color: bandCol[band] || "var(--gx-navy-800)" }}>
                            {state.overall_score}
                          </div>
                          <div className="fw-semibold" style={{ color: bandCol[band] || "var(--gx-text-muted)" }}>
                            Band {band}
                          </div>
                          {/* the same A–E ladder the full report draws, so the
                              number means the same thing before and after sign-in */}
                          <div className="gx-scale mt-2" style={{ maxWidth: 160 }} aria-hidden="true">
                            {["A", "B", "C", "D", "E"].map(b => (
                              <span key={b} className="gx-scale-step"
                                style={b === band ? { background: bandCol[b] } : undefined} />
                            ))}
                          </div>
                        </div>
                        <div className="flex-grow-1">
                          <div className="fw-semibold" style={{ color: NAVY }}>{state.url}</div>
                          <div className="gx-muted small mb-2">
                            Scanned {state.url_scan_count} time{state.url_scan_count === 1 ? "" : "s"} on
                            GovUX · free single-page scan.
                          </div>
                          <a className="btn btn-primary" href={`/api/v1/public/scan/${scan.scan_id}/pdf`}>
                            <i className="bi bi-file-earmark-arrow-down me-2" />Download PDF report
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
      <section id="checks" className="container gx-section">
        <div className="gx-section-head">
          <h2>What every scan checks</h2>
          <p>A single deterministic engine — no black box in the score.</p>
        </div>
        <div className="row g-3">
          {CHECKS.map(([icon, title, desc]) => (
            <div className="col-md-6 col-lg-4" key={title}>
              <div className="gx-card h-100">
                <div className="gx-card-body">
                  <div className="gx-feature-icon mb-3">
                    <i className={`bi ${icon}`} aria-hidden="true" />
                  </div>
                  <h3 className="h6 fw-bold" style={{ color: NAVY }}>{title}</h3>
                  <p className="gx-muted small mb-0">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="gx-section-tint">
        <div className="container gx-section">
          <div className="gx-section-head"><h2>How it works</h2></div>
          <div className="row g-4 text-center">
            {[["1", "Paste a URL", "Any public .gov.in / .nic.in landing page — no sign-in needed."],
              ["2", "We scan &amp; queue", "One scan at a time; you’ll see your position in the queue."],
              ["3", "Get your score + PDF", "A 0–100 GovUX Score, an A–E band, and a downloadable report."]].map(([n, t, d]) => (
              <div className="col-md-4" key={n}>
                <div className="gx-step-badge mb-3">{n}</div>
                <h3 className="h6 fw-bold" style={{ color: NAVY }} dangerouslySetInnerHTML={{ __html: t }} />
                <p className="gx-muted small" dangerouslySetInnerHTML={{ __html: d }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for registered deep audits */}
      <section className="container gx-section">
        <div className="gx-cta d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div>
              <h2 className="h4 mb-1">Need a deeper audit?</h2>
              <p className="mb-0" style={{ opacity: .85, maxWidth: "60ch" }}>Sign in with your government email to scan up to 10 pages, save reports,
                track scores over time, and request larger crawls.</p>
            </div>
            <Link href="/login" className="btn btn-light btn-lg fw-semibold" style={{ color: NAVY }}>Sign in with gov email</Link>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="border-top" style={{ background: "#fff" }}>
        <div className="container py-4">
          <div className="row gy-3">
            <div className="col-md-6">
              <div className="fw-bold" style={{ color: NAVY }}>GovUX Audit Platform</div>
              <p className="gx-muted small mb-0">A MeitY / NIC initiative to raise the quality, accessibility and
                compliance of Indian government websites, aligned with UX4G and GIGW 3.0.</p>
            </div>
            <div className="col-md-6">
              <div className="d-flex flex-wrap gap-3 justify-content-md-end small">
                {/* Every one of these was href="#". On a site that fails other
                    departments for exactly this, a dead accessibility link is
                    the worst possible placeholder. RTI is dropped rather than
                    pointed somewhere approximate — a wrong RTI link is worse
                    than none. All open externally, and say so for screen
                    readers (WCAG 3.2.5). */}
                {FOOTER_LINKS.map(([label, href]) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                    className="text-decoration-none gx-muted">
                    {label}
                    <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true"
                      style={{ fontSize: ".7em" }} />
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="govux-strip" />
        <div className="text-center gx-muted py-2" style={{ fontSize: 12 }}>
          © {new Date().getFullYear()} Government of India · GovUX Audit Platform
        </div>
      </footer>
    </div>
  );
}
