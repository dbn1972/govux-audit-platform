"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

// No demo fallback: this page used to seed itself with four hardcoded
// guidelines and swallow API errors, so a 401 or an empty library rendered
// fabricated entries indistinguishable from the real ones. The library is
// seeded for real by migration 0012 — show what the API returns, or say why not.

const PAGE = 24;

export default function Library() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [fam, setFam] = useState("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    setErr("");
    api.guidelines(fam || undefined)
      .then((r) => setRows(r || []))
      .catch((e: any) => { setErr(e?.message || "Could not load the guideline library."); setRows([]); });
  }, [fam]);
  useEffect(() => { setLimit(PAGE); }, [fam, q]);   // a new filter starts at the top

  const all = rows || [];
  // Client-side because the whole family is already in hand: 470 rows is small
  // for a browser and large for a person, and a round-trip per keystroke would
  // be slower than the filter it replaces.
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? all.filter((g: any) => [g.id, g.title, g.plain_language, g.family]
        .some((v: string) => String(v || "").toLowerCase().includes(needle)))
    : all;
  const shown = matches.slice(0, limit);

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Guideline library</h1>
            <div className="gx-muted">Every check explained in plain language with a good example.</div>
          </div>
        </div>
        <div className="gx-card"><div className="gx-card-body d-flex gap-3 flex-wrap align-items-center">
          <div className="d-flex gap-2 flex-wrap">
            {["", "WCAG", "GIGW", "UX4G", "CWV"].map(f => (
              <button key={f} onClick={() => setFam(f)} aria-pressed={fam === f}
                className={`btn btn-sm ${fam === f ? "btn-primary" : "btn-outline-secondary"}`}>{f || "All"}</button>
            ))}
          </div>
          <div className="flex-grow-1" style={{ minWidth: 220, maxWidth: 420 }}>
            <label htmlFor="lib-search" className="visually-hidden">Search guidelines</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-search" aria-hidden="true" /></span>
              <input id="lib-search" className="form-control" value={q} type="search"
                placeholder="Search by id, title or wording…"
                onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {/* A library is unusable without knowing its size: 470 entries behind
              five chips looked identical to 40. */}
          <div className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }} aria-live="polite">
            {rows == null ? "Loading…"
              : needle || fam
                ? `${matches.length} of ${all.length} guideline${all.length === 1 ? "" : "s"}`
                : `${all.length} guideline${all.length === 1 ? "" : "s"}`}
          </div>
        </div></div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        {rows == null && !err && (
          <div className="text-center py-5">
            <span className="spinner-border text-primary" role="status" aria-label="Loading the library" />
          </div>
        )}
        {rows != null && matches.length === 0 && !err && (
          <div className="gx-card"><div className="gx-empty">
            <div className="gx-empty-icon"><i className="bi bi-search" aria-hidden="true" /></div>
            <h2 className="mt-3 mb-1">Nothing matches “{q || fam}”</h2>
            <p className="gx-muted mb-3">
              {needle && all.length
                ? "No guideline in this family mentions that. Try a rule id like WCAG-1.4.3, or clear the family filter."
                : "No guidelines in this family yet."}
            </p>
            <button className="btn btn-outline-secondary" onClick={() => { setQ(""); setFam(""); }}>
              Clear filters
            </button>
          </div></div>
        )}

        <div className="row g-3">
          {shown.map(g => (
            <div className="col-md-6" key={g.id}><div className="gx-card h-100"><div className="gx-card-body">
              <div className="d-flex gap-2 mb-1"><span className="badge text-bg-primary-subtle">{g.id}</span>
                <span className="badge text-bg-light">{g.family}</span></div>
              <h2 className="h6">{g.title}</h2>
              <p className="text-secondary small mb-2">{g.plain_language}</p>
              {g.good_example && (
                <div className="alert alert-success py-2 small mb-0">
                  <i className="bi bi-check2 me-1" aria-hidden="true" />{g.good_example}
                </div>
              )}
            </div></div></div>
          ))}
        </div>

        {matches.length > shown.length && (
          <div className="text-center">
            <button className="btn btn-outline-secondary" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, matches.length - shown.length)} more
              <span className="gx-muted ms-2">({shown.length} of {matches.length})</span>
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
