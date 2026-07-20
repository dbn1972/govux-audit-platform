"use client";
import AppShell from "@/components/AppShell";

const ALERTS = [
  ["critical", "174 domains fell into Band E (critical risk)", "Highest concentration in Rural Development · avg 39"],
  ["high", "railways.gov.in dropped 9 points after a redesign", "New contrast & keyboard failures · 3 days ago"],
  ["high", "38 domains regressed ≥ 5 points this month", "Likely unreviewed content/template changes"],
  ["medium", "1,360 known domains have never been audited", "39% of the national register"],
  ["critical", "12 domains show a spike in critical accessibility failures", "Guard-rail triggered — capped at Band C"],
];
const dot: Record<string, string> = { critical: "#dc3545", high: "#fd7e14", medium: "#ffc107" };

export default function Alerts() {
  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Exception alerts</h1>
        <p className="text-secondary small">Where quality is at risk — so the programme office can intervene early.</p>
        <div className="alert alert-info d-flex align-items-center gap-2 py-2" role="note">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <span><b>Preview.</b> This view shows illustrative alerts. Live estate figures are on the
            <a href="/admin/national"> National Dashboard</a> and <a href="/admin/league"> League Table</a>.</span>
        </div>
        <div className="row g-3 mb-3">
          {[["Band E domains", 174, "#dc3545"], ["Regressed this month", 38, "#fd7e14"],
            ["Never audited", "1,360", "#ffc107"], ["New critical spikes", 12, "#dc3545"]].map(([l, v, c]) => (
            <div className="col-6 col-md-3" key={l as string}><div className="card shadow-sm" style={{ borderLeft: `4px solid ${c}` }}>
              <div className="card-body"><div className="text-secondary small">{l}</div>
                <div className="fs-3 fw-bold" style={{ color: c as string }}>{v as any}</div></div>
            </div></div>
          ))}
        </div>
        <div className="card shadow-sm"><div className="list-group list-group-flush">
          {ALERTS.map(([sev, title, sub], i) => (
            <div className="list-group-item d-flex gap-3 align-items-start" key={i}>
              <span className="rounded-circle mt-1" style={{ width: 10, height: 10, background: dot[sev as string], flex: "none" }} />
              <div className="flex-grow-1"><b>{title}</b><div className="text-secondary small">{sub}</div></div>
              <span className="badge" style={{ background: dot[sev as string] + "22", color: dot[sev as string] }}>{sev}</span>
            </div>
          ))}
        </div></div>
      </div>
    </AppShell>
  );
}
