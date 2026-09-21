"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

const STATES = ["queued", "crawling", "analyzing", "scoring", "completed"];
// terminal states that must stop the poll loop (else the UI spins forever)
const TERMINAL = new Set(["completed", "failed", "insufficient_evidence", "cancelled"]);
// the three ways a run ends without a score, and what to call each in the heading
const STOPPED: Record<string, string> = {
  failed: "Audit failed",
  cancelled: "Audit cancelled",
  insufficient_evidence: "No score issued",
};

export default function Running({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState<any>({ status: "queued", pages_done: 0, pages_total: 0 });
  const [cancelling, setCancelling] = useState(false);
  // A poll that only ever retries is a poll that lies: with the API down this
  // screen sat on "Queued" behind a spinner indefinitely, saying nothing.
  const [unreachable, setUnreachable] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let stop = false;
    let fails = 0;
    const tick = async () => {
      try {
        const s = await api.auditStatus(params.id);
        if (stop) return;
        fails = 0;
        setUnreachable(false);
        setStatus(s);
        if (!TERMINAL.has(s.status)) setTimeout(tick, 2000);
      } catch {
        if (stop) return;
        // One dropped request is normal; a run of them is not. Back off rather
        // than hammering a service that is probably restarting.
        fails += 1;
        if (fails >= 2) setUnreachable(true);
        setTimeout(tick, Math.min(3000 * fails, 15000));
      }
    };
    tick();
    return () => { stop = true; };
  }, [params.id, retryKey]);

  const retry = useCallback(() => { setUnreachable(false); setRetryKey((k) => k + 1); }, []);

  async function cancelAudit() {
    if (cancelling) return;
    setCancelling(true);
    try {
      await api.cancelAudit(params.id);
      setStatus((s: any) => ({ ...s, status: "cancelled" }));
    } catch { setCancelling(false); }
  }

  const done = status.status === "completed";
  const stoppedLabel = STOPPED[status.status];

  /* Where the pipeline actually got to.
     - completed: past the end, so every stage reads as done — the old
       `i < idx` left the final stage showing "5" with a current-step ring
       next to an alert saying the audit had finished.
     - stopped: these statuses are not in STATES, so indexOf returned -1 and
       every stage rendered as never-started. The status payload does not say
       which stage failed, so infer only what the evidence supports: pages
       crawled means it reached crawling, otherwise it stopped at queued. */
  const activeIdx = done ? STATES.length
    : stoppedLabel ? (status.pages_done > 0 ? 1 : 0)
    : STATES.indexOf(status.status);

  // The domain and run date live in the AuditNav context bar above; repeating
  // them here put the same hostname twice within 40px.
  const heading = done ? "Audit complete" : stoppedLabel || "Audit in progress";

  const currentStage = STATES[activeIdx] || (done ? "completed" : status.status);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <AuditNav id={params.id} run={{ domain: status.domain, created_at: status.created_at }} />
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">{heading}</h1>
            {/* The old subtitle described a running engine and stayed on screen
                after the run had finished or failed. */}
            <div className="gx-muted">
              {done
                ? "The report is ready, and stays available under Audit history."
                : stoppedLabel
                  ? "This run ended without a score. Nothing further is happening on this page."
                  : "This page updates itself while the engine works. You can close it — the audit keeps running, and the report will be waiting under Audit history."}
            </div>
          </div>
        </div>

        {unreachable && (
          <div className="ux4g-alert ux4g-alert-warning ux4g-d-flex ux4g-ai-center ux4g-gap-xs ux4g-flex-wrap" role="alert">
            <Icon name="exclamation-triangle" size={16} />
            <span>Cannot reach the audit service, so this page has stopped updating. The audit itself keeps running.</span>
            <button type="button" onClick={retry}
              className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm ux4g-ml-auto">
              <Icon name="arrow-repeat" size={14} className="ux4g-mr-2xs" />Try again
            </button>
          </div>
        )}

        <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
          {/* A row of badges gave no sense of a pipeline — which stage follows
              which, or how far along this run is. */}
          <ol className="gx-steps-rail">
            {STATES.map((st, i) => {
              const state = i < activeIdx ? "gx-stage-done"
                : stoppedLabel && i === activeIdx ? "gx-stage-stopped"
                : i === activeIdx ? "gx-stage-now" : "";
              return (
                <li key={st} className={`gx-stage ${state}`}>
                  <span className="gx-stage-dot">
                    {i < activeIdx ? <Icon name="check-lg" size={16} />
                      : stoppedLabel && i === activeIdx ? <Icon name="x-lg" size={16} />
                      : i + 1}
                  </span>
                  <div className="gx-stage-name">{st}</div>
                </li>
              );
            })}
          </ol>

          {/* Nothing here was announced: a page that rewrites itself every two
              seconds told a screen-reader user precisely once, at load. */}
          <p className="ux4g-sr-only" aria-live="polite">
            {done ? `Audit complete. GovUX score ${status.overall_score}, band ${status.band}.`
              : stoppedLabel ? `${stoppedLabel}.`
              : `Stage ${activeIdx + 1} of ${STATES.length}: ${currentStage}.`}
          </p>

          {/* pages crawled: the only number that moves during the long middle */}
          {!done && !stoppedLabel && status.pages_total > 0 && (
            <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-s ux4g-mt-m">
              <span className="ux4g-progress-bar ux4g-progress-bar-track ux4g-flex-grow-1">
                <span style={{ width: `${Math.round((status.pages_done / status.pages_total) * 100)}%`,
                               background: "var(--ux4g-bg-primary-strong)" }} />
              </span>
              <span className="gx-num gx-muted" style={{ fontSize: ".8125rem" }}>
                {status.pages_done} of {status.pages_total} pages
              </span>
            </div>
          )}

          <div className="gx-muted ux4g-fs-14 ux4g-mt-s">
            Task <code className="gx-breakable">{params.id}</code>
          </div>
        </div></div>

        {/* .ux4g-alert is `display:flex; flex-direction:row; align-items:center`
            upstream, so the three terminal branches below — each a heading, a
            paragraph and an action — laid out as three columns: an 82px title,
            then the body, then the button squeezed into a 109px box three lines
            tall. They opt into a column the way the rest of this codebase does,
            with the utilities, rather than a blanket rule: seven alerts
            elsewhere pair an inline icon with text and must stay in a row. */}
        {done ? (
          <div className="ux4g-alert ux4g-alert-success ux4g-d-flex ux4g-jc-between ux4g-ai-center ux4g-flex-wrap ux4g-gap-xs"
            role="status">
            <span><Icon name="check-circle-fill" size={16} className="ux4g-mr-2xs" />Completed — GovUX Score <b>{status.overall_score}</b> · Band {status.band}
              {status.guardrail_active && <span className="ux4g-tag-tonal-warning ux4g-tag-s ux4g-ml-xs">guard-rail active</span>}</span>
            <Link href={`/audits/${params.id}/report`} className="ux4g-btn ux4g-btn-primary ux4g-btn-sm">View report →</Link>
          </div>
        ) : status.status === "failed" ? (
          <div className="ux4g-alert ux4g-alert-error ux4g-d-flex ux4g-flex-column ux4g-ai-start ux4g-gap-2xs" role="alert">
            <b>This audit failed.</b>
            <div className="ux4g-fs-14 ux4g-mt-2xs">
              It will be retried automatically a few times. If it keeps failing, the site is
              usually blocking automated tools or timing out — try a smaller page count, or
              check that the audit network can reach it.
            </div>
            <Link href="/audits/new" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm ux4g-mt-xs">Start another audit</Link>
          </div>
        ) : status.status === "insufficient_evidence" ? (
          <div className="ux4g-alert ux4g-alert-warning ux4g-d-flex ux4g-flex-column ux4g-ai-start ux4g-gap-2xs" role="alert">
            <b>We couldn’t capture this site, so no score was issued.</b>
            <div className="ux4g-fs-14 ux4g-mt-2xs">
              The home page was unreachable from the audit network — usually a timeout, a WAF, or a
              geo-block on non-Indian traffic. A score is deliberately withheld rather than guessed from
              incomplete evidence. Confirm the site is reachable (and allowlists our audit IPs), then run it again.
            </div>
            <Link href="/audits/new" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm ux4g-mt-xs">Try another audit →</Link>
          </div>
        ) : status.status === "cancelled" ? (
          <div className="ux4g-alert ux4g-alert-info ux4g-d-flex ux4g-flex-column ux4g-ai-start ux4g-gap-2xs" role="status">
            <b>Audit cancelled.</b>
            <div className="ux4g-fs-14 ux4g-mt-2xs">This audit was cancelled before completion. No score was issued.</div>
            <Link href="/audits/new" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm ux4g-mt-xs">Start a new audit →</Link>
          </div>
        ) : (
          <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-card-body">
            <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs ux4g-flex-wrap">
              <Spinner size="sm" />
              <span>Running the engine — Playwright · Lighthouse · axe-core · GIGW rules · responsiveness matrix…</span>
              <button type="button" className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-sm ux4g-ml-auto"
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
