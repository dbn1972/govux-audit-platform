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
      <div className="container-fluid p-4">
        <h1 className="h3">States &amp; Union Territories</h1>
        <p className="text-secondary small">Average GovUX Score across state government websites, latest audit per domain.</p>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="card shadow-sm"><div className="card-body">
          {rows == null && <div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>}
          {rows?.length === 0 && !err && <div className="text-secondary text-center py-4">No state-tagged organisations audited yet.</div>}
          {rows && rows.length > 0 && (
            <>
              <div className="row g-2">
                {rows.map((s) => (
                  <div className="col-6 col-md-3 col-lg-2" key={s.code}>
                    <div className="p-2 rounded text-white" style={{ background: col(s.avg_score) }}>
                      <div className="small fw-semibold">{s.code}</div>
                      <div className="fs-4 fw-bold">{s.avg_score}</div>
                      <div className="small">{s.domains} domain{s.domains === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-secondary small mt-3 mb-0">Colour reflects the average GovUX Score band.</p>
            </>
          )}
        </div></div>
      </div>
    </AppShell>
  );
}
