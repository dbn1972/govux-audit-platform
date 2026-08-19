"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

import { BAND_COLOR as bandBg } from "@/lib/score";

const BANDS = ["A", "B", "C", "D", "E"] as const;
const BAND_MEANING: Record<string, string> = {
  A: "Exemplary", B: "Good", C: "Needs work", D: "Poor", E: "Critical",
};

export default function National() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.national().then(setD).catch((e) => setErr(e?.message || "Could not load national data."));
  }, []);

  if (err) return <AppShell><div className="gx-page"><div className="alert alert-warning" role="alert">{err}</div></div></AppShell>;
  if (!d) return <AppShell><div className="gx-page text-center"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div></AppShell>;

  const dist = d.band_distribution || {};
  const scored = BANDS.reduce((t, b) => t + Number(dist[b] || 0), 0);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">National digital-service quality</h1>
            <div className="gx-muted">Live across all audited .gov.in / .nic.in domains</div>
          </div>
          <div className="gx-actions">
            <Link href="/admin/bulk-scan" className="btn btn-outline-secondary">
              <i className="bi bi-collection me-1" aria-hidden="true" />Bulk scan
            </Link>
            <button type="button" className="btn btn-primary">
              <i className="bi bi-download me-1" aria-hidden="true" />Export brief
            </button>
          </div>
        </div>

        <div className="gx-stats">
          {[["Domains audited", d.audited, `${d.coverage_pct}% of the register`],
            ["National avg. score", d.avg_score ?? "—", "GovUX score"],
            ["Band E (critical)", dist.E ?? 0, "need intervention"],
            ["Register size", d.domains_total, "known domains"]].map(([l, v, s]) => (
            <div className="gx-stat" key={l as string}>
              <div className="gx-label">{l as string}</div>
              <div className="gx-stat-value">{v as any}</div>
              <div className="gx-stat-note">{s as string}</div>
            </div>
          ))}
        </div>

        <div className="row g-3">
          <div className="col-lg-7">
            <div className="gx-card h-100">
              <div className="gx-card-head">
                <h2>Score distribution</h2>
                <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>
                  {scored} scored domain{scored === 1 ? "" : "s"}
                </span>
              </div>
              {/* Horizontal, and every band is always drawn. The vertical chart
                  this replaces scaled to the tallest bar, so a single audited
                  domain became one enormous block and the four empty bands
                  vanished — the estate looked like it had no distribution at
                  all rather than one with four gaps in it. */}
              <div className="gx-card-body">
                {scored === 0 ? (
                  <p className="gx-muted mb-0">
                    No scored audits yet. The distribution appears here as domains are audited.
                  </p>
                ) : BANDS.map((b) => {
                  const n = Number(dist[b] || 0);
                  const share = scored ? (n / scored) * 100 : 0;
                  return (
                    <div className="gx-cat" key={b} style={{ paddingInline: 0 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: bandBg[b] }}>Band {b}</div>
                        <div className="gx-muted" style={{ fontSize: ".75rem" }}>{BAND_MEANING[b]}</div>
                      </div>
                      <span className="gx-meter">
                        <span style={{ width: `${share}%`, background: bandBg[b] }} />
                      </span>
                      <span className="gx-cat-score gx-num">{n}</span>
                      <span className="gx-cat-cost">{share.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-lg-5">
            <div className="gx-card h-100">
              <div className="gx-card-head">
                <h2>Top performers</h2>
                <Link href="/admin/league" className="ms-auto" style={{ fontSize: ".8125rem" }}>Full league table</Link>
              </div>
              <div className="table-responsive">
                <table className="gx-table gx-responsive">
                  <thead><tr><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
                  <tbody>
                    {(d.league || []).length === 0 && (
                      <tr><td colSpan={3} className="gx-muted text-center py-4">No scored audits yet.</td></tr>
                    )}
                    {(d.league || []).map((r: any) => (
                      <tr key={r.url}>
                        <td data-label="Domain" className="gx-cell-primary">{r.url}</td>
                        <td data-label="Score" className="gx-num fw-bold">{r.score ?? "—"}</td>
                        <td data-label="Band">
                          {r.band
                            ? <span className="badge" style={{ background: bandBg[r.band] + "22", color: bandBg[r.band] }}>{r.band}</span>
                            : <span className="gx-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
