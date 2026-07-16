"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const SEV = { critical: "text-bg-danger", high: "text-bg-warning", medium: "text-bg-warning-subtle", low: "text-bg-light" } as const;

export default function Issues({ params }: { params: { id: string } }) {
  const [findings, setFindings] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState("");
  useEffect(() => {
    api.auditReport(params.id).then(r => setFindings(r.findings || []))
      .catch(e => setErr(e?.message || "Could not load findings."));
  }, [params.id]);

  const shown = useMemo(() =>
    filter === "all" ? findings : findings.filter(f => f.severity === filter), [findings, filter]);
  const count = (s: string) => findings.filter(f => f.severity === s).length;

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Prioritised issues</h1>
        <p className="text-secondary small">{findings.length} findings from the audit engine, ranked by severity.</p>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="mb-3 d-flex gap-2 flex-wrap">
          {["all", "critical", "high", "medium", "low"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline-secondary"}`}>
              {s === "all" ? `All ${findings.length}` : `${s} ${count(s)}`}
            </button>
          ))}
        </div>

        <div className="card shadow-sm"><div className="table-responsive">
          <table className="table table-hover align-middle mb-0 gx-responsive">
            <thead className="table-light"><tr><th>Issue &amp; how to fix</th><th>Category</th><th>Guideline</th><th>Severity</th></tr></thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td data-label="Issue">
                    <div className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{f.title || f.guideline}</div>
                    {f.remediation && <div className="text-secondary small mt-1">↳ {f.remediation}</div>}
                  </td>
                  <td data-label="Category"><span className="badge text-bg-primary-subtle">{f.category}</span></td>
                  <td data-label="Guideline" className="text-secondary small">{f.guideline}</td>
                  <td data-label="Severity"><span className={`badge ${SEV[f.severity as keyof typeof SEV] || "text-bg-light"}`}>{f.severity}</span></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={4} className="text-center text-secondary py-4">No issues in this filter.</td></tr>}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
