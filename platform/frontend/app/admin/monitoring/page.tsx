"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
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
            <h1 className="ux4g-mb-2xs">Continuous monitoring</h1>
            <div className="gx-muted">Schedule recurring audits so the estate is watched continuously — the GSA model —
          rather than only on request.</div>
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning ux4g-py-xs">{err}</div>}

        <div className="gx-card">
          <div className="gx-card-head"><h2>Add a monitor</h2></div>
          <div className="gx-card-body">
          <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s ux4g-ai-end">
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-6">
              <label className="ux4g-label-m-default" htmlFor="monitor-domain">Domain</label>
              <select id="monitor-domain" className="ux4g-form-select ux4g-form-select-md" value={domainId}
                onChange={e => setDomainId(e.target.value)}>
                <option value="">Select a verified domain…</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.url}</option>)}
              </select>
            </div>
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-3">
              <label className="ux4g-label-m-default" htmlFor="monitor-cadence">Cadence</label>
              <select id="monitor-cadence" className="ux4g-form-select ux4g-form-select-md" value={cadence}
                onChange={e => setCadence(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-3">
              <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-w-100" disabled={!domainId} onClick={add}>
                <Icon name="plus-circle" size={16} className="ux4g-mr-2xs" />Add monitor
              </button>
            </div>
          </div>
          {/* the thing a scheduler screen must answer before anything else */}
          <p className="gx-muted ux4g-mb-none ux4g-mt-s" style={{ fontSize: ".8125rem" }}>
            Monitored audits run in the background at the chosen cadence and notify the
            organisation's admins when a score regresses by 5 points or more.
          </p>
          </div>
        </div>

        <div className="gx-card"><div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m gx-responsive">
          <thead><tr><th>Domain</th><th>Cadence</th><th>Next run</th><th>Last run</th>
            <th><span className="ux4g-sr-only">Actions</span></th></tr></thead>
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
                <td data-label=""><button className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-sm" onClick={() => remove(s.id)}
                  aria-label={`Stop monitoring ${s.domain || "this domain"}`}>
                  <Icon name="trash" size={16} /></button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="gx-muted ux4g-text-center ux4g-py-l">No monitors yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </AppShell>
  );
}
