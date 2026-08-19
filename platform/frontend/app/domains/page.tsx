"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  verify_method?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};

import { BAND_COLOR as bandColor } from "@/lib/score";
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

export default function Domains() {
  const [rows, setRows] = useState<Domain[] | null>(null);
  const [err, setErr] = useState("");
  const [isSteward, setIsSteward] = useState(false);

  useEffect(() => {
    api.listDomains()
      .then((d) => setRows(d || []))
      .catch((e) => { setErr(e?.message || "Could not load your domains."); setRows([]); });
    api.me()
      .then((u) => setIsSteward(!!u?.is_steward))
      .catch(() => {});
  }, []);

  // Steward override. This used to call verifyDomain(id, "sso_mapping") — the
  // method verification.verify() returned True for unconditionally, i.e. a
  // bypass any signed-in user could invoke. It is now its own endpoint:
  // steward-only, a written reason required, recorded as `steward_override` so
  // an unproven domain is never mistaken for a DNS/file-proven one.
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

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">My domains</h1>
            <div className="gx-muted">
              {/* a registration is a claim until DNS or a file proves it — the
                  screen that lists them should say which state each is in */}
              Registered hosts and their verification state. Only a verified domain can be audited.
            </div>
          </div>
          <div className="gx-actions">
            <Link href="/domains/new" className="btn btn-primary">
              <i className="bi bi-plus-lg me-1" aria-hidden="true" />Add domain
            </Link>
          </div>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="gx-card">
          <div className="table-responsive">
            <table className="gx-table gx-responsive">
              <thead><tr><th>Domain</th><th>Category</th><th>Status</th><th>Latest score</th><th>Last audited</th><th></th></tr></thead>
              <tbody>
                {rows == null && (
                  <tr><td colSpan={6} className="text-center py-4">
                    <span className="spinner-border spinner-border-sm text-primary me-2" />Loading…
                  </td></tr>
                )}
                {rows?.length === 0 && !err && (
                  <tr><td colSpan={6} className="text-secondary text-center py-4">
                    No domains yet. <Link href="/domains/new">Register your first domain →</Link>
                  </td></tr>
                )}
                {(rows || []).map(d => (
                  <tr key={d.id}>
                    <td data-label="Domain" className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{d.url}</td>
                    <td data-label="Category" className="text-secondary small">{d.category || "—"}</td>
                    <td data-label="Status">{d.verify_status === "verified"
                      ? (d.verify_method === "steward_override"
                          // an override is verified, but nobody proved anything —
                          // say so rather than letting it look DNS-proven
                          ? <span className="badge text-bg-info-subtle text-info-emphasis"
                              title="Verified by a programme admin — ownership was not proven">
                              Verified · override</span>
                          : <span className="badge text-bg-success-subtle text-success">Verified</span>)
                      : <span className="badge text-bg-warning-subtle">Pending</span>}</td>
                    <td data-label="Latest score">{d.latest_score != null
                      ? <><b>{d.latest_score}</b>{d.latest_band &&
                          <span className="badge ms-1" style={{ background: (bandColor[d.latest_band] || "#5c636a") + "22", color: bandColor[d.latest_band] || "#5c636a" }}>{d.latest_band}</span>}</>
                      : <span className="text-secondary">Not audited</span>}</td>
                    <td data-label="Last audited" className="text-secondary small">{fmtDate(d.last_audited_at)}</td>
                    <td data-label="">{d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="btn btn-sm btn-link">Audit →</Link>
                      : (<>
                          {/* carry the id: a bare /domains/new is a blank form,
                              and re-registering an existing domain 409s */}
                          <Link href={`/domains/new?domain=${d.id}`} className="btn btn-sm btn-link">Verify →</Link>
                          {isSteward && (
                            <button className="btn btn-sm btn-link text-secondary"
                              onClick={() => { setOverriding(d.id); setReason(""); setErr(""); }}>
                              Override
                            </button>
                          )}
                        </>)}</td>
                  </tr>
                ))}
                {overriding && (
                  <tr>
                    <td colSpan={6} className="bg-light">
                      <div className="p-2">
                        <label className="form-label small fw-semibold" htmlFor="override-reason">
                          Why is this domain being verified without proof?
                        </label>
                        <div className="text-secondary small mb-2">
                          Recorded against your account in the audit log, and the domain is marked
                          as an override rather than DNS-proven.
                        </div>
                        <div className="d-flex flex-wrap gap-2 align-items-start">
                          <input id="override-reason" className="form-control form-control-sm"
                            style={{ maxWidth: 460 }} value={reason}
                            placeholder="e.g. DNS held by a third-party vendor; ownership confirmed by letter"
                            onChange={(e) => setReason(e.target.value)} />
                          <button className="btn btn-sm btn-primary"
                            disabled={busy || reason.trim().length < 10}
                            onClick={() => forceVerify(overriding)}>
                            {busy ? "Verifying…" : "Force verify"}</button>
                          <button className="btn btn-sm btn-outline-secondary"
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
