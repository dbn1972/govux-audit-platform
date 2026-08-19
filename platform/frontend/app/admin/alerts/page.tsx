"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Alert = { severity: "critical" | "high" | "medium"; title: string; detail: string };
type Alerts = {
  band_e_count: number; regressed_count: number; never_audited_count: number;
  critical_spike_count: number; alerts: Alert[];
};
const dot: Record<string, string> = {
  critical: "var(--gx-band-E)", high: "var(--gx-band-D)", medium: "var(--gx-band-C)",
};

export default function Alerts() {
  const [data, setData] = useState<Alerts | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.alerts().then(setData)
      .catch((e: any) => { setErr(e?.message || "Could not load alerts."); setData(null); });
  }, []);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Exception alerts</h1>
            <div className="gx-muted">Where quality is at risk — so the programme office can intervene early.</div>
          </div>
        </div>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        {!err && !data && (
          <div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>
        )}

        {data && (
          <>
            {/* Ordered by what a programme office acts on first, and each tile
                says what it means rather than leaving a bare count: "never
                audited" is a coverage problem, "band E" is an intervention. */}
            <div className="gx-stats">
              {[["Band E domains", data.band_e_count, "var(--gx-band-E)", "need intervention"],
                ["Regressed this month", data.regressed_count, "var(--gx-band-D)", "dropped 5+ points"],
                ["Never audited", data.never_audited_count.toLocaleString(), "var(--gx-band-C)", "no evidence either way"],
                ["New critical spikes", data.critical_spike_count, "var(--gx-band-E)", "new critical findings"]].map(([l, v, c, note]) => (
                <div className="gx-stat" key={l as string}
                  style={{ borderInlineStart: `3px solid ${c}` }}>
                  <div className="gx-label">{l as string}</div>
                  <div className="gx-stat-value" style={{ color: c as string }}>{v as any}</div>
                  <div className="gx-stat-note">{note as string}</div>
                </div>
              ))}
            </div>
            <div className="gx-card">
              <div className="gx-card-head">
                <h2>Exceptions</h2>
                <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>
                  {data.alerts.length} open
                </span>
              </div>
              <div className="list-group list-group-flush">
              {data.alerts.length === 0 && (
                <div className="gx-empty">
                  <div className="gx-empty-icon"><i className="bi bi-check2-circle" aria-hidden="true" /></div>
                  <h3 className="h6 mt-3 mb-1">Nothing to act on</h3>
                  <p className="gx-muted mb-0">The estate is clean against these four checks.</p>
                </div>
              )}
              {data.alerts.map((a, i) => (
                <div className="list-group-item d-flex gap-3 align-items-start" key={i}>
                  <span className="rounded-circle mt-1" style={{ width: 10, height: 10, background: dot[a.severity], flex: "none" }} />
                  <div className="flex-grow-1"><b>{a.title}</b><div className="gx-muted small">{a.detail}</div></div>
                  <span className="badge" style={{ background: `color-mix(in srgb, ${dot[a.severity]} 14%, transparent)`,
                                                   color: dot[a.severity] }}>{a.severity}</span>
                </div>
              ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
