"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Alert = { severity: "critical" | "high" | "medium"; title: string; detail: string };
type Alerts = {
  band_e_count: number; regressed_count: number; never_audited_count: number;
  critical_spike_count: number; alerts: Alert[];
};
const dot: Record<string, string> = { critical: "#dc3545", high: "#fd7e14", medium: "#ffc107" };

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
            <div className="row g-3 mb-3">
              {[["Band E domains", data.band_e_count, "#dc3545"],
                ["Regressed this month", data.regressed_count, "#fd7e14"],
                ["Never audited", data.never_audited_count.toLocaleString(), "#ffc107"],
                ["New critical spikes", data.critical_spike_count, "#dc3545"]].map(([l, v, c]) => (
                <div className="col-6 col-md-3" key={l as string}><div className="card shadow-sm" style={{ borderLeft: `4px solid ${c}` }}>
                  <div className="card-body"><div className="text-secondary small">{l}</div>
                    <div className="fs-3 fw-bold" style={{ color: c as string }}>{v as any}</div></div>
                </div></div>
              ))}
            </div>
            <div className="card shadow-sm"><div className="list-group list-group-flush">
              {data.alerts.length === 0 && (
                <div className="list-group-item text-secondary text-center py-4">
                  No exceptions right now — the estate is clean against these checks.
                </div>
              )}
              {data.alerts.map((a, i) => (
                <div className="list-group-item d-flex gap-3 align-items-start" key={i}>
                  <span className="rounded-circle mt-1" style={{ width: 10, height: 10, background: dot[a.severity], flex: "none" }} />
                  <div className="flex-grow-1"><b>{a.title}</b><div className="text-secondary small">{a.detail}</div></div>
                  <span className="badge" style={{ background: dot[a.severity] + "22", color: dot[a.severity] }}>{a.severity}</span>
                </div>
              ))}
            </div></div>
          </>
        )}
      </div>
    </AppShell>
  );
}
