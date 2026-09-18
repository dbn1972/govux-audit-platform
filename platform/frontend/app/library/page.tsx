"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
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
            <h1 className="ux4g-mb-2xs">Guideline library</h1>
            <div className="gx-muted">Every check explained in plain language with a good example.</div>
          </div>
        </div>
        <div className="gx-card"><div className="gx-card-body ux4g-d-flex ux4g-gap-s ux4g-flex-wrap ux4g-ai-center">
          <div className="ux4g-d-flex ux4g-gap-xs ux4g-flex-wrap">
            {["", "WCAG", "GIGW", "UX4G", "CWV"].map(f => (
              <button key={f} onClick={() => setFam(f)} aria-pressed={fam === f}
                className={`ux4g-btn ux4g-btn-sm ${fam === f ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}>{f || "All"}</button>
            ))}
          </div>
          <div className="ux4g-flex-grow-1" style={{ minWidth: 220, maxWidth: 420 }}>
            <label htmlFor="lib-search" className="ux4g-sr-only">Search guidelines</label>
            <div className="ux4g-input-container ux4g-input-md ux4g-w-100">
              <div className="ux4g-input">
                <span className="ux4g-input-leading-icon" aria-hidden="true"><Icon name="search" size={16} /></span>
                <input id="lib-search" className="ux4g-input-input" value={q} type="search"
                  placeholder="Search by id, title or wording…"
                  onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </div>
          {/* A library is unusable without knowing its size: 470 entries behind
              five chips looked identical to 40. */}
          <div className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }} aria-live="polite">
            {rows == null ? "Loading…"
              : needle || fam
                ? `${matches.length} of ${all.length} guideline${all.length === 1 ? "" : "s"}`
                : `${all.length} guideline${all.length === 1 ? "" : "s"}`}
          </div>
        </div></div>
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        {rows == null && !err && (
          <div className="ux4g-text-center ux4g-py-l">
            <Spinner size="md" label="Loading the library" />
          </div>
        )}
        {rows != null && matches.length === 0 && !err && (
          <div className="gx-card"><div className="gx-empty">
            <div className="gx-empty-icon"><Icon name="search" size={24} /></div>
            <h2 className="ux4g-mt-s ux4g-mb-2xs">Nothing matches “{q || fam}”</h2>
            <p className="gx-muted ux4g-mb-s">
              {needle && all.length
                ? "No guideline in this family mentions that. Try a rule id like WCAG-1.4.3, or clear the family filter."
                : "No guidelines in this family yet."}
            </p>
            <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-md" onClick={() => { setQ(""); setFam(""); }}>
              Clear filters
            </button>
          </div></div>
        )}

        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          {shown.map(g => (
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-6" key={g.id}><div className="gx-card ux4g-h-100"><div className="gx-card-body">
              <div className="ux4g-d-flex ux4g-gap-xs ux4g-mb-2xs"><span className="ux4g-tag-tonal-neutral ux4g-tag-s">{g.id}</span>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s">{g.family}</span></div>
              <h2 className="ux4g-heading-2xs-strong">{g.title}</h2>
              <p className="gx-muted ux4g-fs-14 ux4g-mb-xs">{g.plain_language}</p>
              {g.good_example && (
                <div className="ux4g-alert ux4g-alert-success ux4g-py-xs ux4g-fs-14 ux4g-mb-none">
                  <Icon name="check2" size={16} className="ux4g-mr-2xs" />{g.good_example}
                </div>
              )}
            </div></div></div>
          ))}
        </div>

        {matches.length > shown.length && (
          <div className="ux4g-text-center">
            <button className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-md" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, matches.length - shown.length)} more
              <span className="gx-muted ux4g-ml-xs">({shown.length} of {matches.length})</span>
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
