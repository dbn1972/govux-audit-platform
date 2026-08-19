"use client";
import AppShell from "@/components/AppShell";
import { BAND_COLOR, barColor } from "@/lib/score";

// The illustrative twin of /audits/[id]/report — same components, same order,
// invented numbers. It has to look like the real thing or it teaches the wrong
// shape: this is what a first-time visitor is shown before they own an audit.
const CATS: [string, number, number][] = [
  ["Accessibility", 22, 58], ["Usability & UX", 17, 65], ["GIGW 3.0", 15, 72],
  ["Design / UX4G", 11, 67], ["Performance/CWV", 12, 62],
  ["Responsiveness & Compat.", 10, 61], ["Content quality", 7, 61], ["Trust & security", 6, 71],
];
const BANDS = ["A", "B", "C", "D", "E"] as const;
const SEVERITIES: [string, number, string][] = [
  ["Critical", 2, BAND_COLOR.E], ["High", 3, BAND_COLOR.D],
  ["Medium", 3, BAND_COLOR.C], ["Low", 2, "#5c636a"],
];

export default function SampleReport() {
  const cats = CATS.map(([label, weight, score]) => ({
    label, weight, score, lost: ((100 - score) * weight) / 100,
  })).sort((a, b) => b.lost - a.lost);

  // Reached from the sidebar under Audits, so it needs the sidebar: this page
  // rendered bare, leaving a signed-in reader on a screen with no way back.
  return (
    <AppShell><div className="gx-page gx-stack">
      <div className="alert alert-info d-flex align-items-center gap-2" role="note">
        <i className="bi bi-info-circle" aria-hidden="true" />
        <span><b>Sample report.</b> An illustrative example of what a GovUX report looks like — not a
          real audit. Run one from <a href="/audits/new">New Audit</a> to see your own results.</span>
      </div>

      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mb-1">example.gov.in</h1>
          <div className="gx-muted">Illustrative data · Engine v3.2 · GIGW 3.0 · WCAG 2.2 AA · UX4G · CWV</div>
        </div>
        <div className="gx-actions">
          <a href="/audits/new" className="btn btn-primary">
            <i className="bi bi-play-fill me-1" aria-hidden="true" />Run a real audit
          </a>
        </div>
      </div>

      <div className="gx-verdict">
        <div className="gx-card"><div className="gx-card-body">
          <div className="gx-score">
            <div>
              <div className="gx-label">GovUX score</div>
              <div className="gx-score-figure" style={{ color: BAND_COLOR.C }}>63.9</div>
              <div className="fw-semibold" style={{ color: BAND_COLOR.C }}>Band C</div>
            </div>
            <div className="flex-grow-1" style={{ minWidth: 240 }}>
              <div className="gx-scale" aria-hidden="true">
                {BANDS.map((b) => (
                  <span key={b} className="gx-scale-step"
                    style={b === "C" ? { background: BAND_COLOR.C } : undefined} />
                ))}
              </div>
              <div className="gx-scale-labels" aria-hidden="true">
                {BANDS.map((b) => <span key={b}>{b}</span>)}
              </div>
              <p className="gx-muted mt-3 mb-0" style={{ fontSize: ".875rem" }}>
                Weighted across 8 categories from 10 audited pages. Most of the gap is
                in <b>Accessibility</b> — 9.2 of the 36.1 points lost.
              </p>
            </div>
          </div>
          <div className="gx-callout mt-4">
            <i className="bi bi-shield-fill-exclamation" aria-hidden="true" />
            <div>
              <b>Guard-rail active — band capped at C.</b> A critical accessibility or trust failure
              holds the band down regardless of the weighted score, and lifts as soon as it is fixed.
            </div>
          </div>
        </div></div>

        <div className="gx-card"><div className="gx-card-body">
          <div className="gx-label">Legal compliance verdict</div>
          <div className="h4 mt-2 mb-1" style={{ color: "var(--gx-navy-800)" }}>partially compliant</div>
          <div className="gx-muted" style={{ fontSize: ".875rem" }}>Evidence: automated only</div>
          <hr className="my-3" />
          <p className="gx-muted mb-0" style={{ fontSize: ".8125rem" }}>
            A separate judgement from the score. Automated evidence alone can never carry a site past
            a <b>partial</b> verdict — full conformance needs an assessor to certify the checks a
            machine cannot make.
          </p>
        </div></div>
      </div>

      <div className="gx-sev">
        {SEVERITIES.map(([label, count, colour]) => (
          <div key={label} className="gx-sev-tile" style={{ color: colour }}>
            <div>
              <div className="gx-sev-count">{count}</div>
              <span className="gx-sev-name">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="gx-card">
        <div className="gx-card-head">
          <h2>Where the points went</h2>
          <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>Ordered by points lost</span>
        </div>
        <div>
          {cats.map((c) => (
            <div className="gx-cat" key={c.label}>
              <div>
                <div style={{ fontWeight: 600, fontSize: ".9375rem" }}>{c.label}</div>
                <div className="gx-muted" style={{ fontSize: ".75rem" }}>Weight {c.weight}%</div>
              </div>
              <span className="gx-meter">
                <span style={{ width: `${c.score}%`, background: barColor(c.score) }} />
              </span>
              <span className="gx-cat-score" style={{ color: barColor(c.score) }}>{c.score}</span>
              <span className="gx-cat-cost">−{c.lost.toFixed(1)} pts</span>
            </div>
          ))}
        </div>
      </div>

      <p className="gx-muted" style={{ fontSize: ".875rem" }}>
        Prioritised issues, remediation plans, cross-browser compatibility and page-coverage views
        appear on a real report.
      </p>
    </div></AppShell>
  );
}
