"use client";
import AppShell from "@/components/AppShell";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// Manual-assurance ledger: the assessments automation cannot perform (G9/G11/G13).
const KINDS: [string, string][] = [
  ["vapt", "Security VAPT (CERT-In empanelled)"],
  ["native_app_a11y", "Native mobile-app accessibility audit"],
  ["lived_experience_panel", "Lived-experience panel (users with disabilities)"],
  ["stqc_certification", "STQC certification"],
  ["other", "Other external assessment"],
];
const KIND_LABEL = Object.fromEntries(KINDS);
const OUTCOME_STYLE: Record<string, string> = {
  passed: "text-bg-success", failed: "text-bg-danger",
  partial: "text-bg-warning-subtle", in_progress: "text-bg-secondary",
};
const WRITER_ROLES = ["assessor", "programme_admin", "super_admin"];
const EMPTY = { kind: "vapt", title: "", agency: "", domain_id: "", assessed_on: "",
                outcome: "in_progress", summary: "", report_ref: "" };

export default function Assessments() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [domains, setDomains] = useState<any[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => api.listAssessments().then(d => setRows(d.assessments)).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    api.me().then(m => setCanWrite(WRITER_ROLES.includes(m.role))).catch(() => {});
    api.listDomains().then(d => setDomains(d.domains || d)).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true); setErr("");
    try {
      await api.createAssessment({
        ...form,
        domain_id: form.domain_id || null,
        assessed_on: form.assessed_on || null,
        agency: form.agency || null, summary: form.summary || null,
        report_ref: form.report_ref || null,
      });
      setForm(EMPTY);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not record the assessment.");
    } finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">External assessments</h1>
            <div className="gx-muted">The assurance work automation cannot do — security VAPT, native-app accessibility,
          lived-experience panels with disabled users, and STQC certification outcomes. Records
          here appear in each audit&rsquo;s <b>evidence pack</b>; they never change the automated score.</div>
          </div>
        </div>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        {canWrite && (
          <div className="card shadow-sm mb-4">
            <div className="card-body">
              <h2 className="h6" style={{ color: "var(--ux-navy)" }}>Record an assessment</h2>
              <div className="row g-2">
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="as-kind">Type</label>
                  <select id="as-kind" className="form-select form-select-sm" value={form.kind}
                          onChange={e => set("kind", e.target.value)}>
                    {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="col-md-8">
                  <label className="form-label small mb-1" htmlFor="as-title">Title</label>
                  <input id="as-title" className="form-control form-control-sm" value={form.title}
                         placeholder="e.g. Annual VAPT of the citizen portal"
                         onChange={e => set("title", e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="as-domain">Domain (optional)</label>
                  <select id="as-domain" className="form-select form-select-sm" value={form.domain_id}
                          onChange={e => set("domain_id", e.target.value)}>
                    <option value="">Organisation-wide</option>
                    {domains.map((d: any) => <option key={d.id} value={d.id}>{d.url}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="as-agency">Performed by</label>
                  <input id="as-agency" className="form-control form-control-sm" value={form.agency}
                         placeholder="Agency / lab / panel organiser"
                         onChange={e => set("agency", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <label className="form-label small mb-1" htmlFor="as-date">Assessed on</label>
                  <input id="as-date" type="date" className="form-control form-control-sm"
                         value={form.assessed_on} onChange={e => set("assessed_on", e.target.value)} />
                </div>
                <div className="col-md-2">
                  <label className="form-label small mb-1" htmlFor="as-outcome">Outcome</label>
                  <select id="as-outcome" className="form-select form-select-sm" value={form.outcome}
                          onChange={e => set("outcome", e.target.value)}>
                    {["in_progress", "passed", "partial", "failed"].map(o =>
                      <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="col-md-8">
                  <label className="form-label small mb-1" htmlFor="as-summary">Summary (optional)</label>
                  <input id="as-summary" className="form-control form-control-sm" value={form.summary}
                         onChange={e => set("summary", e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="as-ref">Report ref / certificate no.</label>
                  <input id="as-ref" className="form-control form-control-sm" value={form.report_ref}
                         onChange={e => set("report_ref", e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm mt-3" disabled={busy || form.title.trim().length < 3}
                      onClick={save}>
                {busy ? "Saving…" : "Record assessment"}
              </button>
            </div>
          </div>
        )}

        <div className="card shadow-sm">
          <div className="card-body p-0">
            {!rows && <div className="p-4"><div className="spinner-border text-primary" /></div>}
            {rows && rows.length === 0 && (
              <div className="p-4 text-secondary">
                No external assessments recorded yet.
                {canWrite ? " Use the form above to record the first one." :
                  " An assessor or admin can record VAPT, panel and STQC outcomes here."}
              </div>
            )}
            {rows && rows.length > 0 && (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr className="small text-secondary">
                      <th>Type</th><th>Title</th><th>Scope</th><th>Performed by</th>
                      <th>Assessed</th><th>Outcome</th><th>Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(a => (
                      <tr key={a.id}>
                        <td className="small">{KIND_LABEL[a.kind] || a.kind}</td>
                        <td className="fw-semibold small">{a.title}
                          {a.summary && <div className="fw-normal text-secondary">{a.summary}</div>}
                        </td>
                        <td className="small">{a.domain || "Org-wide"}</td>
                        <td className="small">{a.agency || "—"}</td>
                        <td className="small">{a.assessed_on || "—"}</td>
                        <td><span className={`badge ${OUTCOME_STYLE[a.outcome] || "text-bg-secondary"}`}>
                          {a.outcome.replace(/_/g, " ")}</span></td>
                        <td className="small">{a.report_ref || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
