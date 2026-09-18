"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Spinner from "@/components/Spinner";
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
            <h1 className="ux4g-mb-2xs">Ministries &amp; departments</h1>
            <div className="gx-muted">Quality grouped by organisation, latest audit per domain.</div>
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead><tr><th>#</th><th>Ministry / Department</th><th>Domains</th><th>Avg score</th><th>Band</th></tr></thead>
            <tbody>
              {rows == null && <tr><td colSpan={5} className="ux4g-text-center ux4g-py-m"><Spinner size="sm" /></td></tr>}
              {rows?.length === 0 && !err && <tr><td colSpan={5} className="gx-muted ux4g-text-center ux4g-py-l">No audited organisations yet.</td></tr>}
              {(rows || []).map((r, i) => (
                <tr key={r.name}>
                  <td data-label="Rank" className="gx-num gx-muted">{i + 1}</td>
                  <td data-label="Ministry / Department" className="gx-cell-primary">{r.name}</td>
                  <td data-label="Domains" className="gx-num">{r.domains}</td>
                  <td data-label="Avg score">
                    {/* the number with its bar: a table of bare averages makes a
                        reader compare digits instead of seeing the spread */}
                    <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs" style={{ maxWidth: 160 }}>
                      <span className="gx-num ux4g-fw-bold">{r.avg_score}</span>
                      <span className="ux4g-progress-bar ux4g-progress-bar-track ux4g-flex-grow-1">
                        <span style={{ width: `${r.avg_score}%`, background: bandStyle(r.band).color }} />
                      </span>
                    </div>
                  </td>
                  <td data-label="Band"><span className="ux4g-tag-tonal-neutral ux4g-tag-s" style={bandStyle(r.band)}>{r.band}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
