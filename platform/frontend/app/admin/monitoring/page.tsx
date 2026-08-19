"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { relative, absoluteTime } from "@/lib/format";

// Continuous, scheduled estate monitoring (gap G2) — audits run on a cadence
// instead of waiting for an owner to click 'audit'.
export default function Monitoring() {
  const [rows, setRows] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [domainId, setDomainId] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [err, setErr] = useState("");

  async function load() {
    try {
      setRows(await api.schedules());
      setDomains(await api.listDomains());
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    try { await api.createSchedule(domainId, cadence); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  async function remove(id: string) { await api.deleteSchedule(id); await load(); }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Continuous monitoring</h1>
            <div className="gx-muted">Schedule recurring audits so the estate is watched continuously — the GSA model —
          rather than only on request.</div>
          </div>
        </div>
        {err && <div className="alert alert-warning py-2">{err}</div>}

        <div className="gx-card">
          <div className="gx-card-head"><h2>Add a monitor</h2></div>
          <div className="gx-card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-6">
              <label className="form-label" htmlFor="monitor-domain">Domain</label>
              <select id="monitor-domain" className="form-select" value={domainId}
                onChange={e => setDomainId(e.target.value)}>
                <option value="">Select a verified domain…</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.url}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label" htmlFor="monitor-cadence">Cadence</label>
              <select id="monitor-cadence" className="form-select" value={cadence}
                onChange={e => setCadence(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="col-md-3">
              <button className="btn btn-primary w-100" disabled={!domainId} onClick={add}>
                <i className="bi bi-plus-circle me-1" aria-hidden="true" />Add monitor
              </button>
            </div>
          </div>
          {/* the thing a scheduler screen must answer before anything else */}
          <p className="gx-muted mb-0 mt-3" style={{ fontSize: ".8125rem" }}>
            Monitored audits run in the background at the chosen cadence and notify the
            organisation's admins when a score regresses by 5 points or more.
          </p>
          </div>
        </div>

        <div className="gx-card"><div className="table-responsive"><table className="gx-table gx-responsive">
          <thead><tr><th>Domain</th><th>Cadence</th><th>Next run</th><th>Last run</th>
            <th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td data-label="Domain" className="gx-cell-primary">{s.domain}</td>
                <td data-label="Cadence"><span className="gx-chip">{s.cadence}</span></td>
                <td data-label="Next run" className="small">{absoluteTime(s.next_run_at)}</td>
                <td data-label="Last run" className="small gx-muted">{relative(s.last_run_at, "Never")}</td>
                {/* icon-only control needs an accessible name — WCAG 4.1.2, the
                    same "buttons must have discernible text" rule this platform
                    reports on other people's sites */}
                <td data-label=""><button className="btn btn-sm btn-outline-danger" onClick={() => remove(s.id)}
                  aria-label={`Stop monitoring ${s.domain || "this domain"}`}>
                  <i className="bi bi-trash" aria-hidden="true" /></button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="gx-muted text-center py-5">No monitors yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </AppShell>
  );
}
