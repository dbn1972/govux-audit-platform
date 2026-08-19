"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

// No demo fallback: this page used to seed itself with four hardcoded
// guidelines and swallow API errors, so a 401 or an empty library rendered
// fabricated entries indistinguishable from the real ones. The library is
// seeded for real by migration 0012 — show what the API returns, or say why not.

export default function Library() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [fam, setFam] = useState("");
  useEffect(() => {
    setErr("");
    api.guidelines(fam || undefined)
      .then((r) => setRows(r || []))
      .catch((e: any) => { setErr(e?.message || "Could not load the guideline library."); setRows([]); });
  }, [fam]);
  const shown = rows || [];

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Guideline library</h1>
            <div className="gx-muted">Every check explained in plain language with a good example.</div>
          </div>
        </div>
        <div className="mb-3 d-flex gap-2 flex-wrap">
          {["", "WCAG", "GIGW", "UX4G", "CWV"].map(f => (
            <button key={f} onClick={() => setFam(f)}
              className={`btn btn-sm ${fam === f ? "btn-primary" : "btn-outline-secondary"}`}>{f || "All"}</button>
          ))}
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        {rows != null && shown.length === 0 && !err && (
          <div className="text-secondary text-center py-5">
            No guidelines in this family yet.
          </div>
        )}

        <div className="row g-3">
          {shown.map(g => (
            <div className="col-md-6" key={g.id}><div className="gx-card h-100"><div className="gx-card-body">
              <div className="d-flex gap-2 mb-1"><span className="badge text-bg-primary-subtle">{g.id}</span>
                <span className="badge text-bg-light">{g.family}</span></div>
              <h2 className="h6">{g.title}</h2>
              <p className="text-secondary small mb-2">{g.plain_language}</p>
              {g.good_example && <div className="alert alert-success py-2 small mb-0">✓ {g.good_example}</div>}
            </div></div></div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
