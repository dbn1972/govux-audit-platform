"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

import { BAND_COLOR as bandBg, bandStyle } from "@/lib/score";

const BANDS = ["A", "B", "C", "D", "E"] as const;
const BAND_MEANING: Record<string, string> = {
  A: "Exemplary", B: "Good", C: "Needs work", D: "Poor", E: "Critical",
};

export default function National() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  // kept apart from `err`: that one means "the dashboard could not load" and
  // replaces the page, which is the wrong response to a failed download
  const [exportErr, setExportErr] = useState("");
  useEffect(() => {
    api.national().then(setD).catch((e) => setErr(e?.message || "Could not load national data."));
  }, []);

  if (err) return <AppShell><div className="gx-page"><div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div></div></AppShell>;
  if (!d) return <AppShell><div className="gx-page ux4g-text-center"><Spinner size="md" label="Loading" /></div></AppShell>;

  const dist = d.band_distribution || {};
  const scored = BANDS.reduce((t, b) => t + Number(dist[b] || 0), 0);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">National digital-service quality</h1>
            <div className="gx-muted">Live across all audited .gov.in / .nic.in domains</div>
          </div>
          <div className="gx-actions">
            <Link href="/admin/bulk-scan" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-md">
              <Icon name="collection" size={16} className="ux4g-mr-2xs" />Bulk scan
            </Link>
            <button type="button" className="ux4g-btn ux4g-btn-primary ux4g-btn-md" disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const blob = await api.nationalBrief();
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `govux-national-brief-${new Date().toISOString().slice(0, 10)}.pdf`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                } catch (e: any) {
                  setExportErr(e?.message || "Could not generate the national brief.");
                } finally { setExporting(false); }
              }}>
              {exporting
                ? <><Spinner size="sm" className="ux4g-mr-xs" />Preparing…</>
                : <><Icon name="download" size={16} className="ux4g-mr-2xs" />Export brief</>}
            </button>
          </div>
        </div>

        {exportErr && (
          <div className="ux4g-alert ux4g-alert-warning ux4g-d-flex ux4g-ai-center ux4g-gap-xs" role="alert">
            <Icon name="exclamation-triangle" size={16} />
            <span>{exportErr}</span>
            <button type="button" className="ux4g-alert-close ux4g-ml-auto" aria-label="Dismiss"
              onClick={() => setExportErr("")}><Icon name="x-lg" size={16} /></button>
          </div>
        )}

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

        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-7">
            <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100">
              <div className="ux4g-card-header">
                <h2>Score distribution</h2>
                <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
                  {scored} scored domain{scored === 1 ? "" : "s"}
                </span>
              </div>
              {/* Horizontal, and every band is always drawn. The vertical chart
                  this replaces scaled to the tallest bar, so a single audited
                  domain became one enormous block and the four empty bands
                  vanished — the estate looked like it had no distribution at
                  all rather than one with four gaps in it. */}
              <div className="ux4g-card-body">
                {scored === 0 ? (
                  <p className="gx-muted ux4g-mb-none">
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
                      <span className="ux4g-progress-bar ux4g-progress-bar-track">
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

          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-5">
            <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100">
              <div className="ux4g-card-header">
                <h2>Top performers</h2>
                <Link href="/admin/league" className="ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>Full league table</Link>
              </div>
              <div className="ux4g-table-responsive ux4g-table-rounded">
                <table className="ux4g-table ux4g-table-m gx-responsive">
                  <thead><tr><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
                  <tbody>
                    {(d.league || []).length === 0 && (
                      <tr><td colSpan={3} className="gx-muted ux4g-text-center ux4g-py-l">No scored audits yet.</td></tr>
                    )}
                    {(d.league || []).map((r: any) => (
                      <tr key={r.url}>
                        <td data-label="Domain" className="gx-cell-primary">{r.url}</td>
                        <td data-label="Score" className="gx-num ux4g-fw-bold">{r.score ?? "—"}</td>
                        <td data-label="Band">
                          {r.band
                            ? <span className="ux4g-tag-tonal-neutral ux4g-tag-s" style={bandStyle(r.band)}>{r.band}</span>
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
