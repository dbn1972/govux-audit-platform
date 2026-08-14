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
      <div className="container-fluid p-4">
        <h1 className="h3">Auditing {status.domain || "…"}</h1>
        <p className="text-secondary small">Task ID <b>{params.id}</b> · runs in the background — you can leave this page.</p>

        <div className="card shadow-sm mb-3"><div className="card-body">
          <div className="d-flex align-items-center flex-wrap gap-2">
            {STATES.map((s, i) => (
              <span key={s} className={`badge rounded-pill ${i < idx ? "text-bg-success" : i === idx ? "text-bg-primary" : "text-bg-light"}`}>
                {i < idx ? "✓ " : i === idx ? "● " : ""}{s}
              </span>
            ))}
          </div>
          <div className="text-secondary small mt-2">
            Status auto-updates by polling <code>GET /v1/audits/{params.id}</code> (WebSocket in production).
          </div>
        </div></div>

        {done ? (
          <div className="alert alert-success d-flex justify-content-between align-items-center">
            <span>✓ Completed — GovUX Score <b>{status.overall_score}</b> · Band {status.band}
              {status.guardrail_active && <span className="badge text-bg-warning ms-2">guard-rail active</span>}</span>
            <Link href={`/audits/${params.id}/report`} className="btn btn-primary btn-sm">View report →</Link>
          </div>
        ) : status.status === "failed" ? (
          <div className="alert alert-danger">Audit failed. It will be retried automatically (dead-letter after N).</div>
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
          <div className="card shadow-sm"><div className="card-body">
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
