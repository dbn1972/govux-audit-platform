"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const DEMO = [
  { id: "1", label: "Chrome · Windows", last_location: "New Delhi, IN", last_active_at: new Date().toISOString(), current: true },
  { id: "2", label: "Safari · iPhone", last_location: "New Delhi, IN", last_active_at: "2026-07-04", current: false },
];

export default function Settings() {
  const [devices, setDevices] = useState<any[]>(DEMO);
  useEffect(() => { api.devices().then(setDevices).catch(() => {}); }, []);

  async function revoke(id: string) {
    try { await api.revokeDevice(id); setDevices(d => d.filter(x => x.id !== id)); } catch {}
  }

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Team &amp; settings</h1>
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card shadow-sm">
              <div className="card-header bg-white d-flex align-items-center">
                <span className="fw-semibold">Trusted devices &amp; active sessions</span>
                <button className="btn btn-sm btn-outline-secondary ms-auto">Sign out all others</button>
              </div>
              <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead className="table-light"><tr><th>Device</th><th>Location</th><th>Last active</th><th></th></tr></thead>
                <tbody>
                  {devices.map(d => (
                    <tr key={d.id}>
                      <td><b>{d.label || "Device"}</b><div className="text-secondary small">Device key bound</div></td>
                      <td>{d.last_location || "—"}</td>
                      <td className="small">{d.current ? "Now" : new Date(d.last_active_at).toLocaleDateString()}</td>
                      <td>{d.current
                        ? <span className="badge text-bg-success-subtle text-success">This device</span>
                        : <button className="btn btn-sm btn-link text-danger" onClick={() => revoke(d.id)}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="card-footer bg-white small text-secondary">
                🛡️ Sessions are device-bound: a short-lived access token + a rotating, device-keyed refresh token keep you
                signed in on trusted devices (Gmail-style). Sensitive actions still require a fresh OTP.
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="card shadow-sm"><div className="card-body">
              <h2 className="h6">Notifications</h2>
              {["Audit completed", "New critical issue", "Score regression"].map(n => (
                <div className="form-check form-switch" key={n}>
                  <input className="form-check-input" type="checkbox" defaultChecked /> <label className="form-check-label">{n}</label>
                </div>
              ))}
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
