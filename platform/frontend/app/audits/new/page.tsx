"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

type Domain = { id: string; url: string; verify_status: string; category?: string | null };

const CATS = [
  ["Accessibility — WCAG 2.2 AA", 22], ["Usability & UX heuristics", 17],
  ["GIGW 3.0 compliance", 15], ["Design foundation — UX4G", 11],
  ["Performance — Core Web Vitals", 12], ["Responsiveness & Compatibility", 10],
  ["Content quality & readability", 7], ["Trust, security & privacy", 6],
] as const;

export default function NewAudit() {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [domainId, setDomainId] = useState("");
  const [depth, setDepth] = useState(10);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [freePages, setFreePages] = useState(10);
  // larger-crawl request UI
  const [showReq, setShowReq] = useState(false);
  const [reqPages, setReqPages] = useState(25);
  const [reqReason, setReqReason] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [reqBusy, setReqBusy] = useState(false);

  // Only verified domains can be audited (the API enforces this too). Pre-select
  // the one passed from the dashboard's "Run audit →" link when it's present.
  useEffect(() => {
    api.listDomains()
      .then((d: Domain[]) => {
        const verified = (d || []).filter((x) => x.verify_status === "verified");
        setDomains(verified);
        const pre = new URLSearchParams(window.location.search).get("domain");
        setDomainId(pre && verified.some((x) => x.id === pre) ? pre : verified[0]?.id || "");
      })
      .catch((e: any) => { setErr(e?.message || "Could not load your domains."); setDomains([]); });
    api.me().then((m) => setFreePages(m?.entitlements?.free_pages_per_audit ?? 10)).catch(() => {});
  }, []);

  async function submit() {
    if (!domainId || busy) return;
    setBusy(true); setErr("");
    try {
      const res = await api.submitAudit(domainId, depth);   // -> 202 { task_id }
      router.push(`/audits/${res.task_id}`);
    } catch (e: any) {
      setErr(e?.message || "Could not start the audit. Please try again.");
      setBusy(false);
    }
  }

  async function requestCrawl() {
    if (!domainId || reqBusy) return;
    setReqBusy(true); setReqMsg("");
    try {
      await api.createScanRequest(domainId, reqPages, reqReason || undefined);
      setReqMsg(`✓ Request for ${reqPages} pages submitted — a steward will review it. You can keep running standard audits meanwhile.`);
      setShowReq(false);
    } catch (e: any) {
      setReqMsg("✗ " + (e?.message || "Could not submit the request."));
    } finally { setReqBusy(false); }
  }

  const noDomains = domains != null && domains.length === 0;

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Configure audit</h1>
            <div className="gx-muted">Submitting returns a task ID instantly; the audit runs in the background.</div>
          </div>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-8">
            <div className="gx-card ux4g-mb-s"><div className="gx-card-body">
              <label className="ux4g-label-m-default" htmlFor="audit-domain">Domain</label>
              {domains == null ? (
                <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs gx-muted">
                  <Spinner size="sm" /> Loading your verified domains…
                </div>
              ) : noDomains ? (
                <div className="ux4g-alert ux4g-alert-info ux4g-mb-none">
                  You have no verified domains yet. <Link href="/domains/new">Register and verify a domain →</Link> to run an audit.
                </div>
              ) : (
                <select id="audit-domain" className="ux4g-form-select ux4g-form-select-md" value={domainId}
                        onChange={(e) => setDomainId(e.target.value)}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.url}{d.category ? ` — ${d.category}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {!noDomains && domains != null && (
                <div className="ux4g-mt-s ux4g-pt-s ux4g-bt-1">
                  <label className="ux4g-label-m-default" htmlFor="audit-depth">Pages to crawl</label>
                  <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs ux4g-mb-s">
                    {[1, 2, 5, 10].map((n) => (
                      <button key={n} type="button"
                        className={`ux4g-btn ux4g-btn-sm ${depth === n ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}
                        onClick={() => setDepth(n)}>
                        {n} {n === 1 ? "page" : "pages"}
                      </button>
                    ))}
                  </div>
                  <div className="ux4g-d-flex ux4g-ai-center ux4g-flex-wrap ux4g-gap-xs">
                    <span className="ux4g-tag-tonal-neutral ux4g-tag-s">Covers up to {freePages} pages · free</span>
                    <span className="gx-muted small">Unlimited audits on your verified domains.</span>
                    <button type="button" className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm ux4g-ml-auto ux4g-p-none"
                      onClick={() => { setShowReq((v) => !v); setReqMsg(""); }} disabled={!domainId}>
                      {showReq ? "Cancel" : "Need a deeper crawl? Request approval →"}
                    </button>
                  </div>
                  {showReq && (
                    <div className="ux4g-mt-xs ux4g-p-s ux4g-radius-m ux4g-bg-neutral-soft">
                      <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-end">
                        <div>
                          <div className="ux4g-input-container ux4g-input-sm ux4g-input-default" style={{ width: 110 }}>
                            <label className="ux4g-label-m-default" htmlFor="req-pages">Pages requested</label>
                            <div className="ux4g-input">
                              <input id="req-pages" type="number" min={freePages + 1} className="ux4g-input-input"
                                value={reqPages}
                                onChange={(e) => setReqPages(parseInt(e.target.value) || freePages + 1)} />
                            </div>
                          </div>
                        </div>
                        <div className="ux4g-flex-grow-1">
                          <div className="ux4g-input-container ux4g-input-sm ux4g-input-default ux4g-w-100">
                            <label className="ux4g-label-m-default" htmlFor="req-reason">Reason (optional)</label>
                            <div className="ux4g-input">
                              <input id="req-reason" className="ux4g-input-input" placeholder="e.g. full portal audit before launch"
                                value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <button className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm" onClick={requestCrawl}
                            disabled={reqBusy || reqPages <= freePages}>
                            {reqBusy ? "Sending…" : "Submit request"}</button>
                        </div>
                      </div>
                      <div className="gx-muted small ux4g-mt-xs">A programme steward reviews and approves larger crawls.</div>
                    </div>
                  )}
                  {reqMsg && <div className="small ux4g-mt-xs">{reqMsg}</div>}
                </div>
              )}
            </div></div>
            <div className="gx-card"><div className="gx-card-body">
              <h2 className="h6">Standards &amp; categories</h2>
              <p className="gx-muted small">All eight scoring categories are always evaluated — the weights are fixed by the GovUX methodology.</p>
              {CATS.map(([name, wt]) => (
                <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs ux4g-b-1 ux4g-radius-m ux4g-p-xs ux4g-mb-xs" key={name}>
                  <Icon name="check-circle-fill" size={16} className="ux4g-text-success" />
                  <span className="ux4g-flex-grow-1">{name}</span>
                  <span className="ux4g-tag-tonal-neutral ux4g-tag-s">{wt}%</span>
                </div>
              ))}
            </div></div>
          </div>
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-4">
            <div className="gx-card"><div className="gx-card-body">
              <h2 className="h6">Compatibility matrix</h2>
              <div className="ux4g-mb-xs"><div className="gx-muted small">Browser engines</div>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">Chromium</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">Firefox</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s">WebKit</span></div>
              <div className="ux4g-mb-s"><div className="gx-muted small">Device sizes</div>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">360</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">414</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">768</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s">1440</span></div>
              <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-w-100" onClick={submit} disabled={busy || !domainId}>
                {busy ? "Submitting…" : <><Icon name="play-fill" size={16} className="ux4g-mr-2xs" />Submit — get task ID</>}</button>
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
