"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import StatusLine from "@/components/StatusLine";
import { api } from "@/lib/api";
import { SERVICE_CATEGORIES } from "@/lib/domain";
import { absolute, relative } from "@/lib/format";
import { bandStyle } from "@/lib/score";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  verify_method?: string | null; registered_at?: string | null; registered_by?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};
type Run = { task_id: string; domain: string; status: string; score: number | null;
             band: string | null; date: string };

/**
 * One host, everything known about it.
 *
 * /domains is a register — one row per host, five columns — and answered none
 * of the questions that actually come up about a particular site: how was
 * ownership proven and when, who on the team registered it, and what has it
 * scored over time. The dashboard's "Manage domains" button pointed at a table
 * with no management in it at all.
 */
export default function DomainDetail({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Domain | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState("");
  const [gone, setGone] = useState(false);
  const [catMsg, setCatMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setErr("");
    api.listDomains()
      .then((rows: Domain[]) => {
        const row = (rows || []).find((x) => x.id === params.id);
        if (!row) { setGone(true); return; }
        setD(row);
      })
      .catch((e: any) => setErr(e?.message || "Could not load this domain."));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  // The audit list is already org-scoped; filter it to this host rather than
  // adding a per-domain endpoint for data the client can already see.
  useEffect(() => {
    if (!d) return;
    api.listAudits()
      .then((rows: Run[]) => setRuns((rows || []).filter((r) => r.domain === d.url)))
      .catch(() => setRuns([]));
  }, [d]);

  async function setCategory(category: string) {
    setSaving(true); setCatMsg(null);
    try {
      await api.updateDomain(params.id, category || null);
      setD((x) => x ? { ...x, category: category || null } : x);
      setCatMsg({ ok: true, text: "Category saved." });
    } catch (e: any) {
      setCatMsg({ ok: false, text: e?.message || "Could not change that category." });
    } finally { setSaving(false); }
  }

  const back = (
    <Link href="/domains" className="gx-back ux4g-fs-14 ux4g-mb-2xs">
      <Icon name="arrow-left" size={14} />My domains
    </Link>
  );

  if (gone) return (
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}><div>
        {back}
        <h1 className="ux4g-mb-2xs">Domain not found</h1>
        <div className="gx-muted">It may have been withdrawn, or it belongs to another organisation.</div>
      </div></div>
    </div></AppShell>
  );

  if (!d) return (
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}><div>{back}<h1>Domain</h1></div></div>
      {err
        ? <div className="ux4g-alert ux4g-alert-warning ux4g-d-flex ux4g-ai-center ux4g-gap-xs" role="alert">
            <Icon name="exclamation-triangle" size={16} className="ux4g-flex-shrink-0" />
            <span>{err}</span>
            <button type="button" onClick={load}
              className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm ux4g-ml-auto">
              <Icon name="arrow-repeat" size={14} className="ux4g-mr-2xs" />Try again
            </button>
          </div>
        : <div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading domain…" /></div>}
    </div></AppShell>
  );

  const verified = d.verify_status === "verified";
  // The fallback has to know whether the domain is verified. Rows predating
  // verify_method (the seed's among them) are verified with no method on
  // record, and reading "Status: Verified / Proof: Not yet proven" in the same
  // card is worse than admitting the method is simply not known.
  const proof = d.verify_method === "steward_override" ? "Programme-admin override — ownership was not proven"
    : d.verify_method === "dns_txt" ? "DNS TXT record"
    : d.verify_method === "file_upload" ? "File published on the site"
    : verified ? "Not recorded — predates method tracking"
    : "Not yet proven";

  return (
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          {back}
          <h1 className="ux4g-mb-2xs">{d.url}</h1>
          <div className="gx-muted">
            {d.registered_at ? `Registered ${absolute(d.registered_at)}` : "Registered"}
            {d.registered_by ? ` by ${d.registered_by}` : ""}
          </div>
        </div>
        <div className="gx-actions">
          {verified
            ? <Link href={`/audits/new?domain=${d.id}`} className="ux4g-btn ux4g-btn-primary ux4g-btn-md">
                <Icon name="play-fill" size={16} className="ux4g-mr-2xs" />Run audit
              </Link>
            : <Link href={`/domains/new?domain=${d.id}`} className="ux4g-btn ux4g-btn-primary ux4g-btn-md">
                Finish verification →
              </Link>}
        </div>
      </div>

      <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
        <div className="ux4g-cols-span-12 ux4g-md-cols-span-6">
          <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100"><div className="ux4g-card-body">
            <h2 className="ux4g-heading-2xs-strong ux4g-mb-xs">Ownership</h2>
            <dl className="gx-deflist">
              <dt>Status</dt>
              <dd>{verified
                ? (d.verify_method === "steward_override"
                    ? <span className="ux4g-tag-tonal-info ux4g-tag-s">Verified · override</span>
                    : <span className="ux4g-tag-tonal-success ux4g-tag-s">Verified</span>)
                : <span className="ux4g-tag-tonal-warning ux4g-tag-s">Pending</span>}</dd>
              <dt>Proof</dt><dd>{proof}</dd>
              <dt>Registered</dt>
              <dd>{d.registered_at ? absolute(d.registered_at) : "—"}</dd>
              <dt>Registered by</dt><dd>{d.registered_by || "—"}</dd>
            </dl>
            {!verified && (
              <p className="gx-muted ux4g-fs-14 ux4g-mt-s ux4g-mb-none">
                A registration is a claim until DNS or a published file proves it. Only a
                verified domain can be audited.
              </p>
            )}
          </div></div>
        </div>

        <div className="ux4g-cols-span-12 ux4g-md-cols-span-6">
          <div className="ux4g-card ux4g-card-solid ux4g-card-outline ux4g-h-100"><div className="ux4g-card-body">
            <h2 className="ux4g-heading-2xs-strong ux4g-mb-xs">Classification</h2>
            <label className="ux4g-label-m-default" htmlFor="detail-category">Service category</label>
            <select id="detail-category" className="ux4g-form-select ux4g-form-select-md ux4g-w-100"
              value={d.category || ""} disabled={saving}
              onChange={(e) => setCategory(e.target.value)}>
              <option value="">Not categorised</option>
              {SERVICE_CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <div className="ux4g-input-helper">
              <span className="ux4g-input-helper-text">
                Decides which segment this site is ranked in — a payments service is not
                compared against a leaflet.
              </span>
            </div>
            {catMsg && <StatusLine ok={catMsg.ok} text={catMsg.text} className="ux4g-mt-xs" />}
          </div></div>
        </div>
      </div>

      <div className="ux4g-card ux4g-card-solid ux4g-card-outline">
        <div className="ux4g-card-header">
          <h2>Audit history</h2>
          <span className="gx-muted ux4g-ml-auto ux4g-fs-14">
            {d.last_audited_at ? `Last run ${relative(d.last_audited_at)}` : "Never audited"}
          </span>
        </div>
        <div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead><tr>
              <th>Date</th><th>Status</th><th>Score</th>
              <th><span className="ux4g-sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {runs == null && (
                <tr><td colSpan={4} className="ux4g-text-center ux4g-py-m">
                  <Spinner size="sm" className="ux4g-mr-xs" />Loading…
                </td></tr>
              )}
              {runs?.length === 0 && (
                <tr><td colSpan={4} className="gx-muted ux4g-text-center ux4g-py-l">
                  {verified
                    ? <>No audits yet. <Link href={`/audits/new?domain=${d.id}`}>Run the first one →</Link></>
                    : "Nothing audited — this domain is not verified yet."}
                </td></tr>
              )}
              {(runs || []).map((r) => (
                <tr key={r.task_id}>
                  <td data-label="Date" className="ux4g-fs-14">{absolute(r.date)}</td>
                  <td data-label="Status" className="gx-muted ux4g-fs-14">{r.status.replace(/_/g, " ")}</td>
                  <td data-label="Score">{r.score != null
                    ? <><b>{r.score}</b>{r.band &&
                        <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-ml-2xs" style={bandStyle(r.band)}>Band {r.band}</span>}</>
                    : <span className="gx-muted">—</span>}</td>
                  <td data-label="" className="ux4g-text-end">
                    <Link href={r.status === "completed" ? `/audits/${r.task_id}/report` : `/audits/${r.task_id}`}
                      className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">
                      {r.status === "completed" ? "View report →" : "View status →"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div></AppShell>
  );
}
