"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

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
      <div className="container-fluid p-4">
        <h1 className="h3" style={{ color: "var(--ux-navy)" }}>Continuous monitoring</h1>
        <p className="text-secondary small">
          Schedule recurring audits so the estate is watched continuously — the GSA model —
          rather than only on request.
        </p>
        {err && <div className="alert alert-warning py-2">{err}</div>}

        <div className="card shadow-sm mb-3"><div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-6">
              <label className="form-label small" htmlFor="monitor-domain">Domain</label>
              <select id="monitor-domain" className="form-select" value={domainId}
                onChange={e => setDomainId(e.target.value)}>
                <option value="">Select a verified domain…</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.url}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small" htmlFor="monitor-cadence">Cadence</label>
              <select id="monitor-cadence" className="form-select" value={cadence}
                onChange={e => setCadence(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="col-md-3">
              <button className="btn btn-primary w-100" disabled={!domainId} onClick={add}>
                <i className="bi bi-plus-circle me-1" /> Add monitor
              </button>
            </div>
          </div>
        </div></div>

        <div className="card shadow-sm"><div className="table-responsive"><table className="table mb-0">
          <thead><tr><th>Domain</th><th>Cadence</th><th>Next run</th><th>Last run</th><th></th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id}>
                <td>{s.domain}</td>
                <td><span className="badge bg-secondary">{s.cadence}</span></td>
                <td className="small">{s.next_run_at?.slice(0, 16).replace("T", " ")}</td>
                <td className="small text-secondary">{s.last_run_at ? s.last_run_at.slice(0, 16).replace("T", " ") : "—"}</td>
                {/* icon-only control needs an accessible name — WCAG 4.1.2, the
                    same "buttons must have discernible text" rule this platform
                    reports on other people's sites */}
                <td><button className="btn btn-sm btn-outline-danger" onClick={() => remove(s.id)}
                  aria-label={`Stop monitoring ${s.domain || "this domain"}`}>
                  <i className="bi bi-trash" aria-hidden="true" /></button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-secondary text-center py-4">No monitors yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </AppShell>
  );
}
