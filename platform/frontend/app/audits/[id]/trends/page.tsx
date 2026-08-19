"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

type H = { task_id: string; date: string; score: number; band: string };
const fmt = (iso: string) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };

export default function Trends({ params }: { params: { id: string } }) {
  const [hist, setHist] = useState<H[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.auditTrend(params.id).then(r => setHist(r.history || []))
      .catch(e => { setErr(e?.message || "Could not load history."); setHist([]); });
  }, [params.id]);

  const wrap = (b: React.ReactNode) => <AppShell><div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Score trend &amp; history</h1>
            <div className="gx-muted">Every re-audit is a versioned, dated snapshot.</div>
          </div>
        </div>
    <AuditNav id={params.id} />{b}</div></AppShell>;

  if (err) return wrap(<div className="alert alert-warning" role="alert">{err}</div>);
  if (!hist) return wrap(<div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>);
  if (hist.length === 0) return wrap(<div className="text-secondary text-center py-5">No completed audits yet for this domain — run one to start the trend.</div>);

  const max = 100;
  const asc = [...hist].reverse();   // oldest → newest for the bar chart
  return wrap(
    <div className="row g-3">
      <div className="col-lg-8"><div className="gx-card h-100"><div className="gx-card-body">
        <h2 className="h6">GovUX Score over time</h2>
        <div className="d-flex align-items-end gap-4 mt-3" style={{ height: 180 }}>
          {asc.map(h => (
            <div key={h.task_id} className="text-center flex-grow-1">
              <div style={{ height: `${(h.score / max) * 150}px`, background: "#0d6efd", borderRadius: "6px 6px 0 0" }} />
              <div className="fw-bold mt-1">{Math.round(h.score)}</div>
              <div className="text-secondary" style={{ fontSize: 10 }}>{fmt(h.date)}</div>
            </div>
          ))}
        </div>
      </div></div></div>
      <div className="col-lg-4"><div className="gx-card h-100">
        <div className="gx-card-head">Audit history</div>
        <div className="table-responsive"><table className="table table-hover mb-0">
          <thead><tr><th>Date</th><th>Score</th><th>Δ</th></tr></thead>
          <tbody>{hist.map((h, i) => {
            const prev = hist[i + 1];   // next in the newest-first list = older run
            const delta = prev ? Math.round(h.score - prev.score) : null;
            return (
              <tr key={h.task_id}><td className="small">{fmt(h.date)}</td>
                <td className="fw-bold">{Math.round(h.score)}</td>
                <td className={`small ${delta == null ? "text-secondary" : delta >= 0 ? "text-success" : "text-danger"}`}>
                  {delta == null ? "baseline" : `${delta >= 0 ? "+" : ""}${delta}`}</td></tr>
            );
          })}</tbody>
        </table></div>
      </div></div>
    </div>
  );
}
