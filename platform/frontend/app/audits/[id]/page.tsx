"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const STATES = ["queued", "crawling", "analyzing", "scoring", "completed"];
// terminal states that must stop the poll loop (else the UI spins forever)
const TERMINAL = new Set(["completed", "failed", "insufficient_evidence", "cancelled"]);

export default function Running({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState<any>({ status: "queued", pages_done: 0, pages_total: 0 });
  const [cancelling, setCancelling] = useState(false);

  // Poll the async job until it completes (WebSocket in production).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.auditStatus(params.id);
        if (!stop) setStatus(s);
        if (!stop && !TERMINAL.has(s.status)) setTimeout(tick, 2000);
      } catch { if (!stop) setTimeout(tick, 3000); }
    };
    tick();
    return () => { stop = true; };
  }, [params.id]);

  async function cancelAudit() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await api.cancelAudit(params.id);
      setStatus((s: any) => ({ ...s, status: "cancelled" }));
    } catch { setCancelling(false); }
  }

  const idx = STATES.indexOf(status.status);
  const done = status.status === "completed";

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Auditing {status.domain || "…"}</h1>
            <div className="gx-muted">
              This page updates itself while the engine works. You can close it — the audit
              keeps running, and the report will be waiting under Audit History.
            </div>
          </div>
        </div>

        <div className="gx-card"><div className="gx-card-body">
          {/* A row of badges gave no sense of a pipeline — which stage follows
              which, or how far along this run is. */}
          <div className="gx-steps-rail">
            {STATES.map((st, i) => (
              <div key={st} className={`gx-stage ${i < idx ? "gx-stage-done" : i === idx ? "gx-stage-now" : ""}`}>
                <span className="gx-stage-dot">
                  {i < idx ? <i className="bi bi-check-lg" aria-hidden="true" /> : i + 1}
                </span>
                <div className="gx-stage-name">{st}</div>
              </div>
            ))}
          </div>

          {/* pages crawled: the only number that moves during the long middle */}
          {!done && status.pages_total > 0 && (
            <div className="d-flex align-items-center gap-3 mt-4">
              <span className="gx-meter flex-grow-1">
                <span style={{ width: `${Math.round((status.pages_done / status.pages_total) * 100)}%`,
                               background: "var(--gx-action)" }} />
              </span>
              <span className="gx-num gx-muted" style={{ fontSize: ".8125rem" }}>
                {status.pages_done} of {status.pages_total} pages
              </span>
            </div>
          )}

          <div className="gx-muted small mt-3">
            Task <code>{params.id}</code>
          </div>
        </div></div>

        {done ? (
          <div className="alert alert-success d-flex justify-content-between align-items-center">
            <span><i className="bi bi-check-circle-fill me-1" aria-hidden="true" />Completed — GovUX Score <b>{status.overall_score}</b> · Band {status.band}
              {status.guardrail_active && <span className="badge text-bg-warning ms-2">guard-rail active</span>}</span>
            <Link href={`/audits/${params.id}/report`} className="btn btn-primary btn-sm">View report →</Link>
          </div>
        ) : status.status === "failed" ? (
          <div className="alert alert-danger">
            <b>This audit failed.</b>
            <div className="small mt-1">
              It will be retried automatically a few times. If it keeps failing, the site is
              usually blocking automated tools or timing out — try a smaller page count, or
              check that the audit network can reach it.
            </div>
            <Link href="/audits/new" className="btn btn-outline-secondary btn-sm mt-2">Start another audit</Link>
          </div>
        ) : status.status === "insufficient_evidence" ? (
          <div className="alert alert-warning">
            <b>We couldn’t capture this site, so no score was issued.</b>
            <div className="small mt-1">
              The home page was unreachable from the audit network — usually a timeout, a WAF, or a
              geo-block on non-Indian traffic. A score is deliberately withheld rather than guessed from
              incomplete evidence. Confirm the site is reachable (and allowlists our audit IPs), then run it again.
            </div>
            <Link href="/audits/new" className="btn btn-outline-secondary btn-sm mt-2">Try another audit →</Link>
          </div>
        ) : status.status === "cancelled" ? (
          <div className="alert alert-secondary">
            <b>Audit cancelled.</b>
            <div className="small mt-1">This audit was cancelled before completion. No score was issued.</div>
            <Link href="/audits/new" className="btn btn-outline-secondary btn-sm mt-2">Start a new audit →</Link>
          </div>
        ) : (
          <div className="gx-card"><div className="gx-card-body">
            <div className="d-flex align-items-center gap-2">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
              <span>Running the engine — Playwright · Lighthouse · axe-core · GIGW rules · responsiveness matrix…</span>
              <button type="button" className="btn btn-sm btn-outline-danger ms-auto"
                onClick={cancelAudit} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel audit"}
              </button>
            </div>
          </div></div>
        )}
      </div>
    </AppShell>
  );
}
