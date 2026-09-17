"use client";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";

const SAMPLE = `url,organisation,org_type,state_code,category
indiapost.gov.in,Department of Posts,department,,transactional
ux4g.gov.in,National e-Governance Division,department,,informational
karnataka.gov.in,Government of Karnataka,state,KA,informational`;

type Result = {
  dry_run: boolean; total_rows: number; imported: number; duplicates: number;
  invalid: number; new_organisations: string[];
  errors: { row: number; url: string; error: string }[]; errors_truncated: number;
};

export default function Registry() {
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // A preview must always precede a write: importing thousands of rows is not
  // something to discover was wrong afterwards.
  const previewed = res != null && res.dry_run;

  async function run(dryRun: boolean) {
    setBusy(true); setErr("");
    try {
      setRes(await api.importRegistry(csv, dryRun));
    } catch (e: any) { setErr(e?.message || "Import failed."); setRes(null); }
    finally { setBusy(false); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { setCsv(String(r.result || "")); setRes(null); };
    r.readAsText(f);
  }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">National register import</h1>
            <div className="gx-muted">Bulk-load the .gov.in / .nic.in estate so the National Dashboard, League Table and the
          ministry / state roll-ups report against a real denominator. Imported domains are
          recorded as <b>known</b>, not verified — DNS-TXT verification remains the only way an
          organisation claims ownership and unlocks auditing.</div>
          </div>
        </div>

        <div className="gx-card ux4g-mb-s">
          <div className="gx-card-head">
            <h2>CSV extract</h2>
            <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
              Preview, then import — nothing is written until you do
            </span>
          </div>
          <div className="gx-card-body">
            <div className="ux4g-d-flex ux4g-flex-wrap ux4g-gap-xs ux4g-ai-center ux4g-mb-xs">
              <input type="file" accept=".csv,text/csv" className="ux4g-input ux4g-w-100"
                style={{ maxWidth: 320 }} aria-label="Choose a CSV file" onChange={onFile} />
              <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm"
                onClick={() => { setCsv(SAMPLE); setRes(null); }}>Use sample</button>
            </div>
            <textarea className="ux4g-input ux4g-w-100 font-monospace" rows={10} spellCheck={false}
              aria-label="Registry CSV contents"
              placeholder={SAMPLE}
              value={csv} onChange={(e) => { setCsv(e.target.value); setRes(null); }} />
            <div className="form-text">
              Required columns: <code>url</code>, <code>organisation</code>. Optional:{" "}
              <code>org_type</code> (ministry/department/state/ut/psu/other),{" "}
              <code>state_code</code>, <code>category</code>. Up to 5,000 rows per import.
            </div>
          </div>
          <div className="gx-card-body ux4g-d-flex ux4g-gap-xs ux4g-ai-center ux4g-flex-wrap"
            style={{ borderTop: "1px solid var(--gx-border)", background: "var(--gx-surface-muted)" }}>
            <button className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-md" disabled={!csv.trim() || busy}
              onClick={() => run(true)}>{busy ? "Checking…" : "Preview"}</button>
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" disabled={!previewed || busy}
              onClick={() => run(false)}>Import for real</button>
            {!previewed && (
              <span className="gx-muted small">
                <Icon name="info-circle" size={16} className="ux4g-mr-2xs" />
                Preview first — the import is checked against the register before anything is written.
              </span>
            )}
          </div>
        </div>

        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

        {res && (
          <div className="gx-card">
            <div className="gx-card-head">
              {res.dry_run ? "Preview — nothing has been saved" : "Import complete"}
            </div>
            <div className="gx-card-body">
              <div className="gx-stats ux4g-mb-m">
                {[["Rows read", res.total_rows, undefined, "in the file"],
                  [res.dry_run ? "Would import" : "Imported", res.imported,
                   "var(--gx-band-A)", res.dry_run ? "new to the register" : "added to the register"],
                  ["Duplicates skipped", res.duplicates, undefined, "already known"],
                  ["Invalid rows", res.invalid, res.invalid ? "var(--gx-band-E)" : undefined,
                   res.invalid ? "listed below" : "nothing rejected"],
                ].map(([label, val, colour, note]) => (
                  <div className="gx-stat" key={String(label)}>
                    <div className="gx-label">{String(label)}</div>
                    <div className="gx-stat-value" style={colour ? { color: colour as string } : undefined}>
                      {String(val)}
                    </div>
                    <div className="gx-stat-note">{String(note)}</div>
                  </div>
                ))}
              </div>

              {res.new_organisations.length > 0 && (
                <>
                  {/* an import creates organisations as a side effect; naming
                      them is how a steward catches "Dept of Posts" arriving
                      alongside the "Department of Posts" that already exists */}
                  <h3 className="h6 ux4g-mb-2xs">
                    Organisations this import creates ({res.new_organisations.length})
                  </h3>
                  <p className="small">
                    {res.new_organisations.slice(0, 40).join(" · ")}
                    {res.new_organisations.length > 40 && ` … and ${res.new_organisations.length - 40} more`}
                  </p>
                </>
              )}

              {res.errors.length > 0 && (
                <div className="table-responsive">
                  <table className="gx-table gx-responsive">
                    <thead><tr><th>Row</th><th>Value</th><th>Problem</th></tr></thead>
                    <tbody>
                      {res.errors.map((e, i) => (
                        <tr key={i}>
                          <td data-label="Row" className="small gx-num">{e.row}</td>
                          <td data-label="Value" className="small font-monospace">
                            {e.url || <span className="gx-muted">—</span>}</td>
                          <td data-label="Problem" className="small" style={{ color: "var(--gx-band-E)" }}>
                            {e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {res.errors_truncated > 0 && (
                    <div className="form-text">…and {res.errors_truncated} more rows with problems.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
