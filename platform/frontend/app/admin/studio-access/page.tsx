"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
          <h1 className="mb-1">Studio access</h1>
          <div className="gx-muted">
            Which organisations may use GovUX Studio, the AI prototype generator. Studio consumes
            paid model capacity, so access is granted per organisation rather than by default.
          </div>
        </div>
      </div>
      {err && <div className="alert alert-warning" role="alert">{err}</div>}
      <div className="gx-card"><div className="table-responsive">
        <table className="gx-table gx-responsive">
          <thead><tr><th>Organisation</th><th>Type</th><th>Runs</th><th>Studio access</th></tr></thead>
          <tbody>
            {rows == null && <tr><td colSpan={4} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" /></td></tr>}
            {rows?.length === 0 && !err && <tr><td colSpan={4} className="gx-muted text-center py-5">No organisations.</td></tr>}
            {(rows || []).map((o) => (
              <tr key={o.id}>
                <td data-label="Organisation" className="fw-semibold">{o.name}</td>
                <td data-label="Type"><span className="gx-chip">{o.org_type}</span></td>
                <td data-label="Runs" className="text-secondary">{o.runs}</td>
                <td data-label="Studio access">
                  <div className="form-check form-switch mb-0">
                    <input className="form-check-input" type="checkbox" role="switch"
                      checked={!!o.studio_enabled} disabled={busy === o.id}
                      onChange={(e) => toggle(o.id, e.target.checked)}
                      aria-label={`Studio access for ${o.name}`} />
                    <span className="small ms-1">{o.studio_enabled ? "Approved" : "Not approved"}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div></AppShell>
  );
}
