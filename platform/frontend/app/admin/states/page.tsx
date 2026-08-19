"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
            <h1 className="mb-1">States &amp; Union Territories</h1>
            <div className="gx-muted">Average GovUX Score across state government websites, latest audit per domain.</div>
          </div>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="gx-card"><div className="gx-card-body">
          {rows == null && <div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>}
          {rows?.length === 0 && !err && <div className="gx-muted text-center py-5">No state-tagged organisations audited yet.</div>}
          {rows && rows.length > 0 && (
            <>
              <div className="row g-2">
                {rows.map((s) => (
                  <div className="col-6 col-md-3 col-lg-2" key={s.code}>
                    {/* Was white text on the band colour — legible for A and E,
                        marginal for C. Band as a left rule on a normal surface
                        instead, so contrast does not depend on the score. */}
                    <div className="gx-stat h-100" style={{ borderInlineStart: `3px solid ${col(s.avg_score)}` }}>
                      <div className="gx-label">{s.code}</div>
                      <div className="gx-stat-value" style={{ color: col(s.avg_score) }}>{s.avg_score}</div>
                      <div className="gx-stat-note">{s.domains} domain{s.domains === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="gx-muted small mt-3 mb-0">
                Each tile is one state or UT, coloured by the band its average GovUX score falls in.
              </p>
            </>
          )}
        </div></div>
      </div>
    </AppShell>
  );
}
