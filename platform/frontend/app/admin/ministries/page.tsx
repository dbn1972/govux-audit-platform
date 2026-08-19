"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

import { BAND_COLOR as bandBg, bandStyle } from "@/lib/score";
type Row = { name: string; domains: number; avg_score: number; band: string };

export default function Ministries() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.ministries().then(r => setRows(r.ministries || []))
      .catch(e => { setErr(e?.message || "Could not load ministry roll-up."); setRows([]); });
  }, []);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Ministries &amp; departments</h1>
            <div className="gx-muted">Quality grouped by organisation, latest audit per domain.</div>
          </div>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="gx-card"><div className="table-responsive">
          <table className="gx-table gx-responsive">
            <thead><tr><th>#</th><th>Ministry / Department</th><th>Domains</th><th>Avg score</th><th>Band</th></tr></thead>
            <tbody>
              {rows == null && <tr><td colSpan={5} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" role="status" aria-label="Loading" /></td></tr>}
              {rows?.length === 0 && !err && <tr><td colSpan={5} className="gx-muted text-center py-5">No audited organisations yet.</td></tr>}
              {(rows || []).map((r, i) => (
                <tr key={r.name}>
                  <td data-label="Rank" className="gx-num gx-muted">{i + 1}</td>
                  <td data-label="Ministry / Department" className="gx-cell-primary">{r.name}</td>
                  <td data-label="Domains" className="gx-num">{r.domains}</td>
                  <td data-label="Avg score">
                    {/* the number with its bar: a table of bare averages makes a
                        reader compare digits instead of seeing the spread */}
                    <div className="d-flex align-items-center gap-2" style={{ maxWidth: 160 }}>
                      <span className="gx-num fw-bold">{r.avg_score}</span>
                      <span className="gx-meter flex-grow-1">
                        <span style={{ width: `${r.avg_score}%`, background: bandStyle(r.band).color }} />
                      </span>
                    </div>
                  </td>
                  <td data-label="Band"><span className="badge" style={bandStyle(r.band)}>{r.band}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
