"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api, setToken } from "@/lib/api";
import { relative, absolute } from "@/lib/format";

// States & UTs roll-up (/admin/states) groups by this code — short, so it fits
// the compact tile grid there. No canonical list existed anywhere before this.
const STATES: [string, string][] = [
  ["AP", "Andhra Pradesh"], ["AR", "Arunachal Pradesh"], ["AS", "Assam"], ["BR", "Bihar"],
  ["CG", "Chhattisgarh"], ["GA", "Goa"], ["GJ", "Gujarat"], ["HR", "Haryana"],
  ["HP", "Himachal Pradesh"], ["JH", "Jharkhand"], ["KA", "Karnataka"], ["KL", "Kerala"],
  ["MP", "Madhya Pradesh"], ["MH", "Maharashtra"], ["MN", "Manipur"], ["ML", "Meghalaya"],
  ["MZ", "Mizoram"], ["NL", "Nagaland"], ["OD", "Odisha"], ["PB", "Punjab"],
  ["RJ", "Rajasthan"], ["SK", "Sikkim"], ["TN", "Tamil Nadu"], ["TG", "Telangana"],
  ["TR", "Tripura"], ["UP", "Uttar Pradesh"], ["UK", "Uttarakhand"], ["WB", "West Bengal"],
  ["AN", "Andaman & Nicobar Islands"], ["CH", "Chandigarh"],
  ["DN", "Dadra & Nagar Haveli and Daman & Diu"], ["DL", "Delhi (NCT)"],
  ["JK", "Jammu & Kashmir"], ["LA", "Ladakh"], ["LD", "Lakshadweep"], ["PY", "Puducherry"],
];

export default function Settings() {
  // Security screen: never show fabricated sessions — load real ones, and on
  // failure show an error rather than placeholder devices that look real.
  const [devices, setDevices] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Organisation settings — can edit if owner/programme_admin/super_admin (the
  // API enforces this; canEditOrg just hides the Save action for lesser roles).
  const [orgName, setOrgName] = useState("");
  const [orgState, setOrgState] = useState("");
  const [canEditOrg, setCanEditOrg] = useState(false);
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgMsg, setOrgMsg] = useState("");
  useEffect(() => {
    api.me().then((m) => {
      setOrgName(m?.org_name || "");
      setOrgState(m?.org_state_code || "");
      setCanEditOrg(["owner", "programme_admin", "super_admin"].includes(m?.role));
    }).catch(() => {});
  }, []);
  async function saveOrg() {
    setOrgBusy(true); setOrgMsg("");
    try {
      await api.updateOrganisation({ name: orgName, state_code: orgState });
      setOrgMsg("✓ Saved.");
    } catch (e: any) { setOrgMsg("✗ " + (e?.message || "Could not save.")); }
    finally { setOrgBusy(false); }
  }

  // Team & roles — was DB-edit-only before this. canManageTeam mirrors the
  // API's own check; canGrantSteward further restricts who may hand out
  // programme_admin/super_admin (only an existing super_admin).
  const ROLES = ["owner", "contributor", "assessor", "programme_admin", "super_admin"];
  const [team, setTeam] = useState<any[] | null>(null);
  const [teamErr, setTeamErr] = useState("");
  const [myRole, setMyRole] = useState("");
  const [teamBusyId, setTeamBusyId] = useState<string | null>(null);
  const canManageTeam = ["owner", "programme_admin", "super_admin"].includes(myRole);
  const canGrantSteward = myRole === "super_admin";

  useEffect(() => {
    api.me().then((m) => setMyRole(m?.role || "")).catch(() => {});
    api.listTeam().then((t) => setTeam(t || []))
      .catch((e: any) => { setTeamErr(e?.message || "Could not load your team."); setTeam([]); });
  }, []);

  async function changeRole(userId: string, role: string) {
    setTeamBusyId(userId); setTeamErr("");
    try {
      await api.updateTeamRole(userId, role);
      setTeam((t) => (t || []).map((m) => (m.id === userId ? { ...m, role } : m)));
    } catch (e: any) { setTeamErr(e?.message || "Could not change that role."); }
    finally { setTeamBusyId(null); }
  }

  // Invitations — the only way to get a SECOND person into an organisation.
  // Without this, every new sign-in started org-less and the first domain it
  // registered auto-created a separate one-person org.
  const [invites, setInvites] = useState<any[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  function loadInvites() {
    api.listInvitations().then((i) => setInvites(i || [])).catch(() => setInvites([]));
  }
  useEffect(loadInvites, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true); setInviteMsg("");
    try {
      await api.createInvitation(inviteEmail.trim().toLowerCase(), inviteRole);
      setInviteMsg(`✓ Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail("");
      loadInvites();
    } catch (e: any) { setInviteMsg("✗ " + (e?.message || "Could not send that invitation.")); }
    finally { setInviteBusy(false); }
  }

  async function revokeInvite(id: string, email: string) {
    if (!confirm(`Revoke the invitation for ${email}?`)) return;
    setInviteMsg("");
    try { await api.revokeInvitation(id); setInvites((i) => (i || []).filter((x) => x.id !== id)); }
    catch (e: any) { setInviteMsg("✗ " + (e?.message || "Could not revoke that invitation.")); }
  }

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

  const [dpdpBusy, setDpdpBusy] = useState(false);
  const [dpdpMsg, setDpdpMsg] = useState("");

  async function downloadData() {
    setDpdpBusy(true); setDpdpMsg("");
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "my-govux-data.json"; a.click();
      URL.revokeObjectURL(url);
      setDpdpMsg("✓ Your data was downloaded.");
    } catch (e: any) { setDpdpMsg("✗ " + (e?.message || "Export failed.")); }
    finally { setDpdpBusy(false); }
  }

  async function eraseAccount() {
    if (!confirm("Permanently erase your account and personal data? Your audit records are kept but anonymised. This cannot be undone.")) return;
    setDpdpBusy(true); setDpdpMsg("");
    try {
      await api.eraseMyData();
      setToken(null);
      window.location.assign("/login");
    } catch (e: any) { setDpdpMsg("✗ " + (e?.message || "Could not erase your data.")); setDpdpBusy(false); }
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
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Team &amp; settings</h1>
            <div className="gx-muted">
              Your organisation, who can act on its behalf, the devices holding a session, and what
              the platform emails you about.
            </div>
          </div>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        {/* Grouped rather than a flat grid: who we are, who can act for us,
            then how the account is secured and what it tells us about. */}
        <h2 className="gx-section-label">Organisation &amp; people</h2>
        <div className="row g-3 mb-3">
          <div className="col-lg-6"><div className="gx-card h-100"><div className="gx-card-body">
            <h3 className="h6 mb-3">Organisation</h3>
            <div className="mb-2">
              <label className="form-label" htmlFor="org-name">Name</label>
              <input id="org-name" className="form-control" value={orgName}
                onChange={(e) => setOrgName(e.target.value)} disabled={!canEditOrg} />
            </div>
            <div className="mb-2">
              <label className="form-label" htmlFor="org-state">State / UT</label>
              <select id="org-state" className="form-select" value={orgState}
                onChange={(e) => setOrgState(e.target.value)} disabled={!canEditOrg}>
                <option value="">— Not set —</option>
                {STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
              </select>
              <div className="form-text">Feeds the national States &amp; UTs roll-up.</div>
            </div>
            {canEditOrg ? (
              <button className="btn btn-primary btn-sm" onClick={saveOrg} disabled={orgBusy}>
                {orgBusy ? "Saving…" : "Save"}</button>
            ) : (
              <div className="text-secondary small">Only an owner or admin can edit organisation settings.</div>
            )}
            {orgMsg && <div className="small mt-2 text-secondary">{orgMsg}</div>}
          </div></div></div>

          <div className="col-lg-6"><div className="gx-card h-100">
            <div className="gx-card-head">Team members</div>
            {teamErr && <div className="alert alert-warning m-2 mb-0 py-1 small" role="alert">{teamErr}</div>}
            <div className="table-responsive"><table className="table table-sm align-middle mb-0">
              <thead><tr><th>Member</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {team == null && (
                  <tr><td colSpan={3} className="text-center py-3">
                    <span className="spinner-border spinner-border-sm text-primary" role="status" aria-label="Loading" />
                  </td></tr>
                )}
                {team?.length === 0 && !teamErr && (
                  <tr><td colSpan={3} className="gx-muted text-center py-5">No team members found.</td></tr>
                )}
                {(team || []).map((m) => {
                  const stewardOnly = m.role === "programme_admin" || m.role === "super_admin";
                  const editable = canManageTeam && !m.is_you && (canGrantSteward || !stewardOnly);
                  return (
                    <tr key={m.id}>
                      <td className="small">{m.display_name || m.email}
                        {m.is_you && <span className="badge text-bg-secondary-subtle ms-1">you</span>}</td>
                      <td>
                        {editable ? (
                          <select className="form-select" value={m.role}
                            /* Names the person, not just "Role": in a table of
                               these a screen reader otherwise announces a column
                               of identical unlabelled dropdowns. */
                            aria-label={`Role for ${m.display_name || m.email}`}
                            disabled={teamBusyId === m.id}
                            onChange={(e) => changeRole(m.id, e.target.value)}>
                            {ROLES.filter((r) => canGrantSteward || !(r === "programme_admin" || r === "super_admin")
                                       || r === m.role).map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span className="badge text-bg-light">{m.role}</span>
                        )}
                      </td>
                      <td>{teamBusyId === m.id && <span className="spinner-border spinner-border-sm text-secondary" role="status" aria-label="Saving" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <div className="card-footer bg-white small text-secondary">
              {canGrantSteward
                ? "As a super_admin you can grant any role, including programme_admin/super_admin."
                : canManageTeam
                ? "Only a super_admin can grant a steward role (programme_admin/super_admin)."
                : "Only an owner or admin can change team roles."}
            </div>
          </div></div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-lg-12"><div className="gx-card">
            <div className="gx-card-head">Invite a colleague</div>
            <div className="gx-card-body">
              <p className="text-secondary small">
                Invited colleagues join <b>this</b> organisation when they first sign in, so you
                share the same domains, audits and reports. Only .gov.in / .nic.in addresses can
                be invited.
              </p>
              {canManageTeam ? (
                <form className="d-flex flex-wrap gap-2 align-items-start" onSubmit={sendInvite}>
                  <input type="email" required className="form-control"
                    style={{ maxWidth: 300 }} placeholder="colleague@ministry.gov.in"
                    aria-label="Colleague's government email address"
                    value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                  <select className="form-select" style={{ maxWidth: 180 }}
                    aria-label="Role to invite them as"
                    value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                    {ROLES.filter((r) => canGrantSteward
                      || !(r === "programme_admin" || r === "super_admin"))
                      .map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" disabled={inviteBusy}>
                    {inviteBusy ? "Sending…" : "Send invitation"}</button>
                </form>
              ) : (
                <div className="text-secondary small">Only an owner or admin can invite colleagues.</div>
              )}
              {inviteMsg && <div className="small mt-2 text-secondary">{inviteMsg}</div>}
            </div>

            {invites != null && invites.length > 0 && (
              <div className="table-responsive"><table className="table table-sm align-middle mb-0">
                <thead>
                  <tr><th>Pending invitation</th><th>Role</th><th>Expires</th><th></th></tr>
                </thead>
                <tbody>
                  {invites.map((i) => (
                    <tr key={i.id}>
                      <td className="small">{i.email}</td>
                      <td><span className="badge text-bg-light">{i.role}</span></td>
                      <td className="small">
                        {i.expired
                          ? <span className="text-danger">Expired</span>
                          : absolute(i.expires_at)}
                      </td>
                      <td className="text-end">
                        {canManageTeam && (
                          <button className="btn btn-sm btn-outline-danger"
                            onClick={() => revokeInvite(i.id, i.email)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div></div>
        </div>

        <h2 className="gx-section-label">Security &amp; preferences</h2>
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="gx-card">
              <div className="gx-card-head d-flex align-items-center">
                <span className="fw-semibold">Trusted devices &amp; active sessions</span>
                <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={revokeOthers}
                  disabled={busy || !(devices || []).some((d) => !d.current)}>
                  {busy ? "Signing out…" : "Sign out all others"}</button>
              </div>
              <div className="table-responsive"><table className="gx-table">
                <thead><tr><th>Device</th><th>Location</th><th>Last active</th><th></th></tr></thead>
                <tbody>
                  {devices == null && (
                    <tr><td colSpan={4} className="text-center py-4">
                      <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading your sessions…
                    </td></tr>
                  )}
                  {devices?.length === 0 && !err && (
                    <tr><td colSpan={4} className="gx-muted text-center py-5">No active sessions found.</td></tr>
                  )}
                  {(devices || []).map(d => (
                    <tr key={d.id}>
                      <td><b>{d.label || "Device"}</b><div className="text-secondary small">Device key bound</div></td>
                      <td>{d.last_location || "—"}</td>
                      <td className="small">{d.current ? "Now" : relative(d.last_active_at, "—")}</td>
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
            <div className="gx-card"><div className="gx-card-body">
              <h3 className="h6 mb-3">Notifications</h3>
              {["Audit completed", "New critical issue", "Score regression"].map(n => (
                <div className="form-check form-switch" key={n}>
                  <input className="form-check-input" type="checkbox" id={`notif-${n}`}
                    checked={prefs[n] ?? true} onChange={() => toggleNotif(n)} />
                  <label className="form-check-label" htmlFor={`notif-${n}`}>{n}</label>
                </div>
              ))}
              <p className="text-secondary small mb-0 mt-2">Saved on this device. Email delivery to your verified government address is being rolled out.</p>
            </div></div>

            <div className="gx-card mt-3"><div className="gx-card-body">
              <h3 className="h6 mb-3">Data &amp; privacy <span className="badge text-bg-primary-subtle ms-1">DPDP</span></h3>
              <p className="text-secondary small">Under the Digital Personal Data Protection Act, you can access
                and erase the personal data we hold about you.</p>
              <div className="d-flex flex-column gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={downloadData} disabled={dpdpBusy}>
                  <i className="bi bi-download me-1" />Download my data (JSON)</button>
                <button className="btn btn-outline-danger btn-sm" onClick={eraseAccount} disabled={dpdpBusy}>
                  <i className="bi bi-trash me-1" />Delete my account &amp; data</button>
              </div>
              {dpdpMsg && <div className="small mt-2 text-secondary">{dpdpMsg}</div>}
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
