"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Spinner from "@/components/Spinner";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

const SEV = { critical: "ux4g-tag-tonal-error ux4g-tag-s", high: "ux4g-tag-tonal-warning ux4g-tag-s",
  medium: "ux4g-tag-tonal-warning ux4g-tag-s", low: "ux4g-tag-tonal-neutral ux4g-tag-s" } as const;

// Impact x effort prioritised fix list with advisory guidance (gap G5).
export default function Remediation({ params }: { params: { id: string } }) {
  const [items, setItems] = useState<any[] | null>(null);
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
            <h1 className="ux4g-mb-2xs">Remediation plan</h1>
            <div className="gx-muted">
              Fixes ordered by impact against effort — highest value for lowest cost first. The
              guidance is advisory and never affects the score.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        <div className="ux4g-d-flex ux4g-flex-column ux4g-gap-xs">
          {(items || []).map((f, i) => (
            <div className="ux4g-card ux4g-card-solid ux4g-card-outline" key={i}>
              <div className="ux4g-card-body ux4g-d-flex ux4g-gap-s ux4g-ai-start">
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s" style={{ minWidth: 34 }}>#{i + 1}</span>
                <div className="ux4g-flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-center">
                    <b>{f.title || f.guideline}</b>
                    <span className={SEV[f.severity as keyof typeof SEV] || "ux4g-tag-tonal-neutral ux4g-tag-s"}>{f.severity}</span>
                    <span className="ux4g-tag-tonal-neutral ux4g-tag-s">{f.category}</span>
                  </div>
                  <div className="ux4g-mt-2xs">{f.remediation}</div>
                  {f.code_hint && <div className="gx-muted ux4g-fs-14 gx-mono ux4g-mt-2xs" style={{ overflowWrap: "anywhere" }}>{f.code_hint}</div>}
                </div>
                <span className="ux4g-tag-tonal-success ux4g-tag-s" title="impact x effort priority">
                  P{f.priority}
                </span>
              </div>
            </div>
          ))}
          {items === null && !err && <div className="gx-muted ux4g-text-center ux4g-py-l">
            <Spinner size="sm" className="ux4g-mr-xs" />Loading the remediation plan…</div>}
          {items !== null && !items.length && <div className="gx-muted ux4g-text-center ux4g-py-l">No findings to remediate.</div>}
        </div>
      </div>
    </AppShell>
  );
}
