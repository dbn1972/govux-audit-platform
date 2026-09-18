"use client";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";
import { relative, absolute } from "@/lib/format";

// The checklist used to be three prompts hard-coded here, and the answers were
// never sent anywhere — they drove a local "can you certify?" gate and vanished
// on navigation. It now comes from the guideline library (everything automation
// cannot decide) and every decision is persisted as it is made.

const VERDICT_STYLE: Record<string, string> = {
  compliant: "ux4g-tag-tonal-success ux4g-tag-s", partially_compliant: "ux4g-tag-tonal-warning ux4g-tag-s",
  non_compliant: "ux4g-tag-tonal-error ux4g-tag-s",
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
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [domains, setDomains] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [appName, setAppName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [starting, setStarting] = useState(false);
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

  // The picker's three lists. Refetched every time the screen returns to it,
  // because it never unmounts on the way out — see below.
  const loadPicker = useCallback(() => {
    Promise.resolve(api.listAudits?.())
      .then((rows: any) => setChoices((rows || []).filter((r: any) => r.status === "completed")))
      .catch(() => setChoices([]));
    // every domain, not only the audited ones — a manual review needs no crawl
    api.listDomains().then(setDomains).catch(() => setDomains([]));
    api.manualAssessments().then(setAssessments).catch(() => setAssessments([]));
  }, []);

  // /review and /review?assessment=… are the SAME route, so moving between them
  // is a soft navigation: React keeps this component mounted, state and all, and
  // a mount-only effect never runs again. The URL changed and nothing else did —
  // which is why "Continue" left you on the picker and "All manual reviews" left
  // you on the checklist. Every in-page link therefore states where it is going
  // (openAudit / openAssessment / showPicker) instead of relying on a re-read,
  // and popstate covers the browser's own back and forward buttons.
  const showPicker = useCallback(() => {
    setTaskId(null); setAssessmentId(null);
    // both must go: the picker and the checklist are gated separately, so a
    // stale `data` would render the checklist underneath the picker
    setData(null); setAudit(null); setResult(null);
    setCategory(""); setNotes(""); setErr("");
    loadPicker();
  }, [loadPicker]);

  const openAudit = useCallback((id: string) => {
    setAssessmentId(null); setData(null); setResult(null);
    setCategory(""); setNotes(""); setErr("");
    setTaskId(id);
    api.auditStatus(id).then(setAudit).catch(() => setAudit(null));
  }, []);

  const openAssessment = useCallback((id: string) => {
    setTaskId(null); setAudit(null); setData(null); setResult(null);
    setCategory(""); setNotes(""); setErr("");
    setAssessmentId(id);
  }, []);

  const syncFromUrl = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get("audit"), m = p.get("assessment");
    // This page is a top-level nav item, so arriving with neither is the normal
    // case, not a mistake — offer what can be reviewed rather than dead-ending
    // on an instruction to go elsewhere.
    if (a) openAudit(a);
    else if (m) openAssessment(m);
    else showPicker();
  }, [openAudit, openAssessment, showPicker]);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [syncFromUrl]);

  async function startAssessment(body: { domain_id?: string; subject?: string; platform: string }) {
    setStarting(true); setErr("");
    try {
      const a = await api.createManualAssessment(body);
      openAssessment(a.id);          // same reset every other way in performs
      window.history.replaceState({}, "", `/review?assessment=${a.id}`);
    } catch (e: any) {
      setErr(e?.message || "Could not start the assessment.");
    } finally { setStarting(false); }
  }

  // A review has two possible subjects: a completed engine audit, or a
  // standalone manual assessment of a domain nobody has crawled — or of a
  // mobile app, which the engine cannot crawl at all.
  const load = useCallback(async (id: string, kind: "audit" | "assessment",
                                  t: string, c: string, s: string, pf: string) => {
    setLoading(true); setErr("");
    const q = { enforcement: t || undefined, category: c || undefined,
                standard: s || undefined, platform: pf };
    try {
      setData(kind === "audit"
        ? await api.reviewChecklist(id, q)
        // No platform: an assessment's subject fixes it. Sending this screen's
        // default ("website") made every app assessment answer the website
        // corpus instead of the app one.
        : await api.assessmentChecklist(id, Object.fromEntries(
            Object.entries({ ...q, platform: undefined })
              .filter(([, v]) => v)) as Record<string, string>));
    } catch (e: any) {
      setErr(e?.message || "Could not load the checklist."); setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (taskId) load(taskId, "audit", tier, category, standard, platform);
    else if (assessmentId) load(assessmentId, "assessment", tier, category, standard, platform);
  }, [taskId, assessmentId, tier, category, standard, platform, load]);

  // Land on one category, never on all 151 items. "All categories" stays
  // available; it is just not what a reviewer is dropped into.
  useEffect(() => {
    if (!category && data?.categories?.length) setCategory(data.categories[0].name);
  }, [data, category]);

  async function decide(guidelineId: string, decision: string, note?: string) {
    if (!taskId && !assessmentId) return;
    setSavingId(guidelineId); setErr("");
    try {
      if (taskId) await api.setReviewItem(taskId, guidelineId, decision, note);
      else await api.setAssessmentItem(assessmentId!, guidelineId, decision, note);
      // Reflect locally rather than refetching the whole list on every click.
      // Every derived total is recomputed from the updated items — deriving
      // some and not others is how a rating goes stale mid-review.
      setData((d: any) => {
        if (!d) return d;
        const was = d.items.find((i: any) => i.guideline_id === guidelineId);
        const items = d.items.map((i: any) =>
          i.guideline_id === guidelineId ? { ...i, decision, note: note ?? i.note } : i);
        // Totals span the whole subject, not this page, so they move by the
        // delta of this one answer. Recounting the visible rows would drop
        // every decision made in another category the moment one was changed.
        const prev = was?.decision;
        const passed = d.passed + (decision === "pass" ? 1 : 0) - (prev === "pass" ? 1 : 0);
        const failed = d.failed + (decision === "fail" ? 1 : 0) - (prev === "fail" ? 1 : 0);
        // The rail's answered-of-total is the map of what is left, and it was
        // frozen until the next refetch: a reviewer could answer a whole
        // category and watch it still read 0/8.
        const categories = !prev && was?.category
          ? d.categories.map((c: any) =>
              c.name === was.category ? { ...c, answered: Math.min(c.answered + 1, c.count) } : c)
          : d.categories;
        return {
          ...d, items, passed, failed, categories,
          decided: d.decided + (prev ? 0 : 1),
          page_decided: (d.page_decided ?? 0) + (prev ? 0 : 1),
          rating: passed + failed ? Math.round((1000 * passed) / (passed + failed)) / 10 : null,
        };
      });
    } catch (e: any) {
      setErr(e?.message || "Could not record that decision.");
    } finally { setSavingId(null); }
  }

  async function signOff(approved: boolean) {
    if (!taskId && !assessmentId) return;
    setBusy(true); setErr("");
    try {
      if (taskId) {
        const r = await api.reviewAudit(taskId, approved, notes || undefined);
        setResult(r.compliance);
      } else {
        const r = await api.signOffAssessment(assessmentId!, approved, notes || undefined);
        setResult({ status: r.verdict,
                    reason: `${r.answered} item${r.answered === 1 ? "" : "s"} assessed, ${r.failed} not met` });
      }
    } catch (e: any) {
      setErr(e?.message || "Could not record the review.");
    } finally { setBusy(false); }
  }

  const anyFail = (data?.failed ?? 0) > 0;
  const pct = data?.reviewable_total
    ? Math.round((data.decided / data.reviewable_total) * 100) : 0;
  // Both routes through this screen — an engine audit, or a standalone
  // assessment. Everything below used to be gated on `taskId` alone, so an
  // assessment rendered a checklist with no subject, no filters, no progress
  // and two permanently-disabled sign-off buttons: several hundred answers
  // with no way to record a verdict at the end of them.
  const reviewing = !!(taskId || assessmentId);
  // A signed-off assessment is a record, not a form. The API already refuses
  // to change one; offering the controls anyway only produces errors.
  const locked = data?.status === "signed_off";

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Guided manual review</h1>
            <div className="gx-muted">Expert review against the GIGW&nbsp;3.0 / UX4G guideline set — the items
          automation cannot judge. Sign off a completed audit, or assess a website or mobile app
          by hand with no crawl behind it. A full <b>compliant</b> verdict requires this
          human sign-off; automated evidence alone can only reach <i>partially compliant</i>.</div>
          </div>
        </div>

        {!taskId && !assessmentId && (
          <>
          {/* Two ways in, and the second is the one that was missing: a manual
              review needed a completed crawl behind it, so an org with three
              domains could review only the one it had audited — and a mobile
              app, which the engine cannot crawl, had no route at all. */}
          <div className="gx-card">
            <div className="gx-card-head">
              <h2>Assess without an audit</h2>
              <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
                No crawl needed
              </span>
            </div>
            <div className="gx-card-body">
              <p className="gx-muted">
                Answer the checklist directly for any registered domain, or for a mobile app.
                This produces a compliance verdict and a completion rating — not a GovUX score,
                which only the engine can produce from evidence it gathered itself.
              </p>

              <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
                <div className="ux4g-cols-span-12 ux4g-lg-cols-span-6">
                  <label className="ux4g-label-m-default" htmlFor="assess-domain">Website</label>
                  <select id="assess-domain" className="ux4g-form-select ux4g-mb-s" defaultValue=""
                    onChange={(e) => e.target.value &&
                      startAssessment({ domain_id: e.target.value, platform: "website" })}
                    disabled={starting || !domains.length}>
                    <option value="">
                      {domains.length ? "Choose a registered domain…" : "No domains registered yet"}
                    </option>
                    {domains.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.url}</option>
                    ))}
                  </select>
                  {/* An assessor is regularly asked about a site their own
                      organisation has not registered — or cannot, because
                      another department holds the claim. Registering is not a
                      precondition for answering questions about one. */}
                  <label className="ux4g-label-m-default" htmlFor="assess-url">
                    …or any <code>.gov.in</code> / <code>.nic.in</code> address
                  </label>
                  <div className="ux4g-d-flex ux4g-gap-xs">
                    <input id="assess-url" className="ux4g-input ux4g-w-100" value={siteUrl}
                      placeholder="e.g. cept.gov.in"
                      onChange={(e) => setSiteUrl(e.target.value)} />
                    <button className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-md" disabled={!siteUrl.trim() || starting}
                      onClick={() => startAssessment({ subject: siteUrl.trim(), platform: "website" })}>
                      Start website
                    </button>
                  </div>
                  <div className="ux4g-input-helper"><span className="ux4g-input-helper-text">
                    Verification is only needed to run the engine, not to assess by hand.
                  </span></div>
                </div>

                <div className="ux4g-cols-span-12 ux4g-lg-cols-span-6">
                  <label className="ux4g-label-m-default" htmlFor="assess-app">Mobile app</label>
                  <div className="ux4g-d-flex ux4g-gap-xs">
                    <input id="assess-app" className="ux4g-input ux4g-w-100" value={appName}
                      placeholder="e.g. India Post Mobile"
                      onChange={(e) => setAppName(e.target.value)} />
                    <button className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-md" disabled={!appName.trim() || starting}
                      onClick={() => startAssessment({ subject: appName.trim(), platform: "app" })}>
                      Start app
                    </button>
                  </div>
                  <div className="ux4g-input-helper"><span className="ux4g-input-helper-text">
                    Scoped to the guidelines that apply to a native app.
                  </span></div>
                </div>
              </div>

              {/* Signed-off assessments were listed under "in progress" with a
                  View button — the two are different things, and which one a
                  row is decides whether it can still be answered. */}
              {[["Assessments in progress", false], ["Signed off", true]].map(([heading, done]) => {
                const rows = assessments.filter((a: any) =>
                  (a.status === "signed_off") === done);
                if (!rows.length) return null;
                return (
                  <div key={heading as string}>
                    <h3 className="h6 ux4g-mt-m ux4g-mb-xs">{heading as string}</h3>
                    <ul className="ux4g-list ux4g-list-m ux4g-list-default">
                      {rows.map((a: any) => (
                        <li key={a.id} className="ux4g-list-item">
                          <div className="ux4g-list-item-row ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-s">
                          <div>
                            <div className="ux4g-fw-semibold">{a.subject}</div>
                            <div className="gx-muted small">
                              {a.platform === "app" ? "Mobile app" : "Website"} · {a.answered} answered
                              {a.created_at && <> · started {relative(a.created_at)}</>}
                              {done && a.verdict && <> · <b>{a.verdict.replace(/_/g, " ")}</b></>}
                            </div>
                          </div>
                          <Link href={`/review?assessment=${a.id}`}
                                onClick={() => openAssessment(a.id)}
                                className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm ux4g-ml-auto">
                            {done ? "View" : "Continue"}
                          </Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="gx-card">
            <div className="gx-card-body">
              <h2 className="h6 ux4g-mb-2xs">Certify a completed audit</h2>
              <p className="gx-muted small">
                Only completed audits can be certified. Every report also carries a
                <b> “Certify (expert review)”</b> action that opens it here directly.
              </p>
              {choices === null && (
                <Spinner size="sm" label="Loading audits…" className="gx-muted" />
              )}
              {choices?.length === 0 && (
                <div className="ux4g-alert ux4g-alert-info ux4g-mb-none" role="alert">
                  No completed audits yet — run one from{" "}
                  <Link href="/audits/new">New Audit</Link> first.
                </div>
              )}
              {!!choices?.length && (
                <ul className="ux4g-list ux4g-list-m ux4g-list-default">
                  {choices.map((c: any) => (
                    <li key={c.task_id} className="ux4g-list-item">
                      <div className="ux4g-list-item-row ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-s">
                      <div>
                        <div className="ux4g-fw-semibold">{c.domain}</div>
                        <div className="gx-muted small">
                          {absolute(c.date)}
                          {c.score != null && <> · score {Math.round(c.score)}</>}
                          {c.compliance_status && <> · {c.compliance_status.replace(/_/g, " ")}</>}
                        </div>
                      </div>
                      <Link href={`/review?audit=${c.task_id}`}
                            onClick={() => openAudit(c.task_id)}
                            className="ux4g-btn ux4g-btn-primary ux4g-btn-sm ux4g-ml-auto">
                        Review
                      </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </>
        )}

        {/* What is being reviewed, said once at the top. An assessment showed
            no subject at all: the reviewer had answered questions about a site
            the page never named. */}
        {reviewing && (
          <div className="gx-card">
            <div className="gx-card-body ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-s">
              <div>
                <div className="gx-label">
                  {taskId ? "Certifying audit of"
                    : data?.platform === "app" ? "Assessing mobile app" : "Assessing website"}
                </div>
                <div className="ux4g-fw-semibold" style={{ fontSize: "1.0625rem" }}>
                  {taskId ? (audit?.domain || "…") : (data?.subject || "…")}
                </div>
                <div className="gx-muted small">
                  {taskId ? <>Task {taskId}</>
                    : <>Answered by hand — no engine run behind this, so it yields a
                        compliance verdict, not a GovUX score.</>}
                </div>
              </div>
              {/* right-aligned only while it sits beside the subject; once it
                  wraps under it on a phone, right-aligned reads as a mistake */}
              <div className="ux4g-ml-auto ux4g-text-start text-md-end">
                {taskId && audit && (
                  <>
                    <div className="gx-muted small">Current legal verdict</div>
                    <span className={VERDICT_STYLE[audit.compliance_status] || "ux4g-tag-tonal-neutral ux4g-tag-s"}>
                      {(audit.compliance_status || "—").replace(/_/g, " ")}
                    </span>
                    <span className="gx-muted small ux4g-ml-xs">({audit.confidence || "automated_only"})</span>
                  </>
                )}
                {assessmentId && data && (
                  <>
                    <div className="gx-muted small">Status</div>
                    <span className={locked
                      ? VERDICT_STYLE[data.verdict] || "ux4g-tag-tonal-neutral ux4g-tag-s" : "ux4g-tag-tonal-neutral ux4g-tag-s"}>
                      {locked ? (data.verdict || "signed off").replace(/_/g, " ") : "in progress"}
                    </span>
                    {locked && data.signed_off_at && (
                      <div className="gx-muted small ux4g-mt-2xs">{absolute(data.signed_off_at)}</div>
                    )}
                  </>
                )}
              </div>
              <div style={{ flexBasis: "100%" }}>
                <Link href="/review" onClick={showPicker} className="small">
                  ← All manual reviews
                </Link>
              </div>
            </div>
          </div>
        )}

        {reviewing && (
          <div className="gx-card ux4g-mb-s">
            <div className="gx-card-body ux4g-d-flex ux4g-flex-wrap ux4g-gap-s ux4g-ai-end">
              {/* An assessment's platform is fixed when it is started — it is
                  what the subject IS — so it is stated in the header above
                  rather than offered as a control that would silently change
                  which corpus the answers already recorded belong to. */}
              {taskId && (
              <div>
                <span className="ux4g-label-m-default small ux4g-fw-semibold ux4g-mb-2xs ux4g-d-block">Platform</span>
                <div className="ux4g-d-inline-flex ux4g-gap-2xs" role="group" aria-label="Platform being reviewed">
                  {/* "Mobile app", not "App": the UX4G self-check's own Mobile
                      toggle means anything that renders on a phone, responsive
                      web included. This one means a native app, so the label
                      has to say so or a reviewer will read across from theirs. */}
                  {[["website", "Website"], ["app", "Mobile app"]].map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setPlatform(v)}
                      aria-pressed={platform === v}
                      className={`ux4g-btn ux4g-btn-sm ${platform === v ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              )}
              <div>
                <label htmlFor="rev-tier" className="ux4g-label-m-default small ux4g-fw-semibold ux4g-mb-2xs">Enforcement tier</label>
                <select id="rev-tier" className="ux4g-form-select" style={{ minWidth: 170 }}
                  value={tier} onChange={e => setTier(e.target.value)}>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="">All tiers</option>
                </select>
              </div>
              <div>
                <label htmlFor="rev-std" className="ux4g-label-m-default small ux4g-fw-semibold ux4g-mb-2xs">Compliance</label>
                <select id="rev-std" className="ux4g-form-select" style={{ minWidth: 215 }}
                  value={standard} onChange={e => setStandard(e.target.value)}>
                  <option value="">All compliances ({data?.reviewable_total ?? "—"})</option>
                  {(data?.standards || []).map((s: any) =>
                    <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="rev-cat" className="ux4g-label-m-default small ux4g-fw-semibold ux4g-mb-2xs">Category</label>
                <select id="rev-cat" className="ux4g-form-select" style={{ minWidth: 260 }}
                  value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {/* counts up front, as the UX4G self-check does — otherwise
                      choosing a filter is guesswork about what sits behind it */}
                  {(data?.categories || []).map((c: any) =>
                    <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Was tucked into the corner of the filter bar. An assessor asks "how
            far am I" constantly across a few hundred rows, so it follows them
            down the page instead. */}
        {reviewing && data && (
          <div className="gx-review-progress">
            <div style={{ minWidth: 180 }}>
              <div className="gx-label">Progress</div>
              <div className="ux4g-fw-semibold gx-num">
                {data.decided} of {data.reviewable_total ?? data.total} answered
              </div>
            </div>
            <div className="ux4g-flex-grow-1" style={{ minWidth: 160 }}>
              <article className="ux4g-progress-bar" role="progressbar" aria-label="Review progress"
                aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                data-ux-progress-bar data-ux-shape="rounded" data-ux-label-placement="outside">
                <div className="ux4g-progress-bar-track"><div className="ux4g-progress-bar-fill" style={{ width: `${pct}%` }} /></div>
              </article>
            </div>
            {data.failed > 0 && (
              <div className="ux4g-text-end">
                <div className="gx-label">Not met</div>
                <div className="ux4g-fw-bold gx-num" style={{ color: "var(--gx-band-E)" }}>{data.failed}</div>
              </div>
            )}
            {/* Pass rate over ANSWERED items only, N/A excluded. A compliance
                rating, NOT the GovUX score — that stays engine-derived. */}
            {data.rating != null && (
              <div className="ux4g-text-end">
                <div className="gx-label">Compliance rating</div>
                <div className="ux4g-fw-bold gx-num">{data.rating}%
                  <span className="gx-muted ux4g-fw-regular" style={{ fontSize: ".8125rem" }}>
                    {" "}({data.passed} met of {data.passed + data.failed})
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {err && <div className="ux4g-alert ux4g-alert-warning ux4g-py-xs" role="alert">✗ {err}</div>}
        {loading && !data && (
          <div className="gx-muted small ux4g-py-s">
            <Spinner size="sm" className="ux4g-mr-xs" />Loading…
          </div>
        )}

        {/* Kept mounted while refetching. Unmounting on every filter change made
            the whole checklist blink out and the page jump — and a reviewer
            changes filters constantly. Dimmed and marked busy instead. */}
        {data && (
          <div className="gx-review-layout" aria-busy={loading}
            style={{ opacity: loading ? 0.55 : 1, transition: "opacity .12s ease-out" }}>
            {/* The rail turns "a 400-field form" into "26 short ones", and
                doubles as the map of what is left: each category carries its own
                answered-of-total, so a reviewer can see where the work is
                without opening every one. */}
            <nav className="gx-catrail" aria-label="Guideline categories">
              <button type="button" onClick={() => setCategory("")}
                aria-current={category === "" ? "true" : undefined}
                className="gx-catrail-item">
                All categories
                <span className="gx-catrail-count">{data.reviewable_total}</span>
              </button>
              {(data.categories || []).map((c: any) => {
                const done = c.answered >= c.count;
                return (
                  <button key={c.name} type="button" onClick={() => setCategory(c.name)}
                    aria-current={category === c.name ? "true" : undefined}
                    className={`gx-catrail-item ${done ? "gx-catrail-done" : ""}`}>
                    <span>{c.name}</span>
                    <span className="gx-catrail-count">
                      {done ? <Icon name="check-lg" size={16} /> : `${c.answered}/${c.count}`}
                    </span>
                  </button>
                );
              })}
            </nav>

          <div className="gx-card">
            <div className="gx-card-head">
              <h2>{category || "All categories"}</h2>
              <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
                {data.page_decided ?? 0} of {data.items.length} answered here
              </span>
            </div>
            {(() => {
              const whole = (data.categories || []).find((c: any) => c.name === category)?.count;
              if (!category || !whole || whole <= data.items.length) return null;
              return (
                <div className="gx-muted small ux4g-px-m ux4g-pb-xs" style={{ marginTop: "-.25rem" }}>
                  Showing the {tier ? `${tier.toLowerCase()} ` : ""}items in this category —
                  {" "}{data.items.length} of {whole}. The rail counts the whole category;
                  choose <b>All tiers</b> to see the rest.
                </div>
              );
            })()}
            <div>
              {data.items.length === 0 && (
                <div className="gx-muted ux4g-text-center ux4g-py-l">
                  No guidelines match this filter. Widen the tier or category to see more.
                </div>
              )}
              {data.items.map((it: any) => (
                <div key={it.guideline_id}
                  className={`gx-check ${it.decision === "pass" ? "gx-check-pass"
                    : it.decision === "fail" ? "gx-check-fail"
                    : it.decision === "not_applicable" ? "gx-check-na" : ""}`}>
                  <div>
                    {/* the question leads; its provenance follows. The title was
                        third in reading order behind four badges. */}
                    <div className="gx-check-title">{it.title}</div>
                    <div className="gx-check-meta">
                      <span className="gx-chip">{it.guideline_id}</span>
                      <span className="gx-chip">{it.category}</span>
                      {it.severity && <span className="gx-chip">{it.severity}</span>}
                      {it.automation === "assisted" && (
                        <span className="ux4g-tag-tonal-info ux4g-tag-s"
                          title="Machine gathers evidence, a human decides">assisted</span>
                      )}
                    </div>
                    {it.issue && <div className="gx-muted small ux4g-mt-xs">{it.issue}</div>}
                    {it.advice && (
                      <details className="small ux4g-mt-xs">
                        <summary style={{ cursor: "pointer", color: "var(--ux4g-text-brand-primary-default)" }}>
                          How to meet it
                        </summary>
                        <div className="ux4g-mt-xs">{it.advice}</div>
                        {it.good_example && <div className="ux4g-mt-2xs"><b>Pass:</b> {it.good_example}</div>}
                        {it.bad_example && <div className="ux4g-mt-2xs"><b>Fail:</b> {it.bad_example}</div>}
                        {it.reference && <div className="gx-muted ux4g-mt-2xs">{it.reference}</div>}
                      </details>
                    )}
                    {it.note && <div className="gx-muted small ux4g-mt-xs"><i>Note:</i> {it.note}</div>}
                  </div>

                  <div className="gx-check-actions">
                    <div className="ux4g-d-inline-flex ux4g-gap-2xs" role="group"
                      aria-label={`Does the site meet ${it.guideline_id}?`}>
                      {DECISIONS.map(o => (
                        <button key={o.value} type="button"
                          disabled={savingId === it.guideline_id || locked}
                          onClick={() => decide(it.guideline_id, o.value)}
                          aria-pressed={it.decision === o.value}
                          className={`ux4g-btn ux4g-btn-sm ${it.decision === o.value ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    {savingId === it.guideline_id && (
                      <span className="gx-muted" style={{ fontSize: ".75rem" }}>Saving…</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {category && (data.categories || []).length > 1 && (
              <div className="gx-review-pager">
                {(() => {
                  const names = (data.categories || []).map((c: any) => c.name);
                  const i = names.indexOf(category);
                  const prev = i > 0 ? names[i - 1] : null;
                  const next = i >= 0 && i < names.length - 1 ? names[i + 1] : null;
                  return (
                    <>
                      <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" disabled={!prev}
                        onClick={() => { setCategory(prev!); window.scrollTo({ top: 0 }); }}>
                        ← {prev || "Previous"}
                      </button>
                      <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
                        Category {i + 1} of {names.length}
                      </span>
                      <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm" disabled={!next}
                        onClick={() => { setCategory(next!); window.scrollTo({ top: 0 }); }}>
                        {next || "Last category"} →
                      </button>
                    </>
                  );
                })()}
              </div>
            )}

            <div className="gx-card-body" style={{ borderTop: "1px solid var(--gx-border)",
                                                    background: "var(--gx-surface-muted)" }}>
              <h2 className="h6 ux4g-mb-s">Sign off</h2>
              {locked && !result ? (
                <div className="ux4g-alert ux4g-alert-info ux4g-mb-none" role="status">
                  <b>Signed off {data.signed_off_at ? absolute(data.signed_off_at) : ""} —{" "}
                  {(data.verdict || "").replace(/_/g, " ") || "no verdict"}.</b>
                  <div className="small ux4g-mt-2xs">
                    {data.decided} of {data.reviewable_total ?? data.total} answered,
                    {" "}{data.failed} not met.
                    {" "}This record cannot be changed. Start a new assessment from{" "}
                    <Link href="/review" onClick={showPicker}>All manual reviews</Link>
                    {" "}to reassess this subject.
                  </div>
                  {data.notes && <div className="small ux4g-mt-xs"><i>Assessor notes:</i> {data.notes}</div>}
                </div>
              ) : (
              <>
              <label htmlFor="review-notes" className="ux4g-label-m-default">
                Assessor notes <span className="gx-muted ux4g-fw-regular">(optional)</span>
              </label>
              <textarea id="review-notes" className="ux4g-input ux4g-w-100 ux4g-mb-s" rows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="e.g. keyboard trap on the payment step; alt text accurate on all banners." />
              {result ? (
                <div className="ux4g-alert ux4g-alert-success ux4g-py-xs ux4g-mb-none" role="status">
                  <Icon name="patch-check" size={16} className="ux4g-mr-2xs" />
                  Sign-off recorded. {taskId ? "New legal verdict" : "Assessment verdict"}:{" "}
                  <b>{result.status.replace(/_/g, " ")}</b> — {result.reason}
                </div>
              ) : (
                <>
                  {/* the reason certification is blocked was a title attribute:
                      invisible to keyboard and touch, which is most of the
                      people this platform exists for */}
                  {anyFail && (
                    <div className="gx-callout ux4g-mb-s">
                      <Icon name="exclamation-triangle" size={16} />
                      <div>
                        <b>{data.failed} item{data.failed === 1 ? "" : "s"} answered “No”.</b> A site
                        cannot be certified compliant while a guideline is unmet — fix them and
                        re-answer, or reject this review as needing work.
                      </div>
                    </div>
                  )}
                  {/* Nothing answered is not a pass — the API refuses it, and
                      saying so here beats a 400 after the click. */}
                  {assessmentId && data.decided === 0 && (
                    <div className="gx-callout ux4g-mb-s">
                      <Icon name="info-circle" size={16} />
                      <div>Answer at least one guideline before signing off.</div>
                    </div>
                  )}
                  <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-center">
                    {/* These were gated on `!taskId`, so on an assessment both
                        were permanently disabled: the whole route dead-ended
                        one click from the end. */}
                    <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md"
                      disabled={!reviewing || busy || anyFail
                                || (!!assessmentId && data.decided === 0)}
                      onClick={() => signOff(true)}>
                      <Icon name="patch-check" size={16} className="ux4g-mr-2xs" />
                      {busy ? "Recording…" : "Certify compliant"}
                    </button>
                    <button className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-md" disabled={!reviewing || busy}
                      onClick={() => signOff(false)}>
                      Reject — needs work
                    </button>
                    <span className="gx-muted small ux4g-ml-2xs">
                      Either decision is recorded against your account in the audit log.
                    </span>
                  </div>
                </>
              )}
              </>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
