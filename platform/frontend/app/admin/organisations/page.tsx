"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Org = {
  id: string; name: string; org_type: string; state_code: string | null;
  domain_count: number; studio_enabled: boolean; created_at: string | null;
};
const TYPES = ["ministry", "department", "state", "ut", "psu", "other"];
const PAGE = 25;

export default function Organisations() {
  const [rows, setRows] = useState<Org[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [orgType, setOrgType] = useState("");
  const [offset, setOffset] = useState(0);

  // debounce the search box: 1,500+ orgs means a request per keystroke is waste
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setErr("");
    api.organisations({ q: debouncedQ, org_type: orgType, limit: PAGE, offset })
      .then((d) => { if (!cancelled) { setRows(d.items || []); setTotal(d.total || 0); } })
      .catch((e: any) => {
        if (!cancelled) { setErr(e?.message || "Could not load organisations."); setRows([]); }
      });
    return () => { cancelled = true; };   // ignore a stale response that lands late
  }, [debouncedQ, orgType, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
        <h1 className="h3">Organisations</h1>
        <p className="text-secondary small">
          Every ministry, department, state body and PSU registered on the platform.
        </p>

        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <input className="form-control form-control-sm" style={{ maxWidth: 280 }}
            placeholder="Search by name…" value={q} aria-label="Search organisations by name"
            onChange={(e) => setQ(e.target.value)} />
          <select className="form-select form-select-sm" style={{ maxWidth: 180 }}
            value={orgType} aria-label="Filter by organisation type"
            onChange={(e) => { setOrgType(e.target.value); setOffset(0); }}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-secondary small ms-auto">
            {rows == null ? "Loading…" : total === 0 ? "No matches" : `${from}–${to} of ${total.toLocaleString()}`}
          </span>
        </div>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="card shadow-sm">
          <div className="table-responsive"><table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr><th>Organisation</th><th>Type</th><th>State / UT</th><th>Domains</th><th>Studio</th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={5} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={5} className="text-secondary text-center py-4">
                  No organisations match this search.
                </td></tr>
              )}
              {(rows || []).map((o) => (
                <tr key={o.id}>
                  <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{o.name}</td>
                  <td><span className="badge text-bg-light">{o.org_type}</span></td>
                  <td className="small">{o.state_code || <span className="text-secondary">—</span>}</td>
                  <td className="fw-bold">{o.domain_count}</td>
                  <td>{o.studio_enabled
                    ? <span className="badge text-bg-success-subtle text-success">Enabled</span>
                    : <span className="text-secondary small">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {total > PAGE && (
            <div className="card-footer bg-white d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-secondary" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>← Previous</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={to >= total}
                onClick={() => setOffset((o) => o + PAGE)}>Next →</button>
              <span className="text-secondary small ms-auto">Page {Math.floor(offset / PAGE) + 1} of {Math.ceil(total / PAGE)}</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
