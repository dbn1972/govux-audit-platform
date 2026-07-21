"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
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
      <div className="container-fluid p-4">
        <h1 className="h3">Configure audit</h1>
        <p className="text-secondary small">Submitting returns a task ID instantly; the audit runs in the background.</p>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card shadow-sm mb-3"><div className="card-body">
              <label className="form-label fw-semibold" htmlFor="audit-domain">Domain</label>
              {domains == null ? (
                <div className="d-flex align-items-center gap-2 text-secondary">
                  <span className="spinner-border spinner-border-sm text-primary" role="status" /> Loading your verified domains…
                </div>
              ) : noDomains ? (
                <div className="alert alert-info mb-0">
                  You have no verified domains yet. <Link href="/domains/new">Register and verify a domain →</Link> to run an audit.
                </div>
              ) : (
                <select id="audit-domain" className="form-select" value={domainId}
                        onChange={(e) => setDomainId(e.target.value)}>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.url}{d.category ? ` — ${d.category}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {!noDomains && domains != null && (
                <div className="mt-3 pt-3 border-top">
                  <label className="form-label fw-semibold" htmlFor="audit-depth">Pages to crawl</label>
                  <div className="d-flex align-items-center gap-2 mb-3">
                    {[1, 2, 5, 10].map((n) => (
                      <button key={n} type="button"
                        className={`btn btn-sm ${depth === n ? "btn-primary" : "btn-outline-secondary"}`}
                        onClick={() => setDepth(n)}>
                        {n} {n === 1 ? "page" : "pages"}
                      </button>
                    ))}
                  </div>
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <span className="badge text-bg-primary-subtle">Covers up to {freePages} pages · free</span>
                    <span className="text-secondary small">Unlimited audits on your verified domains.</span>
                    <button type="button" className="btn btn-sm btn-link ms-auto p-0"
                      onClick={() => { setShowReq((v) => !v); setReqMsg(""); }} disabled={!domainId}>
                      {showReq ? "Cancel" : "Need a deeper crawl? Request approval →"}
                    </button>
                  </div>
                  {showReq && (
                    <div className="mt-2 p-3 rounded" style={{ background: "var(--bs-tertiary-bg, #f6f8fa)" }}>
                      <div className="row g-2 align-items-end">
                        <div className="col-auto">
                          <label className="form-label small mb-1" htmlFor="req-pages">Pages requested</label>
                          <input id="req-pages" type="number" min={freePages + 1} className="form-control form-control-sm"
                            style={{ width: 110 }} value={reqPages}
                            onChange={(e) => setReqPages(parseInt(e.target.value) || freePages + 1)} />
                        </div>
                        <div className="col">
                          <label className="form-label small mb-1" htmlFor="req-reason">Reason (optional)</label>
                          <input id="req-reason" className="form-control form-control-sm" placeholder="e.g. full portal audit before launch"
                            value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
                        </div>
                        <div className="col-auto">
                          <button className="btn btn-sm btn-outline-primary" onClick={requestCrawl}
                            disabled={reqBusy || reqPages <= freePages}>
                            {reqBusy ? "Sending…" : "Submit request"}</button>
                        </div>
                      </div>
                      <div className="text-secondary small mt-2">A programme steward reviews and approves larger crawls.</div>
                    </div>
                  )}
                  {reqMsg && <div className="small mt-2">{reqMsg}</div>}
                </div>
              )}
            </div></div>
            <div className="card shadow-sm"><div className="card-body">
              <h2 className="h6">Standards &amp; categories</h2>
              <p className="text-secondary small">All eight scoring categories are always evaluated — the weights are fixed by the GovUX methodology.</p>
              {CATS.map(([name, wt]) => (
                <div className="d-flex align-items-center gap-2 border rounded p-2 mb-2" key={name}>
                  <i className="bi bi-check-circle-fill text-success" aria-hidden="true" />
                  <span className="flex-grow-1">{name}</span>
                  <span className="badge text-bg-primary-subtle">{wt}%</span>
                </div>
              ))}
            </div></div>
          </div>
          <div className="col-lg-4">
            <div className="card shadow-sm"><div className="card-body">
              <h2 className="h6">Compatibility matrix</h2>
              <div className="mb-2"><div className="text-secondary small">Browser engines</div>
                <span className="badge text-bg-secondary me-1">Chromium</span>
                <span className="badge text-bg-secondary me-1">Firefox</span>
                <span className="badge text-bg-secondary">WebKit</span></div>
              <div className="mb-3"><div className="text-secondary small">Device sizes</div>
                <span className="badge text-bg-secondary me-1">360</span>
                <span className="badge text-bg-secondary me-1">414</span>
                <span className="badge text-bg-secondary me-1">768</span>
                <span className="badge text-bg-secondary">1440</span></div>
              <button className="btn btn-primary w-100" onClick={submit} disabled={busy || !domainId}>
                {busy ? "Submitting…" : "▶ Submit — get task ID"}</button>
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
