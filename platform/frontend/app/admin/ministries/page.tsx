"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

import { BAND_COLOR as bandBg } from "@/lib/score";
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
      <div className="container-fluid p-4">
        <h1 className="h3">Ministries &amp; departments</h1>
        <p className="text-secondary small">Quality grouped by organisation, latest audit per domain.</p>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="card shadow-sm"><div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light"><tr><th>#</th><th>Ministry / Department</th><th>Domains</th><th>Avg score</th><th>Band</th></tr></thead>
            <tbody>
              {rows == null && <tr><td colSpan={5} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" role="status" aria-label="Loading" /></td></tr>}
              {rows?.length === 0 && !err && <tr><td colSpan={5} className="text-secondary text-center py-4">No audited organisations yet.</td></tr>}
              {(rows || []).map((r, i) => (
                <tr key={r.name}><td>{i + 1}</td>
                  <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{r.name}</td>
                  <td>{r.domains}</td><td className="fw-bold">{r.avg_score}</td>
                  <td><span className="badge" style={{ background: bandBg[r.band] + "22", color: bandBg[r.band] }}>{r.band}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
