"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Row = {
  task_id: string; domain: string; status: string;
  score: number | null; band: string | null; compliance_status: string | null; date: string;
};

const bandColor: Record<string, string> = { A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c" };

// Terminal-state chip styling (mirrors the status screen's vocabulary).
function statusBadge(s: string) {
  if (s === "completed") return ["text-bg-success-subtle text-success", "completed"];
  if (s === "failed") return ["text-bg-danger-subtle text-danger", "failed"];
  if (s === "insufficient_evidence") return ["text-bg-warning-subtle", "no score — site unreachable"];
  return ["text-bg-primary-subtle", s.replace(/_/g, " ")]; // in-progress states
}

export default function Audits() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.listAudits()
      .then((d) => setRows(d || []))
      .catch((e: any) => { setErr(e?.message || "Could not load your audits."); setRows([]); });
  }, []);

  return (
    <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
      <div className="d-flex align-items-end flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Audit history</h1>
          <div className="text-secondary small">
            {rows == null ? "Loading…" : `${rows.length} audit(s) across your organisation`}
          </div>
        </div>
        <Link href="/audits/new" className="btn btn-primary ms-auto">▶ New audit</Link>
      </div>

      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
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
              {(rows || []).map((a) => {
                const [cls, label] = statusBadge(a.status);
                const done = a.status === "completed";
                return (
                  <tr key={a.task_id}>
                    <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{a.domain}</td>
                    <td className="text-secondary small">{a.date ? new Date(a.date).toLocaleString() : "—"}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td>
                      {done && a.score != null
                        ? <><b>{a.score}</b>{a.band && <span className="badge ms-1" style={{ background: (bandColor[a.band] || "#5c636a") + "22", color: bandColor[a.band] || "#5c636a" }}>Band {a.band}</span>}</>
                        : <span className="text-secondary">—</span>}
                    </td>
                    <td className="text-secondary small">{a.compliance_status ? a.compliance_status.replace(/_/g, " ") : "—"}</td>
                    <td>
                      {done
                        ? <Link href={`/audits/${a.task_id}/report`} className="btn btn-sm btn-link">View report →</Link>
                        : <Link href={`/audits/${a.task_id}`} className="btn btn-sm btn-link">View status →</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div></AppShell>
  );
}
