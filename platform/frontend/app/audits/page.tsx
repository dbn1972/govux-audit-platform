"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { absoluteTime } from "@/lib/format";

type Row = {
  task_id: string; domain: string; status: string;
  score: number | null; band: string | null; compliance_status: string | null; date: string;
};

import { BAND_COLOR as bandColor, bandStyle } from "@/lib/score";
const PROGRESS = ["queued", "crawling", "analyzing", "scoring"];
const PAGE = 15;

function statusBadge(s: string) {
  if (s === "completed") return ["ux4g-tag-tonal-success ux4g-tag-s", "completed"];
  if (s === "failed") return ["ux4g-tag-tonal-error ux4g-tag-s", "failed"];
  if (s === "cancelled") return ["ux4g-tag-tonal-neutral ux4g-tag-s", "cancelled"];
  if (s === "insufficient_evidence") return ["ux4g-tag-tonal-warning ux4g-tag-s", "no score"];
  return ["ux4g-tag-tonal-neutral ux4g-tag-s", s.replace(/_/g, " ")]; // in-progress states
}

// filter key -> predicate. "" = default (everything except cancelled noise).
const FILTERS: [string, string][] = [
  ["", "Active"], ["completed", "Completed"], ["progress", "In progress"],
  ["insufficient_evidence", "No score"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["all", "All"],
];
function matches(status: string, f: string) {
  if (f === "all") return true;
  if (f === "") return status !== "cancelled";
  if (f === "progress") return PROGRESS.includes(status);
  return status === f;
}

export default function Audits() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // only super_admin sees cross-org data here (GET /v1/audits org-fences everyone
  // else, including programme_admin) — the label must match, not just "is a steward"
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    api.listAudits()
      .then((d) => setRows(d || []))
      .catch((e: any) => { setErr(e?.message || "Could not load your audits."); setRows([]); });
    api.me().then((m) => setIsSuperAdmin(m?.role === "super_admin")).catch(() => {});
  }, []);

  const filtered = useMemo(() => (rows || []).filter(
    (a) => matches(a.status, filter) && (!q || a.domain.toLowerCase().includes(q.toLowerCase()))
  ), [rows, filter, q]);
  const shown = filtered.slice(0, limit);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (rows || []).forEach((a) => { FILTERS.forEach(([k]) => { if (matches(a.status, k)) c[k] = (c[k] || 0) + 1; }); });
    return c;
  }, [rows]);

  return (
    <AppShell><div className="gx-page">
      <div className="ux4g-d-flex ux4g-ai-end ux4g-flex-wrap ux4g-gap-xs ux4g-mb-s">
        <div>
          <h1 className="ux4g-mb-2xs">Audit history</h1>
          <div className="gx-muted">
            {rows == null ? "Loading…" : `${filtered.length} of ${rows.length} audit${rows.length === 1 ? "" : "s"} across ${isSuperAdmin ? "all organisations" : "your organisation"}`}
          </div>
        </div>
        <Link href="/audits/new" className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-ml-auto"><Icon name="play-fill" size={16} className="ux4g-mr-2xs" />New audit</Link>
      </div>

      {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

      {rows != null && rows.length > 0 && (
        <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-center ux4g-mb-s">
          <div className="ux4g-d-inline-flex ux4g-gap-2xs ux4g-flex-wrap" role="group" aria-label="Filter by status">
            {FILTERS.map(([k, label]) => (
              <button key={k || "active"} type="button"
                onClick={() => { setFilter(k); setLimit(PAGE); }}
                className={`ux4g-btn ux4g-btn-sm ${filter === k ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}>
                {label}{counts[k] ? ` ${counts[k]}` : ""}
              </button>
            ))}
          </div>
          <input className="ux4g-input ux4g-w-100 ux4g-ml-auto" style={{ maxWidth: 240 }}
            placeholder="Filter by domain…" value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Filter by domain" />
        </div>
      )}

      <div className="ux4g-card ux4g-card-solid ux4g-card-outline">
        <div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead>
              <tr><th>Domain</th><th>Date</th><th>Status</th><th>Score</th><th>Compliance</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={6} className="ux4g-text-center ux4g-py-m">
                  <Spinner size="sm" className="ux4g-mr-xs" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={6} className="gx-muted ux4g-text-center ux4g-py-l">
                  No audits yet. <Link href="/audits/new">Run your first audit →</Link>
                </td></tr>
              )}
              {rows != null && rows.length > 0 && filtered.length === 0 && (
                <tr><td colSpan={6} className="gx-muted ux4g-text-center ux4g-py-l">No audits match this filter.</td></tr>
              )}
              {shown.map((a) => {
                const [cls, label] = statusBadge(a.status);
                const done = a.status === "completed";
                return (
                  <tr key={a.task_id}>
                    <td data-label="Domain" className="ux4g-fw-semibold">{a.domain}</td>
                    {/* was toLocaleString(): "18/08/2026, 09:27:34" — seconds
                        nobody needs, in a day/month order that flips by locale */}
                    <td data-label="Date" className="gx-muted ux4g-fs-14">{absoluteTime(a.date)}</td>
                    <td data-label="Status"><span className={cls}>{label}</span></td>
                    <td data-label="Score">
                      {done && a.score != null
                        ? <><b>{a.score}</b>{a.band && <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-ml-2xs" style={bandStyle(a.band)}>Band {a.band}</span>}</>
                        : <span className="gx-muted">—</span>}
                    </td>
                    <td data-label="Compliance" className="gx-muted ux4g-fs-14">{a.compliance_status ? a.compliance_status.replace(/_/g, " ") : "—"}</td>
                    <td data-label="">
                      {done
                        ? <>
                            <Link href={`/audits/${a.task_id}/report`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">View report →</Link>
                            {/* the compare screen had no entry point at all — it was
                                reachable only by typing the URL */}
                            <Link href={`/audits/${a.task_id}/compare`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm gx-muted">Compare</Link>
                          </>
                        : <Link href={`/audits/${a.task_id}`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">View status →</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="ux4g-card-footer ux4g-text-center">
            <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({filtered.length - limit} more)
            </button>
          </div>
        )}
      </div>
    </div></AppShell>
  );
}
