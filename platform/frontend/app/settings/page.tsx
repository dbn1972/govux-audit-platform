"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

export default function Settings() {
  // Security screen: never show fabricated sessions — load real ones, and on
  // failure show an error rather than placeholder devices that look real.
  const [devices, setDevices] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Notification preferences persist per-device (no server endpoint yet) so the
  // toggles actually remember a choice rather than resetting on every visit.
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setPrefs(JSON.parse(localStorage.getItem("govux:notif") || "{}")); } catch { /* ignore */ }
  }, []);
  function toggleNotif(n: string) {
    setPrefs((p) => {
      const next = { ...p, [n]: !(p[n] ?? true) };
      try { localStorage.setItem("govux:notif", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    api.devices()
      .then((d) => setDevices(d || []))
      .catch((e: any) => { setErr(e?.message || "Could not load your active sessions."); setDevices([]); });
  }, []);

  async function revoke(id: string) {
    if (!confirm("Revoke this device? It will be signed out and must sign in again with a fresh OTP.")) return;
    setErr("");
    try { await api.revokeDevice(id); setDevices((d) => (d || []).filter((x) => x.id !== id)); }
    catch (e: any) { setErr(e?.message || "Could not revoke that device. Please try again."); }
  }

  async function revokeOthers() {
    const others = (devices || []).filter((d) => !d.current);
    if (others.length === 0) return;
    if (!confirm(`Sign out ${others.length} other device(s)? They'll need a fresh OTP to sign back in.`)) return;
    setBusy(true); setErr("");
    try {
      await Promise.all(others.map((d) => api.revokeDevice(d.id)));
      setDevices((d) => (d || []).filter((x) => x.current));
    } catch (e: any) {
      setErr(e?.message || "Could not sign out every device. Please refresh and try again.");
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Team &amp; settings</h1>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card shadow-sm">
              <div className="card-header bg-white d-flex align-items-center">
                <span className="fw-semibold">Trusted devices &amp; active sessions</span>
                <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={revokeOthers}
                  disabled={busy || !(devices || []).some((d) => !d.current)}>
                  {busy ? "Signing out…" : "Sign out all others"}</button>
              </div>
              <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead className="table-light"><tr><th>Device</th><th>Location</th><th>Last active</th><th></th></tr></thead>
                <tbody>
                  {devices == null && (
                    <tr><td colSpan={4} className="text-center py-4">
                      <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading your sessions…
                    </td></tr>
                  )}
                  {devices?.length === 0 && !err && (
                    <tr><td colSpan={4} className="text-secondary text-center py-4">No active sessions found.</td></tr>
                  )}
                  {(devices || []).map(d => (
                    <tr key={d.id}>
                      <td><b>{d.label || "Device"}</b><div className="text-secondary small">Device key bound</div></td>
                      <td>{d.last_location || "—"}</td>
                      <td className="small">{d.current ? "Now" : (d.last_active_at ? new Date(d.last_active_at).toLocaleDateString() : "—")}</td>
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
                  <input className="form-check-input" type="checkbox" id={`notif-${n}`}
                    checked={prefs[n] ?? true} onChange={() => toggleNotif(n)} />
                  <label className="form-check-label" htmlFor={`notif-${n}`}>{n}</label>
                </div>
              ))}
              <p className="text-secondary small mb-0 mt-2">Saved on this device. Email delivery to your verified government address is being rolled out.</p>
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
