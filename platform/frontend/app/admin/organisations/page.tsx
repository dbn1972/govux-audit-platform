"use client";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { BAND_COLOR } from "@/lib/score";

type Org = {
  id: string; name: string; org_type: string; state_code: string | null;
  domain_count: number; user_count: number; audited_domains: number;
  audit_count: number; avg_score: number | null; last_audited_at: string | null;
  studio_enabled: boolean; created_at: string | null;
};
const TYPES = ["ministry", "department", "state", "ut", "psu", "other"];
const PAGE = 25;
const bandColor = (s: number) =>
  s >= 75 ? BAND_COLOR.A : s >= 60 ? BAND_COLOR.C : BAND_COLOR.E;
import { relative } from "@/lib/format";
const fmt = (s: string | null) => relative(s, "—");

export default function Organisations() {
  const [rows, setRows] = useState<Org[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [orgType, setOrgType] = useState("");
  const [offset, setOffset] = useState(0);

  // create / edit
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", org_type: "department", state_code: "" });
  const [editing, setEditing] = useState<Org | null>(null);
  const [busy, setBusy] = useState(false);

  // debounce the search box: a request per keystroke is waste
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    let cancelled = false;
    setErr("");
    api.organisations({ q: debouncedQ, org_type: orgType, limit: PAGE, offset })
      .then((d) => { if (!cancelled) { setRows(d.items || []); setTotal(d.total || 0); } })
      .catch((e: any) => {
        if (!cancelled) { setErr(e?.message || "Could not load organisations."); setRows([]); }
      });
    return () => { cancelled = true; };   // ignore a stale response that lands late
  }, [debouncedQ, orgType, offset]);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.createOrganisation({ ...form, state_code: form.state_code || undefined });
      setMsg(`✓ Created ${form.name}.`);
      setForm({ name: "", org_type: "department", state_code: "" });
      setShowNew(false);
      load();
    } catch (e: any) { setErr(e?.message || "Could not create that organisation."); }
    finally { setBusy(false); }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      await api.patchOrganisation(editing.id, {
        name: editing.name, org_type: editing.org_type, state_code: editing.state_code || "",
      });
      setMsg(`✓ Updated ${editing.name}.`);
      setEditing(null);
      load();
    } catch (e: any) { setErr(e?.message || "Could not save that organisation."); }
    finally { setBusy(false); }
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Organisations</h1>
            <div className="gx-muted">
              Every ministry, department, state body and PSU on the platform, with how much each is
              actually using it. Organisations otherwise only appear as a side effect — auto-named
              from whoever registers the first domain — so names can be corrected here.
            </div>
          </div>
          <div className="gx-actions">
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" aria-expanded={showNew}
              onClick={() => { setShowNew((v) => !v); setEditing(null); }}>
              <Icon name="plus-lg" size={16} className="ux4g-mr-2xs" />New organisation
            </button>
          </div>
        </div>

        {showNew && (
          <div className="gx-card"><div className="gx-card-body">
            <h2 className="h6 ux4g-mb-s">New organisation</h2>
            <form className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-xs ux4g-ai-end" onSubmit={create}>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-5">
                <label className="form-label" htmlFor="new-name">Name</label>
                <input id="new-name" required className="ux4g-input ux4g-w-100"
                  placeholder="Ministry of Rural Development"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-3">
                <label className="form-label" htmlFor="new-type">Type</label>
                <select id="new-type" className="ux4g-form-select" value={form.org_type}
                  onChange={(e) => setForm({ ...form, org_type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-2">
                <label className="form-label" htmlFor="new-state">State / UT</label>
                <input id="new-state" className="ux4g-input ux4g-w-100" placeholder="KA"
                  maxLength={8} value={form.state_code}
                  onChange={(e) => setForm({ ...form, state_code: e.target.value.toUpperCase() })} />
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-2">
                <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm ux4g-w-100" disabled={busy}>
                  {busy ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div></div>
        )}

        {editing && (
          <div className="gx-card ux4g-mb-s" style={{ borderColor: "var(--gx-action)" }}><div className="gx-card-body">
            <h2 className="h6">Edit organisation</h2>
            <form className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-xs ux4g-ai-end" onSubmit={saveEdit}>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-5">
                <label className="form-label" htmlFor="ed-name">Name</label>
                <input id="ed-name" required className="ux4g-input ux4g-w-100"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-3">
                <label className="form-label" htmlFor="ed-type">Type</label>
                <select id="ed-type" className="ux4g-form-select" value={editing.org_type}
                  onChange={(e) => setEditing({ ...editing, org_type: e.target.value })}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-2">
                <label className="form-label" htmlFor="ed-state">State / UT</label>
                <input id="ed-state" className="ux4g-input ux4g-w-100" maxLength={8}
                  value={editing.state_code || ""}
                  onChange={(e) => setEditing({ ...editing, state_code: e.target.value.toUpperCase() })} />
              </div>
              <div className="ux4g-cols-span-12 ux4g-md-cols-span-2 ux4g-d-flex ux4g-gap-2xs">
                <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm ux4g-flex-grow-1" disabled={busy}>
                  {busy ? "Saving…" : "Save"}</button>
                <button type="button" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm"
                  onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </div></div>
        )}

        <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-center ux4g-mb-s">
          <input className="ux4g-input ux4g-w-100" style={{ maxWidth: 280 }}
            placeholder="Search by name…" value={q} aria-label="Search organisations by name"
            onChange={(e) => setQ(e.target.value)} />
          <select className="ux4g-form-select" style={{ maxWidth: 180 }}
            value={orgType} aria-label="Filter by organisation type"
            onChange={(e) => { setOrgType(e.target.value); setOffset(0); }}>
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="gx-muted small ux4g-ml-auto">
            {rows == null ? "Loading…" : total === 0 ? "No matches" : `${from}–${to} of ${total.toLocaleString()}`}
          </span>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        {msg && <div className="ux4g-alert ux4g-alert-success ux4g-py-xs" role="status">{msg}</div>}

        <div className="gx-card">
          <div className="table-responsive"><table className="gx-table gx-responsive">
            <thead>
              <tr>
                <th>Organisation</th><th>Type</th><th>State / UT</th>
                <th>Domains</th><th>Users</th><th>Audits</th><th>Avg score</th>
                <th>Last audit</th><th>Studio</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={10} className="ux4g-text-center ux4g-py-m">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={10} className="gx-muted ux4g-text-center ux4g-py-l">
                  No organisations match this search.
                </td></tr>
              )}
              {(rows || []).map((o) => (
                <tr key={o.id}>
                  <td data-label="Organisation" className="gx-cell-primary">{o.name}</td>
                  <td data-label="Type"><span className="ux4g-badge-m text-bg-light">{o.org_type}</span></td>
                  <td data-label="State / UT" className="small">{o.state_code || <span className="gx-muted">—</span>}</td>
                  <td data-label="Domains" className="ux4g-fw-bold gx-num">{o.domain_count}</td>
                  <td data-label="Users" className="gx-num">{o.user_count}</td>
                  <td data-label="Audits" className="small">
                    {o.audit_count
                      ? <>{o.audit_count}<span className="gx-muted"> · {o.audited_domains} domain{o.audited_domains === 1 ? "" : "s"}</span></>
                      : <span className="gx-muted">none</span>}
                  </td>
                  <td data-label="Avg score" className="gx-num">{o.avg_score != null
                    ? <b style={{ color: bandColor(o.avg_score) }}>{o.avg_score}</b>
                    : <span className="gx-muted">—</span>}</td>
                  <td data-label="Last audit" className="small gx-muted">{fmt(o.last_audited_at)}</td>
                  <td data-label="Studio">{o.studio_enabled
                    ? <span className="ux4g-badge-m text-bg-success-subtle text-success">Enabled</span>
                    : <span className="gx-muted small">—</span>}</td>
                  <td data-label="" className="ux4g-text-end">
                    <button className="ux4g-btn ux4g-btn-text-primary ux4g-btn-sm"
                      onClick={() => { setEditing(o); setShowNew(false); }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>

          {total > PAGE && (
            <div className="card-footer bg-white ux4g-d-flex ux4g-ai-center ux4g-gap-xs">
              <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>← Previous</button>
              <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm" disabled={to >= total}
                onClick={() => setOffset((o) => o + PAGE)}>Next →</button>
              <span className="gx-muted small ux4g-ml-auto">Page {Math.floor(offset / PAGE) + 1} of {Math.ceil(total / PAGE)}</span>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
