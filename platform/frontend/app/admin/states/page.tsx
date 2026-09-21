"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { BAND_COLOR } from "@/lib/score";

const col = (s: number) => s >= 75 ? BAND_COLOR.A : s >= 60 ? BAND_COLOR.C : s >= 45 ? BAND_COLOR.D : BAND_COLOR.E;
type Row = { code: string; avg_score: number; domains: number };

export default function States() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.states().then(r => setRows(r.states || []))
      .catch(e => { setErr(e?.message || "Could not load state roll-up."); setRows([]); });
  }, []);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">States &amp; Union Territories</h1>
            <div className="gx-muted">Average GovUX Score across state government websites, latest audit per domain.</div>
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
          {rows == null && <div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>}
          {rows?.length === 0 && err && <div className="gx-muted ux4g-text-center ux4g-py-l">The state roll-up could not be loaded.</div>}
          {rows?.length === 0 && !err && <div className="gx-muted ux4g-text-center ux4g-py-l">No state-tagged organisations audited yet.</div>}
          {rows && rows.length > 0 && (
            <>
              <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-xs">
                {rows.map((s) => (
                  <div className="ux4g-cols-span-6 ux4g-md-cols-span-3 ux4g-lg-cols-span-2" key={s.code}>
                    {/* Was white text on the band colour — legible for A and E,
                        marginal for C. Band as a left rule on a normal surface
                        instead, so contrast does not depend on the score. */}
                    <div className="gx-stat ux4g-h-100" style={{ borderInlineStart: `3px solid ${col(s.avg_score)}` }}>
                      <div className="gx-label">{s.code}</div>
                      <div className="gx-stat-value" style={{ color: col(s.avg_score) }}>{s.avg_score}</div>
                      <div className="gx-stat-note">{s.domains} domain{s.domains === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="gx-muted ux4g-fs-14 ux4g-mt-s ux4g-mb-none">
                Each tile is one state or UT, coloured by the band its average GovUX score falls in.
              </p>
            </>
          )}
        </div></div>
      </div>
    </AppShell>
  );
}
