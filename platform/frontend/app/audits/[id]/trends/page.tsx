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
        <AuditNav id={params.id} />
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Score trend &amp; history</h1>
            <div className="gx-muted">Every re-audit is a versioned, dated snapshot.</div>
          </div>
        </div>
        {b}
      </div>
    </AppShell>;

  if (err) return wrap(<div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>);
  if (!hist) return wrap(<div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>);
  if (hist.length === 0) return wrap(<div className="gx-muted ux4g-text-center ux4g-py-l">No completed audits yet for this domain — run one to start the trend.</div>);

  const asc = [...hist].reverse();   // oldest → newest, left to right

  /* Bars from a zero baseline could not show what this page exists to show:
     62 and 60 differ by 3px of a 150px bar and read as identical. A line on an
     axis zoomed to the data does, and the axis is LABELLED so the zoom cannot
     mislead — the reader sees the window they are looking through. */
  const scores = asc.map(h => h.score);
  const lo = Math.min(...scores), hi = Math.max(...scores);
  const pad = Math.max(2, (hi - lo) * 0.25 || 5);
  const yMin = Math.max(0, Math.floor(lo - pad));
  const yMax = Math.min(100, Math.ceil(hi + pad));
  const span = yMax - yMin || 1;

  const W = 640, H = 190, PADL = 34, PADR = 12, PADT = 12, PADB = 30;
  const px = (i: number) => asc.length === 1
    ? PADL + (W - PADL - PADR) / 2
    : PADL + (i * (W - PADL - PADR)) / (asc.length - 1);
  const py = (v: number) => PADT + (1 - (v - yMin) / span) * (H - PADT - PADB);
  const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];
  const line = asc.map((h, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(h.score).toFixed(1)}`).join(" ");
  const first = asc[0].score, last = asc[asc.length - 1].score;
  const move = Math.round(last - first);

  return wrap(
    <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
      <div className="ux4g-cols-span-12 ux4g-lg-cols-span-8"><div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100"><div className="ux4g-card-body">
        <h2 className="ux4g-heading-2xs-strong">GovUX Score over time</h2>
        <p className="gx-muted ux4g-fs-14 ux4g-mt-2xs ux4g-mb-s">
          {asc.length === 1
            ? "One run so far — the trend appears once this domain is re-audited."
            : <>{asc.length} runs · {move === 0 ? "no net change" : `${move > 0 ? "up" : "down"} ${Math.abs(move)} point${Math.abs(move) === 1 ? "" : "s"}`} since the first.
                Axis {yMin}–{yMax}, not 0–100, so small movements are visible.</>}
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
          aria-label={`GovUX score across ${asc.length} audit${asc.length === 1 ? "" : "s"}, ` +
            asc.map(h => `${fmt(h.date)}: ${Math.round(h.score)}`).join("; ")}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={PADL} x2={W - PADR} y1={py(t)} y2={py(t)}
                stroke="var(--ux4g-border-color-neutral-subtle)" strokeWidth="1" />
              <text x={PADL - 6} y={py(t) + 4} textAnchor="end"
                fill="var(--ux4g-text-neutral-secondary)" fontSize="11">{t}</text>
            </g>
          ))}
          {asc.length > 1 && (
            <path d={line} fill="none" stroke="var(--ux4g-bg-primary-strong)"
              strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          )}
          {asc.map((h, i) => (
            <g key={h.task_id}>
              <circle cx={px(i)} cy={py(h.score)} r="4.5"
                fill="var(--ux4g-bg-neutral-elevated)"
                stroke="var(--ux4g-bg-primary-strong)" strokeWidth="2.5" />
              <text x={px(i)} y={py(h.score) - 11} textAnchor="middle"
                fill="var(--ux4g-text-neutral-primary)" fontSize="12" fontWeight="600">
                {Math.round(h.score)}
              </text>
              <text x={px(i)} y={H - 10} textAnchor="middle"
                fill="var(--ux4g-text-neutral-secondary)" fontSize="11">{fmt(h.date)}</text>
            </g>
          ))}
        </svg>
      </div></div></div>
      <div className="ux4g-cols-span-12 ux4g-lg-cols-span-4"><div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100">
        <div className="ux4g-card-header"><h2 className="ux4g-heading-2xs-strong">Every run</h2></div>
        <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m ux4g-mb-none">
          <thead><tr><th>Date</th><th>Score</th><th>Δ</th></tr></thead>
          <tbody>{hist.map((h, i) => {
            const prev = hist[i + 1];   // next in the newest-first list = older run
            const delta = prev ? Math.round(h.score - prev.score) : null;
            return (
              <tr key={h.task_id}><td className="ux4g-fs-14">{fmt(h.date)}</td>
                <td className="ux4g-fw-bold">{Math.round(h.score)}</td>
                <td className="ux4g-fs-14 gx-num ux4g-fw-semibold" style={{
                  color: delta == null ? "var(--ux4g-text-neutral-secondary)"
                    : delta > 0 ? "var(--gx-band-A)" : delta < 0 ? "var(--gx-band-E)" : "var(--ux4g-text-neutral-secondary)" }}>
                  {delta == null ? "baseline" : `${delta >= 0 ? "+" : ""}${delta}`}</td></tr>
            );
          })}</tbody>
        </table></div>
      </div></div>
    </div>
  );
}
