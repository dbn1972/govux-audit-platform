"use client";
import { useState } from "react";
import AppShell from "@/components/AppShell";
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
      <div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
        <h1 className="h3">National register import</h1>
        <p className="text-secondary small">
          Bulk-load the .gov.in / .nic.in estate so the National Dashboard, League Table and the
          ministry / state roll-ups report against a real denominator. Imported domains are
          recorded as <b>known</b>, not verified — DNS-TXT verification remains the only way an
          organisation claims ownership and unlocks auditing.
        </p>

        <div className="card shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold">CSV extract</div>
          <div className="card-body">
            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
              <input type="file" accept=".csv,text/csv" className="form-control form-control-sm"
                style={{ maxWidth: 320 }} aria-label="Choose a CSV file" onChange={onFile} />
              <button className="btn btn-sm btn-outline-secondary"
                onClick={() => { setCsv(SAMPLE); setRes(null); }}>Use sample</button>
            </div>
            <textarea className="form-control font-monospace" rows={10} spellCheck={false}
              aria-label="Registry CSV contents"
              placeholder={SAMPLE}
              value={csv} onChange={(e) => { setCsv(e.target.value); setRes(null); }} />
            <div className="form-text">
              Required columns: <code>url</code>, <code>organisation</code>. Optional:{" "}
              <code>org_type</code> (ministry/department/state/ut/psu/other),{" "}
              <code>state_code</code>, <code>category</code>. Up to 5,000 rows per import.
            </div>
          </div>
          <div className="card-footer bg-white d-flex gap-2 align-items-center">
            <button className="btn btn-outline-primary btn-sm" disabled={!csv.trim() || busy}
              onClick={() => run(true)}>{busy ? "Checking…" : "Preview"}</button>
            <button className="btn btn-primary btn-sm" disabled={!previewed || busy}
              onClick={() => run(false)}>Import for real</button>
            {!previewed && <span className="text-secondary small">Preview first to enable import.</span>}
          </div>
        </div>

        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        {res && (
          <div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">
              {res.dry_run ? "Preview — nothing has been saved" : "Import complete"}
            </div>
            <div className="card-body">
              <div className="row g-3 mb-3">
                {[["Rows read", res.total_rows, ""],
                  [res.dry_run ? "Would import" : "Imported", res.imported, "text-success"],
                  ["Duplicates skipped", res.duplicates, "text-secondary"],
                  ["Invalid rows", res.invalid, res.invalid ? "text-danger" : "text-secondary"],
                ].map(([label, val, cls]) => (
                  <div className="col-6 col-md-3" key={String(label)}>
                    <div className="border rounded p-2 text-center">
                      <div className={`h4 mb-0 ${cls}`}>{String(val)}</div>
                      <div className="small text-secondary">{String(label)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {res.new_organisations.length > 0 && (
                <>
                  <div className="fw-semibold small mb-1">
                    New organisations ({res.new_organisations.length})
                  </div>
                  <p className="small">
                    {res.new_organisations.slice(0, 40).join(" · ")}
                    {res.new_organisations.length > 40 && ` … and ${res.new_organisations.length - 40} more`}
                  </p>
                </>
              )}

              {res.errors.length > 0 && (
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead className="table-light"><tr><th>Row</th><th>Value</th><th>Problem</th></tr></thead>
                    <tbody>
                      {res.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="small">{e.row}</td>
                          <td className="small font-monospace">{e.url || <span className="text-secondary">—</span>}</td>
                          <td className="small text-danger">{e.error}</td>
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
