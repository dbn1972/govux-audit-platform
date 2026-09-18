"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

export default function StudioAccess() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  function load() {
    api.studioTenants().then(setRows)
      .catch((e: any) => { setErr(e?.message || "Only a super administrator can manage Studio access."); setRows([]); });
  }
  useEffect(load, []);

  async function toggle(orgId: string, enabled: boolean) {
    setBusy(orgId); setErr("");
    try {
      await api.studioSetTenant(orgId, enabled);
      setRows((r) => (r || []).map((o) => (o.id === orgId ? { ...o, studio_enabled: enabled } : o)));
    } catch (e: any) { setErr(e?.message || "Could not update."); }
    finally { setBusy(""); }
  }

  return (
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="ux4g-mb-2xs">Studio access</h1>
          <div className="gx-muted">
            Which organisations may use GovUX Studio, the AI prototype generator. Studio consumes
            paid model capacity, so access is granted per organisation rather than by default.
          </div>
        </div>
      </div>
      {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
      <div className="ux4g-card ux4g-card-solid ux4g-card-outline"><div className="ux4g-table-responsive ux4g-table-rounded">
        <table className="ux4g-table ux4g-table-m gx-responsive">
          <thead><tr><th>Organisation</th><th>Type</th><th>Runs</th><th>Studio access</th></tr></thead>
          <tbody>
            {rows == null && <tr><td colSpan={4} className="ux4g-text-center ux4g-py-m"><Spinner size="sm" /></td></tr>}
            {rows?.length === 0 && !err && <tr><td colSpan={4} className="gx-muted ux4g-text-center ux4g-py-l">No organisations.</td></tr>}
            {(rows || []).map((o) => (
              <tr key={o.id}>
                <td data-label="Organisation" className="ux4g-fw-semibold">{o.name}</td>
                <td data-label="Type"><span className="gx-chip">{o.org_type}</span></td>
                <td data-label="Runs" className="gx-muted">{o.runs}</td>
                <td data-label="Studio access">
                  <label className="ux4g-switch ux4g-switch-md ux4g-mb-none">
                    <input className="ux4g-switch-input" type="checkbox" role="switch"
                      checked={!!o.studio_enabled} disabled={busy === o.id}
                      onChange={(e) => toggle(o.id, e.target.checked)}
                      aria-label={`Studio access for ${o.name}`} />
                    <div className="ux4g-switch-control"><span className="ux4g-switch-track"><span className="ux4g-switch-thumb"></span></span></div>
                    <div className="ux4g-switch-content"><span className="ux4g-switch-label">{o.studio_enabled ? "Approved" : "Not approved"}</span></div>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div></AppShell>
  );
}
