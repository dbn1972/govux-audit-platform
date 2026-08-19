"use client";
import AppShell from "@/components/AppShell";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// The checklist used to be three prompts hard-coded here, and the answers were
// never sent anywhere — they drove a local "can you certify?" gate and vanished
// on navigation. It now comes from the guideline library (everything automation
// cannot decide) and every decision is persisted as it is made.

const VERDICT_STYLE: Record<string, string> = {
  compliant: "text-bg-success", partially_compliant: "text-bg-warning-subtle",
  non_compliant: "text-bg-danger",
};
// Phrased as the UX4G self-health-check does — a reviewer answers "does the site
// do this?", which is a question about the site, not a verdict on the guideline.
// The stored values stay pass/fail/not_applicable.
const DECISIONS: { value: string; label: string }[] = [
  { value: "pass", label: "Yes" },
  { value: "fail", label: "No" },
  { value: "not_applicable", label: "N/A" },
];
// Foundational is the mandated tier; a reviewer works through it first rather
// than meeting several hundred guidelines in one undifferentiated list.
const TIERS = ["Foundational", "Optimizing", "Advanced"];

export default function Review() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [audit, setAudit] = useState<any>(null);
  // null = still loading the pick-an-audit list; [] = none to certify yet
  const [choices, setChoices] = useState<any[] | null>(null);
  const [data, setData] = useState<any>(null);
  const [tier, setTier] = useState("Foundational");
  const [category, setCategory] = useState("");
  const [standard, setStandard] = useState("");
  // Website / App, as the UX4G self-check does. This platform audits websites,
  // so that is the default; 58 of the 412 guidelines are app-only patterns
  // (avatar menus, walkthrough screens) that cannot apply to a site.
  const [platform, setPlatform] = useState("website");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("audit");
    setTaskId(id);
    if (id) { api.auditStatus(id).then(setAudit).catch(() => setAudit(null)); return; }
    // No ?audit= in the URL. This page is a top-level nav item, so arriving
    // without one is the normal case, not a mistake — offer the completed
    // audits here rather than dead-ending on an instruction to go elsewhere.
    Promise.resolve(api.listAudits?.())
      .then((rows: any) => setChoices((rows || []).filter((r: any) => r.status === "completed")))
      .catch(() => setChoices([]));
  }, []);

  const load = useCallback(async (id: string, t: string, c: string, s: string, pf: string) => {
    setLoading(true); setErr("");
    try {
      setData(await api.reviewChecklist(id, {
        enforcement: t || undefined, category: c || undefined, standard: s || undefined,
        platform: pf }));
    } catch (e: any) {
      setErr(e?.message || "Could not load the checklist."); setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (taskId) load(taskId, tier, category, standard, platform); },
            [taskId, tier, category, standard, platform, load]);

  async function decide(guidelineId: string, decision: string, note?: string) {
    if (!taskId) return;
    setSavingId(guidelineId); setErr("");
    try {
      await api.setReviewItem(taskId, guidelineId, decision, note);
      // Reflect locally rather than refetching the whole list on every click.
      // Every derived total is recomputed from the updated items — deriving
      // some and not others is how a rating goes stale mid-review.
      setData((d: any) => {
        if (!d) return d;
        const items = d.items.map((i: any) =>
          i.guideline_id === guidelineId ? { ...i, decision, note: note ?? i.note } : i);
        const passed = items.filter((i: any) => i.decision === "pass").length;
        const failed = items.filter((i: any) => i.decision === "fail").length;
        return {
          ...d, items, passed, failed,
          decided: items.filter((i: any) => i.decision).length,
          rating: passed + failed ? Math.round((1000 * passed) / (passed + failed)) / 10 : null,
        };
      });
    } catch (e: any) {
      setErr(e?.message || "Could not record that decision.");
    } finally { setSavingId(null); }
  }

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

  const anyFail = (data?.failed ?? 0) > 0;
  const pct = data?.total ? Math.round((data.decided / data.total) * 100) : 0;

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Guided manual review</h1>
            <div className="gx-muted">Expert review of a completed audit against the GIGW&nbsp;3.0 / UX4G guideline set —
          the items automation cannot judge. A full <b>compliant</b> verdict requires this
          human sign-off; automated evidence alone can only reach <i>partially compliant</i>.</div>
          </div>
        </div>

        {!taskId && (
          <div className="gx-card">
            <div className="gx-card-body">
              <h2 className="h6 mb-1">Choose an audit to certify</h2>
              <p className="text-secondary small">
                Only completed audits can be certified. Every report also carries a
                <b> “Certify (expert review)”</b> action that opens it here directly.
              </p>
              {choices === null && (
                <div className="spinner-border spinner-border-sm text-secondary" role="status">
                  <span className="visually-hidden">Loading audits…</span>
                </div>
              )}
              {choices?.length === 0 && (
                <div className="alert alert-info mb-0" role="alert">
                  No completed audits yet — run one from{" "}
                  <Link href="/audits/new">New Audit</Link> first.
                </div>
              )}
              {!!choices?.length && (
                <ul className="list-group">
                  {choices.map((c: any) => (
                    <li key={c.task_id}
                        className="list-group-item d-flex flex-wrap align-items-center gap-3">
                      <div>
                        <div className="fw-semibold">{c.domain}</div>
                        <div className="text-secondary small">
                          {c.date ? new Date(c.date).toLocaleDateString() : "—"}
                          {c.score != null && <> · score {Math.round(c.score)}</>}
                          {c.compliance_status && <> · {c.compliance_status.replace(/_/g, " ")}</>}
                        </div>
                      </div>
                      <Link href={`/review?audit=${c.task_id}`}
                            className="btn btn-sm btn-primary ms-auto">
                        Review
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {taskId && audit && (
          <div className="gx-card mb-3">
            <div className="card-body d-flex flex-wrap align-items-center gap-3">
              <div>
                <div className="fw-semibold">{audit.domain}</div>
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

        {taskId && (
          <div className="gx-card mb-3">
            <div className="card-body d-flex flex-wrap gap-3 align-items-end">
              <div>
                <span className="form-label small fw-semibold mb-1 d-block">Platform</span>
                <div className="btn-group btn-group-sm" role="group" aria-label="Platform being reviewed">
                  {/* "Mobile app", not "App": the UX4G self-check's own Mobile
                      toggle means anything that renders on a phone, responsive
                      web included. This one means a native app, so the label
                      has to say so or a reviewer will read across from theirs. */}
                  {[["website", "Website"], ["app", "Mobile app"]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setPlatform(v)}
                      aria-pressed={platform === v}
                      className={`btn ${platform === v ? "btn-primary" : "btn-outline-secondary"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="rev-tier" className="form-label small fw-semibold mb-1">Enforcement tier</label>
                <select id="rev-tier" className="form-select" style={{ minWidth: 170 }}
                  value={tier} onChange={e => setTier(e.target.value)}>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="">All tiers</option>
                </select>
              </div>
              <div>
                <label htmlFor="rev-std" className="form-label small fw-semibold mb-1">Compliance</label>
                <select id="rev-std" className="form-select" style={{ minWidth: 180 }}
                  value={standard} onChange={e => setStandard(e.target.value)}>
                  <option value="">All compliances ({data?.reviewable_total ?? "—"})</option>
                  {(data?.standards || []).map((s: any) =>
                    <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="rev-cat" className="form-label small fw-semibold mb-1">Category</label>
                <select id="rev-cat" className="form-select" style={{ minWidth: 260 }}
                  value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {/* counts up front, as the UX4G self-check does — otherwise
                      choosing a filter is guesswork about what sits behind it */}
                  {(data?.categories || []).map((c: any) =>
                    <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
                </select>
              </div>
              {data && (
                <div className="ms-auto text-end">
                  <div className="text-secondary small">
                    {data.decided} of {data.total} answered
                    {data.failed > 0 && <span className="ms-2 fw-semibold text-danger">{data.failed} not met</span>}
                  </div>
                  <div className="progress mt-1" style={{ width: 220, height: 6 }}
                    role="progressbar" aria-label="Review progress"
                    aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  {/* Pass rate over ANSWERED items only, N/A excluded. Shown as a
                      compliance rating, not the GovUX score — that stays
                      deterministic and engine-derived. */}
                  {data.rating != null && (
                    <div className="small mt-1">
                      Compliance rating <b>{data.rating}%</b>
                      <span className="text-secondary"> ({data.passed} met / {data.passed + data.failed} assessed)</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {err && <div className="alert alert-warning py-2" role="alert">✗ {err}</div>}
        {loading && (
          <div className="text-secondary small py-3">
            <span className="spinner-border spinner-border-sm me-2" role="status" />Loading…
          </div>
        )}

        {data && !loading && (
          <div className="gx-card">
            <div className="list-group list-group-flush">
              {data.items.length === 0 && (
                <div className="list-group-item text-secondary small">
                  No guidelines match this filter.
                </div>
              )}
              {data.items.map((it: any) => (
                <div className="list-group-item" key={it.guideline_id}>
                  <div className="d-flex flex-wrap gap-2 align-items-center">
                    <span className="badge text-bg-primary-subtle">{it.guideline_id}</span>
                    <span className="badge text-bg-light border">{it.category}</span>
                    {it.severity && <span className="badge text-bg-light border">{it.severity}</span>}
                    {it.automation === "assisted" && (
                      <span className="badge text-bg-info-subtle" title="Machine gathers evidence, a human decides">
                        assisted
                      </span>
                    )}
                    <b className="w-100 mt-1">{it.title}</b>
                  </div>
                  {it.issue && <div className="text-secondary small mt-1">{it.issue}</div>}
                  {it.advice && (
                    <details className="small mt-1">
                      <summary className="text-primary" style={{ cursor: "pointer" }}>
                        How to meet it
                      </summary>
                      <div className="mt-1">{it.advice}</div>
                      {it.good_example && <div className="mt-1"><b>Pass:</b> {it.good_example}</div>}
                      {it.bad_example && <div className="mt-1"><b>Fail:</b> {it.bad_example}</div>}
                      {it.reference && <div className="text-secondary mt-1">{it.reference}</div>}
                    </details>
                  )}
                  <div className="btn-group btn-group-sm mt-2" role="group"
                    aria-label={`Decision for ${it.guideline_id}`}>
                    {DECISIONS.map(o => (
                      <button key={o.value} type="button" disabled={savingId === it.guideline_id}
                        onClick={() => decide(it.guideline_id, o.value)}
                        className={`btn ${it.decision === o.value ? "btn-primary" : "btn-outline-secondary"}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {it.note && <div className="text-secondary small mt-1"><i>Note:</i> {it.note}</div>}
                </div>
              ))}
            </div>

            <div className="card-footer bg-white">
              <label htmlFor="review-notes" className="form-label small fw-semibold mb-1">
                Assessor notes (optional)
              </label>
              <textarea id="review-notes" className="form-control form-control-sm mb-2" rows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. keyboard trap on the payment step; alt text accurate on all banners." />
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
                    title={anyFail ? "Resolve failing items before certifying" : ""}>
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
        )}
      </div>
    </AppShell>
  );
}
