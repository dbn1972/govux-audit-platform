"use client";
import AppShell from "@/components/AppShell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Assessor prompts for the items automation can't judge (advisory aids for the human).
const ITEMS = [
  { id: "1", g: "WCAG 1.1.1", q: "Do images convey meaning through their alt text?", note: "Automated checks presence, not relevance — a human must judge." },
  { id: "2", g: "GIGW 2.1", q: "Is the content in plain, citizen-friendly language?", note: "Readability is flagged; suitability needs judgement." },
  { id: "3", g: "WCAG 2.4.6", q: "Do headings & labels describe topic or purpose?", note: "Review across the full application journey." },
];

const VERDICT_STYLE: Record<string, string> = {
  compliant: "text-bg-success", partially_compliant: "text-bg-warning-subtle",
  non_compliant: "text-bg-danger",
};

export default function Review() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [audit, setAudit] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("audit");
    setTaskId(id);
    if (id) api.auditStatus(id).then(setAudit).catch(() => setAudit(null));
  }, []);

  const set = (id: string, v: string) => setDecisions(d => ({ ...d, [id]: v }));
  const anyFail = Object.values(decisions).some(v => v === "Mark fail");

  async function signOff(approved: boolean) {
    if (!taskId) return;
    setBusy(true); setErr("");
    try {
      const r = await api.reviewAudit(taskId, approved, notes || undefined);
      setResult(r.compliance);
    } catch (e: any) {
      setErr(e?.message || "Could not record the review.");
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 900 }}>
        <h1 className="h3">Guided manual review</h1>
        <p className="text-secondary small">
          Expert review of a completed audit. A full <b>compliant</b> verdict requires this human
          sign-off — automated evidence alone can only reach <i>partially compliant</i>.
        </p>

        {!taskId && (
          <div className="alert alert-info" role="alert">
            Open this from a completed audit report to certify it —
            each report has a <b>“Certify (expert review)”</b> action.
          </div>
        )}

        {taskId && audit && (
          <div className="card shadow-sm mb-3">
            <div className="card-body d-flex flex-wrap align-items-center gap-3">
              <div>
                <div className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{audit.domain}</div>
                <div className="text-secondary small">Task {taskId}</div>
              </div>
              <div className="ms-auto text-end">
                <div className="text-secondary small">Current legal verdict</div>
                <span className={`badge ${VERDICT_STYLE[audit.compliance_status] || "text-bg-secondary"}`}>
                  {(audit.compliance_status || "—").replace(/_/g, " ")}
                </span>
                <span className="text-secondary small ms-2">({audit.confidence || "automated_only"})</span>
              </div>
            </div>
          </div>
        )}

        <div className="card shadow-sm">
          <div className="list-group list-group-flush">
            {ITEMS.map(it => (
              <div className="list-group-item" key={it.id}>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span className="badge text-bg-primary-subtle">{it.g}</span>
                  <b>{it.q}</b>
                </div>
                <div className="text-secondary small mt-1">{it.note}</div>
                <div className="btn-group btn-group-sm mt-2" role="group" aria-label={`Decision for ${it.g}`}>
                  {["Confirm pass", "Mark fail", "N/A"].map(o => (
                    <button key={o} onClick={() => set(it.id, o)}
                      className={`btn ${decisions[it.id] === o ? "btn-primary" : "btn-outline-secondary"}`}>{o}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card-footer bg-white">
            <label htmlFor="review-notes" className="form-label small fw-semibold mb-1">Assessor notes (optional)</label>
            <textarea id="review-notes" className="form-control form-control-sm mb-2" rows={2}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. keyboard trap on the payment step; alt text accurate on all banners." />
            {err && <div className="text-danger small mb-2">✗ {err}</div>}
            {result ? (
              <div className="alert alert-success py-2 mb-0" role="status">
                <i className="bi bi-patch-check me-1" />
                Sign-off recorded. New legal verdict:{" "}
                <b>{result.status.replace(/_/g, " ")}</b> — {result.reason}
              </div>
            ) : (
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <button className="btn btn-success btn-sm" disabled={!taskId || busy || anyFail}
                  onClick={() => signOff(true)}
                  title={anyFail ? "Resolve failed items before certifying" : ""}>
                  {busy ? "Recording…" : "✓ Certify compliant"}
                </button>
                <button className="btn btn-outline-danger btn-sm" disabled={!taskId || busy}
                  onClick={() => signOff(false)}>
                  Reject — needs work
                </button>
                <span className="text-secondary small ms-1">Assessor decision is audit-logged.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
