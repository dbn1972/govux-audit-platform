"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

// Runtime configuration — admin-editable email provider, CAPTCHA, rate limits,
// scan parameters. Changes take effect live (no redeploy).
export default function ConfigAdmin() {
  const [cats, setCats] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [health, setHealth] = useState<any>(null);

  async function load() {
    try { setCats((await api.adminConfig()).categories); }
    catch (e: any) { setErr(e.message || "Only programme admins can edit configuration."); }
  }
  async function loadHealth() {
    try { setHealth(await api.adminMetrics()); } catch { /* leave last snapshot */ }
  }
  useEffect(() => { load(); loadHealth(); const t = setInterval(loadHealth, 5000); return () => clearInterval(t); }, []);

  function change(key: string, value: any) { setEdits(p => ({ ...p, [key]: value })); }

  async function save() {
    setMsg(""); setErr("");
    try {
      const r = await api.updateConfig(edits);
      const n = Object.keys(r.applied || {}).length;
      setMsg(`Saved ${n} setting${n === 1 ? "" : "s"}. Changes are live.`);
      setEdits({}); await load();
    } catch (e: any) { setErr(e.message || "Save failed."); }
  }

  async function sendTest() {
    setTestMsg("");
    try {
      const r = await api.testEmail(testTo);
      setTestMsg(r.ok ? `✓ Test email sent via '${r.provider}'.`
        : `✗ Failed via '${r.provider}'${r.error ? ": " + r.error : ""}.`);
    } catch (e: any) { setTestMsg("✗ " + (e.message || "Failed to send.")); }
  }

  const dirty = Object.keys(edits).length > 0;

  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 820 }}>
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h1 className="h3 mb-0" style={{ color: "var(--ux-navy)" }}>Platform configuration</h1>
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>
            <i className="bi bi-check2 me-1" /> Save changes
          </button>
        </div>
        <p className="text-secondary small">Email delivery, CAPTCHA, rate limits and scan quotas —
          editable at runtime, no redeploy. Secrets are write-only (never shown).</p>
        {err && <div className="alert alert-warning py-2">{err}</div>}
        {msg && <div className="alert alert-success py-2">{msg}</div>}

        {/* Live scalability health — cache / queue / DB, from /v1/admin/config/metrics-summary */}
        {health && (() => {
          const c = health.cache || {}, q = health.queue || {}, p = health.db_pool || {};
          const hr = c.hit_rate == null ? "—" : `${Math.round(c.hit_rate * 100)}%`;
          const tiles: [string, any, boolean][] = [
            ["Cache hit rate", hr, (c.hit_rate ?? 1) < 0.5],
            ["Cache hits / misses", `${c.hits ?? 0} / ${c.misses ?? 0}`, false],
            ["Audit queue depth", q.audit_depth, (q.audit_depth ?? 0) > 5000],
            ["Pending (unacked)", q.audit_pending, (q.audit_pending ?? 0) > 100],
            ["Dead-letter queue", q.audit_dlq, (q.audit_dlq ?? 0) > 0],
            ["Public scan queue", q.public_depth, false],
            ["DB pool in use", `${p.checked_out ?? "—"} / ${p.size ?? "—"}`, (p.checked_out ?? 0) >= (p.size ?? 999)],
          ];
          return (
            <div className="card shadow-sm mb-3">
              <div className="card-header bg-white fw-semibold d-flex align-items-center" style={{ color: "var(--ux-navy)" }}>
                <i className="bi bi-activity me-2" />Live health
                <span className="badge bg-success-subtle text-success-emphasis ms-2">auto · 5s</span>
                <span className="ms-auto text-secondary" style={{ fontSize: 11 }}>
                  Prometheus: <code>GET /metrics</code>
                </span>
              </div>
              <div className="card-body">
                <div className="row g-2">
                  {tiles.map(([label, val, warn]) => (
                    <div className="col-6 col-md-3" key={label}>
                      <div className="border rounded p-2 h-100">
                        <div className="text-secondary" style={{ fontSize: 11 }}>{label}</div>
                        <div className="fw-bold" style={{ fontSize: 18, color: warn ? "#b91c1c" : "var(--ux-navy)" }}>
                          {val ?? "—"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {cats.map(cat => (
          <div className="card shadow-sm mb-3" key={cat.name}>
            <div className="card-header bg-white fw-semibold" style={{ color: "var(--ux-navy)" }}>{cat.name}</div>
            <div className="card-body">
              {cat.settings.map((s: any) => {
                const val = s.key in edits ? edits[s.key] : s.value;
                return (
                  <div className="row align-items-center mb-2" key={s.key}>
                    <label className="col-sm-6 col-form-label">
                      {s.label}
                      {s.is_override && <span className="badge bg-info-subtle text-info-emphasis ms-2">overridden</span>}
                      <div className="text-secondary" style={{ fontSize: 11 }}><code>{s.key}</code></div>
                    </label>
                    <div className="col-sm-6">
                      {s.type === "bool" ? (
                        <div className="form-check form-switch">
                          <input className="form-check-input" type="checkbox"
                            checked={val === true || val === "true"}
                            onChange={e => change(s.key, e.target.checked)} />
                        </div>
                      ) : s.secret ? (
                        <input className="form-control" type="password" placeholder="•••••• (leave blank to keep)"
                          onChange={e => change(s.key, e.target.value)} />
                      ) : (
                        <input className="form-control" type={s.type === "int" ? "number" : "text"}
                          value={val ?? ""} onChange={e => change(s.key, e.target.value)} />
                      )}
                    </div>
                  </div>
                );
              })}
              {cat.name.startsWith("Email") && (
                <div className="border-top pt-3 mt-2">
                  <label className="form-label small text-secondary">Send a test email (uses the saved provider)</label>
                  <div className="input-group" style={{ maxWidth: 460 }}>
                    <input className="form-control" type="email" placeholder="you@nic.in"
                      value={testTo} onChange={e => setTestTo(e.target.value)} />
                    <button className="btn btn-outline-primary" disabled={!testTo} onClick={sendTest}>
                      <i className="bi bi-send me-1" />Send test
                    </button>
                  </div>
                  {testMsg && <div className="small mt-2">{testMsg}</div>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
