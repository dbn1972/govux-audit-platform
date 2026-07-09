"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const STATES = ["queued", "crawling", "analyzing", "scoring", "completed"];

export default function Running({ params }: { params: { id: string } }) {
  const [status, setStatus] = useState<any>({ status: "queued", pages_done: 0, pages_total: 0 });

  // Poll the async job until it completes (WebSocket in production).
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.auditStatus(params.id);
        if (!stop) setStatus(s);
        if (!stop && s.status !== "completed" && s.status !== "failed") setTimeout(tick, 2000);
      } catch { if (!stop) setTimeout(tick, 3000); }
    };
    tick();
    return () => { stop = true; };
  }, [params.id]);

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
        ) : (
          <div className="card shadow-sm"><div className="card-body">
            <div className="d-flex align-items-center gap-2">
              <div className="spinner-border spinner-border-sm text-primary" role="status" />
              <span>Running the engine — Playwright · Lighthouse · axe-core · GIGW rules · responsiveness matrix…</span>
            </div>
          </div></div>
        )}
      </div>
    </AppShell>
  );
}
