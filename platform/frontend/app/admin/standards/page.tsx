"use client";
import AppShell from "@/components/AppShell";

const WEIGHTS = [
  ["Accessibility (WCAG 2.2 AA)", 22], ["Usability & UX heuristics", 17], ["GIGW 3.0 compliance", 15],
  ["Design foundation — UX4G", 11], ["Performance / Core Web Vitals", 12],
  ["Responsiveness & Compatibility", 10], ["Content quality & readability", 7], ["Trust, security & privacy", 6],
];

export default function Standards() {
  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">
              Standards &amp; rules engine
              <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-ml-xs" style={{ verticalAlign: "middle" }}>v3.2</span>
            </h1>
            <div className="gx-muted">
              The weights and rule sets every score is produced from. Versioned and change-logged,
              because a score is only comparable against others computed the same way.
            </div>
          </div>
          <div className="gx-actions">
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md">Publish new version</button>
          </div>
        </div>
        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-7"><div className="ux4g-card ux4g-card-solid ux4g-card-outline">
            <div className="ux4g-card-header">
              <h2>Category weights</h2>
              <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>must total 100%</span>
            </div>
            <div className="ux4g-card-body">
              {WEIGHTS.map(([name, wt]) => (
                <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-s ux4g-my-xs" key={name as string}>
                  <div style={{ width: 220, fontSize: 13 }}>{name}</div>
                  <div className="gx-score-bar ux4g-flex-grow-1"><i style={{ width: `${(wt as number) * 4}%`, background: "var(--ux4g-bg-primary-strong)" }} /></div>
                  <b style={{ width: 40, textAlign: "right", color: "var(--ux4g-text-brand-primary-default)" }}>{wt}%</b>
                </div>
              ))}
              <div className="ux4g-alert ux4g-alert-info ux4g-fs-14 ux4g-mt-xs ux4g-mb-none">
                ℹ Weight changes apply only to <b>future</b> audits and create a new engine version. Past scores stay tied to their version.
              </div>
            </div>
          </div></div>
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-5"><div className="ux4g-card ux4g-card-solid ux4g-card-outline">
            <div className="ux4g-card-header">Guard-rail rules</div>
            <div className="ux4g-card-body">
              {[["Critical accessibility failure caps at Band C", true],
                ["No HTTPS caps at Band D", true],
                ["Missing mandatory GIGW elements caps at Band B", false]].map(([label, on]) => (
                <label className="ux4g-switch ux4g-switch-md" key={label as string}>
                  <input className="ux4g-switch-input" type="checkbox" defaultChecked={on as boolean} />
                  <div className="ux4g-switch-control"><span className="ux4g-switch-track"><span className="ux4g-switch-thumb"></span></span></div>
                  <div className="ux4g-switch-content"><span className="ux4g-switch-label ux4g-fs-14">{label}</span></div>
                </label>
              ))}
              <div className="ux4g-alert ux4g-alert-warning ux4g-fs-14 ux4g-mt-s ux4g-mb-none">🔐 Only Programme-Admins can publish; changes require a second approver.</div>
            </div>
          </div></div>
        </div>
      </div>
    </AppShell>
  );
}
