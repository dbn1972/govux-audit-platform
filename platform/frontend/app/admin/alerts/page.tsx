"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
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
            <h1 className="ux4g-mb-2xs">Exception alerts</h1>
            <div className="gx-muted">Where quality is at risk — so the programme office can intervene early.</div>
          </div>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        {!err && !data && (
          <div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>
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
                <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
                  {data.alerts.length} open
                </span>
              </div>
              <ul className="ux4g-list ux4g-list-m ux4g-list-default">
              {data.alerts.length === 0 && (
                <li className="ux4g-list-item">
                  <div className="ux4g-list-item-row">
                  <div className="gx-empty">
                  <div className="gx-empty-icon"><Icon name="check2-circle" size={24} /></div>
                  <h3 className="h6 ux4g-mt-s ux4g-mb-2xs">Nothing to act on</h3>
                  <p className="gx-muted ux4g-mb-none">The estate is clean against these four checks.</p>
                  </div>
                  </div>
                </li>
              )}
              {data.alerts.map((a, i) => (
                <li className="ux4g-list-item" key={i}>
                  <div className="ux4g-list-item-row ux4g-d-flex ux4g-gap-s ux4g-ai-start">
                  <span className="ux4g-radius-full ux4g-mt-2xs" style={{ width: 10, height: 10, background: dot[a.severity], flex: "none" }} />
                  <div className="ux4g-flex-grow-1"><b>{a.title}</b><div className="gx-muted small">{a.detail}</div></div>
                  <span className="ux4g-badge-m" style={{ background: `color-mix(in srgb, ${dot[a.severity]} 14%, transparent)`,
                                                   color: dot[a.severity] }}>{a.severity}</span>
                  </div>
                </li>
              ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
