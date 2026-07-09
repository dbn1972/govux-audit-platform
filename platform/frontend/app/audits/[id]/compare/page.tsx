"use client";
import AppShell from "@/components/AppShell";

const COVERAGE = [
  { url: "/ (home)", status: "Analysed", score: 68, d: "▼4" },
  { url: "/savings-schemes", status: "Analysed", score: 61, d: "▲7" },
  { url: "/apply", status: "Analysed", score: 44, d: "▲3" },
  { url: "/branch-locator", status: "Timed out", score: null, d: "retry" },
  { url: "/admin/*", status: "Skipped", score: null, d: "robots.txt" },
];

export default function Compare() {
  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Compare &amp; page coverage</h1>
        <p className="text-secondary small">Diff two dated snapshots + per-page coverage.</p>
        <div className="alert alert-info d-flex align-items-center gap-2" role="note">
          <i className="bi bi-info-circle" />
          <span><b>Illustrative sample.</b> Snapshot-diff and per-page coverage are on the roadmap;
            the figures below are example data, not this audit&rsquo;s results.</span>
        </div>
        <div className="row g-3 mb-3">
          {[["Overall change", "+5.9", "58 → 63.9"], ["New issues", "+3", "since last run"],
            ["Resolved", "−11", "fixes confirmed"], ["Coverage", "94%", "47 / 50 pages"]].map(([l, v, s]) => (
            <div className="col-6 col-md-3" key={l as string}><div className="card shadow-sm"><div className="card-body">
              <div className="text-secondary small fw-semibold">{l}</div>
              <div className="fs-4 fw-bold" style={{ color: "var(--ux-navy)" }}>{v as any}</div>
              <div className="text-secondary small">{s}</div>
            </div></div></div>
          ))}
        </div>
        <div className="card shadow-sm">
          <div className="card-header bg-white fw-semibold">Page-wise coverage</div>
          <div className="table-responsive"><table className="table table-hover align-middle mb-0">
            <thead className="table-light"><tr><th>Page</th><th>Status</th><th>Score</th><th>Δ</th></tr></thead>
            <tbody>{COVERAGE.map(p => (
              <tr key={p.url}><td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{p.url}</td>
                <td><span className="badge text-bg-light">{p.status}</span></td>
                <td className="fw-bold">{p.score ?? "—"}</td><td className="text-secondary small">{p.d}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="card-footer bg-white small text-secondary">
            3 pages not analysed: 1 timed out (retry queued → may yield a partial result), 2 excluded by robots.txt.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
