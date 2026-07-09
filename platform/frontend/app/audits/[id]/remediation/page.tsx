"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
      <div className="container-fluid p-4">
        <h1 className="h3" style={{ color: "var(--ux-navy)" }}>Remediation plan</h1>
        <p className="text-secondary small">
          Fixes ordered by impact × effort — highest-value, lowest-cost first. Guidance is advisory
          and never affects the score.
        </p>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="d-flex flex-column gap-2">
          {items.map((f, i) => (
            <div className="card shadow-sm" key={i}>
              <div className="card-body d-flex gap-3 align-items-start">
                <span className="badge text-bg-primary" style={{ minWidth: 34 }}>#{i + 1}</span>
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <b style={{ color: "var(--ux-navy)" }}>{f.title || f.guideline}</b>
                    <span className={`badge ${SEV[f.severity as keyof typeof SEV] || "text-bg-light"}`}>{f.severity}</span>
                    <span className="badge bg-secondary">{f.category}</span>
                  </div>
                  <div className="mt-1">{f.remediation}</div>
                  {f.code_hint && <div className="text-secondary small font-monospace mt-1" style={{ overflowWrap: "anywhere" }}>{f.code_hint}</div>}
                </div>
                <span className="badge text-bg-success" title="impact x effort priority">
                  P{f.priority}
                </span>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-secondary text-center py-5">No findings to remediate.</div>}
        </div>
      </div>
    </AppShell>
  );
}
