"use client";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
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
  passed: "ux4g-tag-tonal-success", failed: "ux4g-tag-tonal-error",
  partial: "ux4g-tag-tonal-warning", in_progress: "ux4g-tag-tonal-neutral",
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
            <h1 className="ux4g-mb-2xs">External assessments</h1>
            <div className="gx-muted">The assurance work automation cannot do — security VAPT, native-app accessibility,
          lived-experience panels with disabled users, and STQC certification outcomes. Records
          here appear in each audit&rsquo;s <b>evidence pack</b>; they never change the automated score.</div>
          </div>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

        {canWrite && (
          <div className="gx-card ux4g-mb-m">
            <div className="gx-card-head"><h2>Record an assessment</h2></div>
            <div className="gx-card-body">
              <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-xs">
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-4">
                  <label className="ux4g-label-m-default" htmlFor="as-kind">Type</label>
                  <select id="as-kind" className="ux4g-form-select ux4g-form-select-md" value={form.kind}
                          onChange={e => set("kind", e.target.value)}>
                    {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-8">
                  <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100">
                    <label className="ux4g-label-m-default" htmlFor="as-title">Title</label>
                    <div className="ux4g-input">
                      <input id="as-title" className="ux4g-input-input" value={form.title}
                             placeholder="e.g. Annual VAPT of the citizen portal"
                             onChange={e => set("title", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-4">
                  <label className="ux4g-label-m-default" htmlFor="as-domain">Domain (optional)</label>
                  <select id="as-domain" className="ux4g-form-select ux4g-form-select-md" value={form.domain_id}
                          onChange={e => set("domain_id", e.target.value)}>
                    <option value="">Organisation-wide</option>
                    {domains.map((d: any) => <option key={d.id} value={d.id}>{d.url}</option>)}
                  </select>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-4">
                  <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100">
                    <label className="ux4g-label-m-default" htmlFor="as-agency">Performed by</label>
                    <div className="ux4g-input">
                      <input id="as-agency" className="ux4g-input-input" value={form.agency}
                             placeholder="Agency / lab / panel organiser"
                             onChange={e => set("agency", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-2">
                  <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100">
                    <label className="ux4g-label-m-default" htmlFor="as-date">Assessed on</label>
                    <div className="ux4g-input">
                      <input id="as-date" type="date" className="ux4g-input-input"
                             value={form.assessed_on} onChange={e => set("assessed_on", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-2">
                  <label className="ux4g-label-m-default" htmlFor="as-outcome">Outcome</label>
                  <select id="as-outcome" className="ux4g-form-select ux4g-form-select-md" value={form.outcome}
                          onChange={e => set("outcome", e.target.value)}>
                    {["in_progress", "passed", "partial", "failed"].map(o =>
                      <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-8">
                  <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100">
                    <label className="ux4g-label-m-default" htmlFor="as-summary">Summary (optional)</label>
                    <div className="ux4g-input">
                      <input id="as-summary" className="ux4g-input-input" value={form.summary}
                             onChange={e => set("summary", e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="ux4g-cols-span-12 ux4g-md-cols-span-4">
                  <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100">
                    <label className="ux4g-label-m-default" htmlFor="as-ref">Report ref / certificate no.</label>
                    <div className="ux4g-input">
                      <input id="as-ref" className="ux4g-input-input" value={form.report_ref}
                             onChange={e => set("report_ref", e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
              <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm ux4g-mt-s" disabled={busy || form.title.trim().length < 3}
                      onClick={save}>
                {busy ? "Saving…" : "Record assessment"}
              </button>
            </div>
          </div>
        )}

        <div className="gx-card">
          <div className="gx-card-head">
            <h2>Recorded assessments</h2>
            {rows && <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </span>}
          </div>
          <div>
            {!rows && <div className="ux4g-p-m ux4g-text-center"><Spinner size="md" /></div>}
            {rows && rows.length === 0 && (
              <div className="gx-empty">
                <div className="gx-empty-icon"><Icon name="shield-check" size={24} /></div>
                <h3 className="ux4g-heading-2xs-strong ux4g-mt-s ux4g-mb-2xs">No external assessments yet</h3>
                <p className="gx-muted ux4g-mb-none">
                  {canWrite
                    ? "Record VAPT, native-app accessibility, lived-experience panels or STQC outcomes above — they travel with every evidence pack."
                    : "An assessor or admin can record VAPT, panel and STQC outcomes here."}
                </p>
              </div>
            )}
            {rows && rows.length > 0 && (
              <div className="ux4g-table-responsive ux4g-table-rounded">
                <table className="ux4g-table ux4g-table-m">
                  <thead>
                    <tr>
                      <th>Type</th><th>Title</th><th>Scope</th><th>Performed by</th>
                      <th>Assessed</th><th>Outcome</th><th>Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(a => (
                      <tr key={a.id}>
                        <td className="ux4g-fs-14">{KIND_LABEL[a.kind] || a.kind}</td>
                        <td className="ux4g-fw-semibold ux4g-fs-14">{a.title}
                          {a.summary && <div className="ux4g-fw-regular gx-muted">{a.summary}</div>}
                        </td>
                        <td className="ux4g-fs-14">{a.domain || "Org-wide"}</td>
                        <td className="ux4g-fs-14">{a.agency || "—"}</td>
                        <td className="ux4g-fs-14">{a.assessed_on || "—"}</td>
                        <td><span className={`ux4g-tag-s ${OUTCOME_STYLE[a.outcome] || "ux4g-tag-tonal-neutral"}`}>
                          {a.outcome.replace(/_/g, " ")}</span></td>
                        <td className="ux4g-fs-14">{a.report_ref || "—"}</td>
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
