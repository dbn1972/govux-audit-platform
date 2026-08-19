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
      <div className="gx-page">
        <div className="d-flex align-items-center mb-2">
          <h1 className="h3 mb-0">Standards &amp; rules engine</h1>
          <span className="badge text-bg-primary-subtle ms-2">Active: v3.2</span>
          <button className="btn btn-primary ms-auto">Publish new version</button>
        </div>
        <p className="text-secondary small">Governance-controlled. Category weights and rule sets are versioned; changes are logged.</p>
        <div className="row g-3">
          <div className="col-lg-7"><div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">Category weights <span className="text-secondary small">— must total 100%</span></div>
            <div className="card-body">
              {WEIGHTS.map(([name, wt]) => (
                <div className="d-flex align-items-center gap-3 my-2" key={name as string}>
                  <div style={{ width: 220, fontSize: 13 }}>{name}</div>
                  <div className="score-bar flex-grow-1"><i style={{ width: `${(wt as number) * 4}%`, background: "#0d6efd" }} /></div>
                  <b style={{ width: 40, textAlign: "right", color: "var(--ux-navy)" }}>{wt}%</b>
                </div>
              ))}
              <div className="alert alert-light border small mt-2 mb-0">
                ℹ Weight changes apply only to <b>future</b> audits and create a new engine version. Past scores stay tied to their version.
              </div>
            </div>
          </div></div>
          <div className="col-lg-5"><div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">Guard-rail rules</div>
            <div className="card-body">
              {[["Critical accessibility failure caps at Band C", true],
                ["No HTTPS caps at Band D", true],
                ["Missing mandatory GIGW elements caps at Band B", false]].map(([label, on]) => (
                <div className="form-check form-switch" key={label as string}>
                  <input className="form-check-input" type="checkbox" defaultChecked={on as boolean} />
                  <label className="form-check-label small">{label}</label>
                </div>
              ))}
              <div className="alert alert-warning small mt-3 mb-0">🔐 Only Programme-Admins can publish; changes require a second approver.</div>
            </div>
          </div></div>
        </div>
      </div>
    </AppShell>
  );
}
