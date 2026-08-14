"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Row = {
  task_id: string; domain: string; status: string;
  score: number | null; band: string | null; compliance_status: string | null; date: string;
};

import { BAND_COLOR as bandColor } from "@/lib/score";
const PROGRESS = ["queued", "crawling", "analyzing", "scoring"];
const PAGE = 15;

function statusBadge(s: string) {
  if (s === "completed") return ["text-bg-success-subtle text-success", "completed"];
  if (s === "failed") return ["text-bg-danger-subtle text-danger", "failed"];
  if (s === "cancelled") return ["text-bg-secondary-subtle", "cancelled"];
  if (s === "insufficient_evidence") return ["text-bg-warning-subtle", "no score"];
  return ["text-bg-primary-subtle", s.replace(/_/g, " ")]; // in-progress states
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
    <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
      <div className="d-flex align-items-end flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Audit history</h1>
          <div className="text-secondary small">
            {rows == null ? "Loading…" : `${filtered.length} of ${rows.length} audit(s) across ${isSuperAdmin ? "all organisations" : "your organisation"}`}
          </div>
        </div>
        <Link href="/audits/new" className="btn btn-primary ms-auto">▶ New audit</Link>
      </div>

      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      {rows != null && rows.length > 0 && (
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <div className="btn-group btn-group-sm flex-wrap" role="group" aria-label="Filter by status">
            {FILTERS.map(([k, label]) => (
              <button key={k || "active"} type="button"
                onClick={() => { setFilter(k); setLimit(PAGE); }}
                className={`btn ${filter === k ? "btn-primary" : "btn-outline-secondary"}`}>
                {label}{counts[k] ? ` ${counts[k]}` : ""}
              </button>
            ))}
          </div>
          <input className="form-control form-control-sm ms-auto" style={{ maxWidth: 240 }}
            placeholder="Filter by domain…" value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} aria-label="Filter by domain" />
        </div>
      )}

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 gx-responsive">
            <thead className="table-light">
              <tr><th>Domain</th><th>Date</th><th>Status</th><th>Score</th><th>Compliance</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={6} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={6} className="text-secondary text-center py-4">
                  No audits yet. <Link href="/audits/new">Run your first audit →</Link>
                </td></tr>
              )}
              {rows != null && rows.length > 0 && filtered.length === 0 && (
                <tr><td colSpan={6} className="text-secondary text-center py-4">No audits match this filter.</td></tr>
              )}
              {shown.map((a) => {
                const [cls, label] = statusBadge(a.status);
                const done = a.status === "completed";
                return (
                  <tr key={a.task_id}>
                    <td data-label="Domain" className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{a.domain}</td>
                    <td data-label="Date" className="text-secondary small">{a.date ? new Date(a.date).toLocaleString() : "—"}</td>
                    <td data-label="Status"><span className={`badge ${cls}`}>{label}</span></td>
                    <td data-label="Score">
                      {done && a.score != null
                        ? <><b>{a.score}</b>{a.band && <span className="badge ms-1" style={{ background: (bandColor[a.band] || "#5c636a") + "22", color: bandColor[a.band] || "#5c636a" }}>Band {a.band}</span>}</>
                        : <span className="text-secondary">—</span>}
                    </td>
                    <td data-label="Compliance" className="text-secondary small">{a.compliance_status ? a.compliance_status.replace(/_/g, " ") : "—"}</td>
                    <td data-label="">
                      {done
                        ? <>
                            <Link href={`/audits/${a.task_id}/report`} className="btn btn-sm btn-link">View report →</Link>
                            {/* the compare screen had no entry point at all — it was
                                reachable only by typing the URL */}
                            <Link href={`/audits/${a.task_id}/compare`} className="btn btn-sm btn-link text-secondary">Compare</Link>
                          </>
                        : <Link href={`/audits/${a.task_id}`} className="btn btn-sm btn-link">View status →</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="card-footer bg-white text-center">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({filtered.length - limit} more)
            </button>
          </div>
        )}
      </div>
    </div></AppShell>
  );
}
