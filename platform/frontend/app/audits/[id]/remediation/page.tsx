"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

const SEV = { critical: "text-bg-danger", high: "text-bg-warning",
  medium: "text-bg-warning-subtle", low: "text-bg-light" } as const;

// Impact x effort prioritised fix list with advisory guidance (gap G5).
export default function Remediation({ params }: { params: { id: string } }) {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.remediation(params.id).then(r => setItems(r.items || []))
      .catch(e => setErr(e?.message || "Could not load the remediation plan."));
  }, [params.id]);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Remediation plan</h1>
            <div className="gx-muted">
              Fixes ordered by impact against effort — highest value for lowest cost first. The
              guidance is advisory and never affects the score.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="d-flex flex-column gap-2">
          {items.map((f, i) => (
            <div className="gx-card" key={i}>
              <div className="card-body d-flex gap-3 align-items-start">
                <span className="badge text-bg-primary" style={{ minWidth: 34 }}>#{i + 1}</span>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <b>{f.title || f.guideline}</b>
                    <span className={`badge ${SEV[f.severity as keyof typeof SEV] || "text-bg-light"}`}>{f.severity}</span>
                    <span className="badge bg-secondary">{f.category}</span>
                  </div>
                  <div className="mt-1">{f.remediation}</div>
                  {f.code_hint && <div className="gx-muted small font-monospace mt-1" style={{ overflowWrap: "anywhere" }}>{f.code_hint}</div>}
                </div>
                <span className="badge text-bg-success" title="impact x effort priority">
                  P{f.priority}
                </span>
              </div>
            </div>
          ))}
          {!items.length && <div className="gx-muted text-center py-5">No findings to remediate.</div>}
        </div>
      </div>
    </AppShell>
  );
}
