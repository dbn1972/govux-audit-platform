"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

type H = { task_id: string; date: string; score: number; band: string };
import { absolute as fmt } from "@/lib/format";

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
            <h1 className="ux4g-mb-2xs">Score trend &amp; history</h1>
            <div className="gx-muted">Every re-audit is a versioned, dated snapshot.</div>
          </div>
        </div>
    <AuditNav id={params.id} />{b}</div></AppShell>;

  if (err) return wrap(<div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>);
  if (!hist) return wrap(<div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>);
  if (hist.length === 0) return wrap(<div className="gx-muted ux4g-text-center ux4g-py-l">No completed audits yet for this domain — run one to start the trend.</div>);

  const max = 100;
  const asc = [...hist].reverse();   // oldest → newest for the bar chart
  return wrap(
    <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
      <div className="ux4g-cols-span-12 ux4g-lg-cols-span-8"><div className="gx-card ux4g-h-100"><div className="gx-card-body">
        <h2 className="h6">GovUX Score over time</h2>
        <div className="ux4g-d-flex ux4g-ai-end ux4g-gap-m ux4g-mt-s" style={{ height: 180 }}>
          {asc.map(h => (
            <div key={h.task_id} className="ux4g-text-center ux4g-flex-grow-1">
              <div style={{ height: `${(h.score / max) * 150}px`, background: "#0d6efd", borderRadius: "6px 6px 0 0" }} />
              <div className="ux4g-fw-bold ux4g-mt-2xs">{Math.round(h.score)}</div>
              <div className="gx-muted" style={{ fontSize: 10 }}>{fmt(h.date)}</div>
            </div>
          ))}
        </div>
      </div></div></div>
      <div className="ux4g-cols-span-12 ux4g-lg-cols-span-4"><div className="gx-card ux4g-h-100">
        <div className="gx-card-head">Audit history</div>
        <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m ux4g-mb-none">
          <thead><tr><th>Date</th><th>Score</th><th>Δ</th></tr></thead>
          <tbody>{hist.map((h, i) => {
            const prev = hist[i + 1];   // next in the newest-first list = older run
            const delta = prev ? Math.round(h.score - prev.score) : null;
            return (
              <tr key={h.task_id}><td className="small">{fmt(h.date)}</td>
                <td className="ux4g-fw-bold">{Math.round(h.score)}</td>
                <td className="small gx-num ux4g-fw-semibold" style={{
                  color: delta == null ? "var(--gx-text-muted)"
                    : delta > 0 ? "var(--gx-band-A)" : delta < 0 ? "var(--gx-band-E)" : "var(--gx-text-muted)" }}>
                  {delta == null ? "baseline" : `${delta >= 0 ? "+" : ""}${delta}`}</td></tr>
            );
          })}</tbody>
        </table></div>
      </div></div>
    </div>
  );
}
