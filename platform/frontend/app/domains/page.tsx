"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  verify_method?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};

import { BAND_COLOR as bandColor, bandStyle } from "@/lib/score";
import { relative } from "@/lib/format";
import { SERVICE_CATEGORIES } from "@/lib/domain";

export default function Domains() {
  const [rows, setRows] = useState<Domain[] | null>(null);
  const [err, setErr] = useState("");
  const [isSteward, setIsSteward] = useState(false);

  useEffect(() => {
    api.listDomains()
      .then((d) => setRows(d || []))
      // null, not []: [] renders "No domains yet. Register your first domain →"
      // under the error alert, telling someone their estate is empty when the
      // truth is that we could not read it. Same defect as the dashboard's.
      .catch((e) => { setErr(e?.message || "Could not load your domains."); setRows(null); });
    api.me()
      .then((u) => setIsSteward(!!u?.is_steward))
      .catch(() => {});
  }, []);

  // Steward override. This used to call verifyDomain(id, "sso_mapping") — the
  // method verification.verify() returned True for unconditionally, i.e. a
  // bypass any signed-in user could invoke. It is now its own endpoint:
  // steward-only, a written reason required, recorded as `steward_override` so
  // an unproven domain is never mistaken for a DNS/file-proven one.
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [savingCat, setSavingCat] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function forceVerify(id: string) {
    setErr(""); setBusy(true);
    try {
      const res = await api.forceVerifyDomain(id, reason.trim());
      setRows((rs) => (rs || []).map((d) => d.id === id
        ? { ...d, verify_status: res.verify_status, verify_method: res.verify_method } : d));
      setOverriding(null); setReason("");
    } catch (e: any) {
      setErr(e?.message || "Could not force-verify that domain.");
    } finally { setBusy(false); }
  }

  async function setCategory(id: string, category: string) {
    const before = (rows || []).find((d) => d.id === id)?.category ?? null;
    setErr(""); setSavingCat(id);
    setRows((rs) => (rs || []).map((d) => d.id === id ? { ...d, category: category || null } : d));
    try {
      await api.updateDomain(id, category || null);
    } catch (e: any) {
      // put the old value back rather than leaving the select showing a choice
      // the server never accepted
      setRows((rs) => (rs || []).map((d) => d.id === id ? { ...d, category: before } : d));
      setErr(e?.message || "Could not change that category.");
    } finally { setSavingCat(null); }
  }

  async function withdraw(id: string) {
    setErr(""); setBusy(true);
    try {
      await api.withdrawDomain(id);
      setRows((rs) => (rs || []).filter((d) => d.id !== id));
      setWithdrawing(null);
    } catch (e: any) {
      setErr(e?.message || "Could not withdraw that claim.");
    } finally { setBusy(false); }
  }

  const pending = withdrawing ? (rows || []).find((d) => d.id === withdrawing) : null;

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">My domains</h1>
            <div className="gx-muted">
              {/* a registration is a claim until DNS or a file proves it — the
                  screen that lists them should say which state each is in */}
              Registered hosts and their verification state. Only a verified domain can be audited.
            </div>
          </div>
          <div className="gx-actions">
            <Link href="/domains/new" className="ux4g-btn ux4g-btn-primary ux4g-btn-md">
              <Icon name="plus-lg" size={16} className="ux4g-mr-2xs" />Add domain
            </Link>
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        <div className="ux4g-card ux4g-card-solid ux4g-card-outline">
          <div className="ux4g-table-responsive ux4g-table-rounded">
            <table className="ux4g-table ux4g-table-m gx-responsive">
              <thead><tr><th>Domain</th><th>Category</th><th>Status</th><th>Latest score</th><th>Last audited</th><th></th></tr></thead>
              <tbody>
                {rows == null && (
                  <tr><td colSpan={6} className="ux4g-text-center ux4g-py-m">
                    <Spinner size="sm" className="ux4g-mr-xs" />Loading…
                  </td></tr>
                )}
                {rows?.length === 0 && !err && (
                  <tr><td colSpan={6} className="gx-muted ux4g-text-center ux4g-py-l">
                    No domains yet. <Link href="/domains/new">Register your first domain →</Link>
                  </td></tr>
                )}
                {(rows || []).map(d => (
                  <tr key={d.id}>
                    <td data-label="Domain" className="ux4g-fw-semibold ux4g-table-cell-text">{d.url}</td>
                    {/* Editable in place: categorisation was write-once at
                        registration and the form never offered it, so every
                        domain added through the app read "—" forever and sat
                        outside the segmented league table. */}
                    <td data-label="Category">
                      <select aria-label={`Service category for ${d.url}`}
                        className="ux4g-form-select ux4g-form-select-sm"
                        value={d.category || ""} disabled={savingCat === d.id}
                        onChange={(e) => setCategory(d.id, e.target.value)}>
                        <option value="">Not categorised</option>
                        {SERVICE_CATEGORIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </td>
                    <td data-label="Status">{d.verify_status === "verified"
                      ? (d.verify_method === "steward_override"
                          // an override is verified, but nobody proved anything —
                          // say so rather than letting it look DNS-proven
                          ? <span className="ux4g-tag-tonal-info ux4g-tag-s"
                              title="Verified by a programme admin — ownership was not proven">
                              Verified · override</span>
                          : <span className="ux4g-tag-tonal-success ux4g-tag-s">Verified</span>)
                      : <span className="ux4g-tag-tonal-warning ux4g-tag-s">Pending</span>}</td>
                    <td data-label="Latest score">{d.latest_score != null
                      ? <><b>{d.latest_score}</b>{d.latest_band &&
                          <span className="ux4g-tag-tonal-neutral ux4g-tag-s gx-dot ux4g-ml-2xs" style={bandStyle(d.latest_band)}>{d.latest_band}</span>}</>
                      : <span className="gx-muted">Not audited</span>}</td>
                    <td data-label="Last audited" className="gx-muted ux4g-fs-14">{relative(d.last_audited_at)}</td>
                    <td data-label="">
                      <Link href={`/domains/${d.id}`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">Details</Link>
                      {d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">Audit →</Link>
                      : (<>
                          {/* carry the id: a bare /domains/new is a blank form,
                              and re-registering an existing domain 409s */}
                          <Link href={`/domains/new?domain=${d.id}`} className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm">Verify →</Link>
                          {isSteward && (
                            <button className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm gx-muted"
                              onClick={() => { setOverriding(d.id); setReason(""); setErr(""); }}>
                              Override
                            </button>
                          )}
                          {/* An owner could not undo their own typo: the claim
                              sat here forever AND held the org's slot under
                              uq_domain_org_url, so the corrected host could not
                              be registered. Unverified only — see the API. */}
                          <button className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm gx-muted"
                            onClick={() => { setWithdrawing(d.id); setErr(""); }}>
                            Withdraw
                          </button>
                        </>)}</td>
                  </tr>
                ))}
                {/* Confirm in place rather than window.confirm: it names the
                    host being withdrawn, and says what withdrawing does and
                    does not do. */}
                {pending && (
                  <tr>
                    <td colSpan={6} className="ux4g-bg-neutral-soft">
                      <div className="ux4g-p-xs ux4g-d-flex ux4g-flex-wrap ux4g-ai-center ux4g-gap-xs">
                        <Icon name="exclamation-triangle" size={16} className="ux4g-flex-shrink-0" />
                        <span className="ux4g-fs-14">
                          Withdraw the unverified claim on <b>{pending.url}</b>? Nothing has been
                          audited against it, and the host becomes free to register again.
                        </span>
                        <span className="ux4g-ml-auto ux4g-d-flex ux4g-gap-2xs">
                          <button className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-sm"
                            disabled={busy} onClick={() => withdraw(pending.id)}>
                            {busy ? "Withdrawing…" : "Withdraw claim"}
                          </button>
                          <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm"
                            disabled={busy} onClick={() => setWithdrawing(null)}>Cancel</button>
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {overriding && (
                  <tr>
                    <td colSpan={6} className="ux4g-bg-neutral-soft">
                      <div className="ux4g-p-xs">
                        <label className="ux4g-label-m-default" htmlFor="override-reason">
                          Why is this domain being verified without proof?
                        </label>
                        <div className="gx-muted ux4g-fs-14 ux4g-mb-xs">
                          Recorded against your account in the audit log, and the domain is marked
                          as an override rather than DNS-proven.
                        </div>
                        <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-start">
                          <div className="ux4g-input-container ux4g-input-md ux4g-input-default" style={{ maxWidth: 460 }}>
                            <div className="ux4g-input">
                              <input id="override-reason" className="ux4g-input-input" value={reason}
                                placeholder="e.g. DNS held by a third-party vendor; ownership confirmed by letter"
                                onChange={(e) => setReason(e.target.value)} />
                            </div>
                          </div>
                          <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm"
                            disabled={busy || reason.trim().length < 10}
                            onClick={() => forceVerify(overriding)}>
                            {busy ? "Verifying…" : "Force verify"}</button>
                          <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm"
                            onClick={() => { setOverriding(null); setReason(""); }}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
