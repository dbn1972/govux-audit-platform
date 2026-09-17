"use client";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Claim = {
  id: string; org_id: string; org_name: string;
  verify_status: string; created_at: string | null;
};
type Row = { url: string; contested: boolean; claims: Claim[] };

import { relative } from "@/lib/format";
const fmt = (s: string | null) => relative(s, "—");

export default function DomainClaims() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [contestedOnly, setContestedOnly] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr("");
    api.domainClaims(contestedOnly)
      .then((d) => setRows(d.items || []))
      .catch((e: any) => { setErr(e?.message || "Could not load claims."); setRows([]); });
  }, [contestedOnly]);
  useEffect(load, [load]);

  async function release(c: Claim, url: string) {
    if (!confirm(`Release ${url} from ${c.org_name}?\n\nThe claim is deleted and the domain `
                 + `becomes available for any organisation to claim again.`)) return;
    setBusyId(c.id); setErr(""); setMsg("");
    try {
      await api.releaseClaim(c.id);
      setMsg(`✓ Released ${url} from ${c.org_name}.`);
      load();
    } catch (e: any) { setErr(e?.message || "Could not release that claim."); }
    finally { setBusyId(null); }
  }

  const contestedCount = (rows || []).filter((r) => r.contested).length;

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Domain claims</h1>
            <div className="gx-muted">Registering a domain is a <b>claim</b>, not ownership — several organisations may claim
          the same host and each must prove control by DNS or file. Whoever proves it first wins
          and the rest are superseded automatically. This screen is for the cases proof can&apos;t
          settle: a claim nobody ever verifies still occupies the host, and only a steward can
          release it.</div>
          </div>
        </div>

        <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-s ux4g-ai-center ux4g-mb-s">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" id="contested"
              checked={contestedOnly} onChange={(e) => setContestedOnly(e.target.checked)} />
            <label className="form-check-label" htmlFor="contested">
              Contested only (more than one organisation claiming)
            </label>
          </div>
          <span className="gx-muted small ux4g-ml-auto">
            {rows == null ? "Loading…"
              : `${rows.length} unverified host${rows.length === 1 ? "" : "s"}`
                + (contestedCount ? ` · ${contestedCount} contested` : "")}
          </span>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        {msg && <div className="ux4g-alert ux4g-alert-success ux4g-py-xs" role="status">{msg}</div>}

        <div className="gx-card">
          <div className="table-responsive"><table className="gx-table">
            <thead>
              <tr><th>Domain</th><th>Claimed by</th><th>Status</th><th>Claimed</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={5} className="ux4g-text-center ux4g-py-m">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={5} className="gx-muted ux4g-text-center ux4g-py-l">
                  No unverified claims — every registered domain has proven ownership.
                </td></tr>
              )}
              {(rows || []).flatMap((r) =>
                r.claims.map((c, i) => (
                  <tr key={c.id}>
                    {/* only label the host once per group, so a contested host reads as one thing */}
                    <td className="ux4g-fw-semibold">
                      {i === 0 ? r.url : ""}
                      {i === 0 && r.contested &&
                        <span className="ux4g-badge-m text-bg-warning-subtle ux4g-ml-xs">
                          contested · {r.claims.length}
                        </span>}
                    </td>
                    <td className="small">{c.org_name}</td>
                    <td>
                      <span className={`ux4g-badge-m ${c.verify_status === "superseded"
                        ? "text-bg-secondary-subtle" : "text-bg-warning-subtle"}`}>
                        {c.verify_status}
                      </span>
                    </td>
                    <td className="small gx-muted">{fmt(c.created_at)}</td>
                    <td className="ux4g-text-end">
                      <button className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-sm"
                        disabled={busyId === c.id}
                        onClick={() => release(c, r.url)}>
                        {busyId === c.id ? "Releasing…" : "Release"}</button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table></div>
        </div>

        <p className="gx-muted small ux4g-mt-xs">
          A verified domain never appears here: ownership that has been proven isn&apos;t a
          steward&apos;s to revoke, and removing it would orphan its audit history.
        </p>
      </div>
    </AppShell>
  );
}
