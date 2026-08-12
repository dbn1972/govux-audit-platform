"use client";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Claim = {
  id: string; org_id: string; org_name: string;
  verify_status: string; created_at: string | null;
};
type Row = { url: string; contested: boolean; claims: Claim[] };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

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
      <div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
        <h1 className="h3">Domain claims</h1>
        <p className="text-secondary small">
          Registering a domain is a <b>claim</b>, not ownership — several organisations may claim
          the same host and each must prove control by DNS or file. Whoever proves it first wins
          and the rest are superseded automatically. This screen is for the cases proof can&apos;t
          settle: a claim nobody ever verifies still occupies the host, and only a steward can
          release it.
        </p>

        <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
          <div className="form-check">
            <input className="form-check-input" type="checkbox" id="contested"
              checked={contestedOnly} onChange={(e) => setContestedOnly(e.target.checked)} />
            <label className="form-check-label" htmlFor="contested">
              Contested only (more than one organisation claiming)
            </label>
          </div>
          <span className="text-secondary small ms-auto">
            {rows == null ? "Loading…"
              : `${rows.length} unverified host${rows.length === 1 ? "" : "s"}`
                + (contestedCount ? ` · ${contestedCount} contested` : "")}
          </span>
        </div>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        {msg && <div className="alert alert-success py-2" role="status">{msg}</div>}

        <div className="card shadow-sm">
          <div className="table-responsive"><table className="table align-middle mb-0">
            <thead className="table-light">
              <tr><th>Domain</th><th>Claimed by</th><th>Status</th><th>Claimed</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={5} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={5} className="text-secondary text-center py-4">
                  No unverified claims — every registered domain has proven ownership.
                </td></tr>
              )}
              {(rows || []).flatMap((r) =>
                r.claims.map((c, i) => (
                  <tr key={c.id}>
                    {/* only label the host once per group, so a contested host reads as one thing */}
                    <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>
                      {i === 0 ? r.url : ""}
                      {i === 0 && r.contested &&
                        <span className="badge text-bg-warning-subtle ms-2">
                          contested · {r.claims.length}
                        </span>}
                    </td>
                    <td className="small">{c.org_name}</td>
                    <td>
                      <span className={`badge ${c.verify_status === "superseded"
                        ? "text-bg-secondary-subtle" : "text-bg-warning-subtle"}`}>
                        {c.verify_status}
                      </span>
                    </td>
                    <td className="small text-secondary">{fmt(c.created_at)}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-danger"
                        disabled={busyId === c.id}
                        onClick={() => release(c, r.url)}>
                        {busyId === c.id ? "Releasing…" : "Release"}</button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table></div>
        </div>

        <p className="text-secondary small mt-2">
          A verified domain never appears here: ownership that has been proven isn&apos;t a
          steward&apos;s to revoke, and removing it would orphan its audit history.
        </p>
      </div>
    </AppShell>
  );
}
