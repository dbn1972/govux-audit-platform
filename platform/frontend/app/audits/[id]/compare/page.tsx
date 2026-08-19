"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";

type Issue = { guideline_id: string; title: string | null };
type PageRow = { url: string; status: string; score: number | null; delta: number | null; new_page: boolean };
type Compare = {
  has_baseline: boolean;
  message?: string;
  from_audit?: { task_id: string; date: string; score: number | null };
  to_audit?: { task_id: string; date: string; score: number | null };
  overall_delta?: number;
  new_issues?: Issue[];
  resolved_issues?: Issue[];
  pages?: PageRow[];
  pages_analysed?: number;
  pages_total?: number;
};

const fmt = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const statusLabel = (s: string) =>
  s === "analysed" ? "Analysed" : s === "not_recrawled" ? "Not recrawled" : s.charAt(0).toUpperCase() + s.slice(1);

export default function Compare({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Compare | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.compare(params.id).then(setData)
      .catch((e: any) => { setErr(e?.message || "Could not load the comparison."); setData(null); });
  }, [params.id]);

  const wrap = (b: React.ReactNode) => (
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mb-1">Compare &amp; page coverage</h1>
          <div className="gx-muted">
            What changed between two dated snapshots, and which pages the crawl actually reached.
          </div>
        </div>
      </div>
      <AuditNav id={params.id} />
      {b}
    </div></AppShell>
  );

  if (err) return wrap(<div className="alert alert-warning" role="alert">{err}</div>);
  if (!data) return wrap(<div className="text-center py-4"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div>);
  if (!data.has_baseline) {
    return wrap(<div className="alert alert-info" role="status">
      <i className="bi bi-info-circle me-1" />{data.message || "No earlier completed audit for this domain yet."}
    </div>);
  }

  const delta = data.overall_delta ?? 0;
  const pages = data.pages || [];
  const newIssues = data.new_issues || [];
  const resolvedIssues = data.resolved_issues || [];
  const coveragePct = data.pages_total ? Math.round(100 * (data.pages_analysed || 0) / data.pages_total) : 0;

  return wrap(
    <>
      <p className="gx-muted small">
        Comparing <b>{fmt(data.from_audit!.date)}</b> ({data.from_audit!.score ?? "—"}) against{" "}
        <b>{fmt(data.to_audit!.date)}</b> ({data.to_audit!.score ?? "—"}) — this audit&rsquo;s most recent prior run.
      </p>
      {/* A diff's job is to say which way things went. The four figures were
          all rendered in the same weight and colour, so "+3 new issues" and
          "−3 resolved" read identically until you parsed the label. */}
      <div className="gx-stats">
        {[
          ["Overall change", `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`,
            `${data.from_audit!.score ?? "—"} → ${data.to_audit!.score ?? "—"}`,
            delta > 0 ? "var(--gx-band-A)" : delta < 0 ? "var(--gx-band-E)" : undefined],
          ["New issues", `${newIssues.length}`, "not present last run",
            newIssues.length ? "var(--gx-band-E)" : undefined],
          ["Resolved", `${resolvedIssues.length}`, "fixes confirmed",
            resolvedIssues.length ? "var(--gx-band-A)" : undefined],
          ["Coverage", `${coveragePct}%`, `${data.pages_analysed ?? 0} of ${data.pages_total ?? 0} pages recrawled`,
            undefined],
        ].map(([l, v, note, colour]) => (
          <div className="gx-stat" key={l as string}>
            <div className="gx-label">{l as string}</div>
            <div className="gx-stat-value" style={colour ? { color: colour as string } : undefined}>{v as string}</div>
            <div className="gx-stat-note">{note as string}</div>
          </div>
        ))}
      </div>

      {(newIssues.length > 0 || resolvedIssues.length > 0) && (
        <div className="row g-3 mb-3">
          {newIssues.length > 0 && (
            <div className="col-md-6"><div className="gx-card h-100">
              <div className="gx-card-head">
                <h2 style={{ color: "var(--gx-band-E)" }}>
                  <i className="bi bi-plus-circle me-1" aria-hidden="true" />New issues
                </h2>
                <span className="gx-muted ms-auto gx-num">{newIssues.length}</span>
              </div>
              <ul className="list-group list-group-flush">
                {newIssues.map(i => (
                  <li key={i.guideline_id} className="list-group-item small">
                    <span className="gx-chip me-2">{i.guideline_id}</span>{i.title || "—"}
                  </li>
                ))}
              </ul>
            </div></div>
          )}
          {resolvedIssues.length > 0 && (
            <div className="col-md-6"><div className="gx-card h-100">
              <div className="gx-card-head">
                <h2 style={{ color: "var(--gx-band-A)" }}>
                  <i className="bi bi-check-circle me-1" aria-hidden="true" />Resolved
                </h2>
                <span className="gx-muted ms-auto gx-num">{resolvedIssues.length}</span>
              </div>
              <ul className="list-group list-group-flush">
                {resolvedIssues.map(i => (
                  <li key={i.guideline_id} className="list-group-item small">
                    <span className="gx-chip me-2">{i.guideline_id}</span>{i.title || "—"}
                  </li>
                ))}
              </ul>
            </div></div>
          )}
        </div>
      )}

      <div className="gx-card">
        <div className="gx-card-head">
          <h2>Page-wise coverage</h2>
          <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>
            A page missing from the newer run keeps its earlier score, marked not recrawled
          </span>
        </div>
        <div className="table-responsive"><table className="gx-table gx-responsive">
          <thead><tr><th>Page</th><th>Status</th><th>Score</th><th>Change</th></tr></thead>
          <tbody>
            {pages.length === 0 && (
              <tr><td colSpan={4} className="gx-muted text-center py-5">No page-level data captured for either run.</td></tr>
            )}
            {pages.map(p => (
              <tr key={p.url}>
                <td data-label="Page" className="gx-cell-primary">
                  {p.url}{p.new_page && <span className="badge text-bg-info-subtle ms-2">new</span>}
                </td>
                <td data-label="Status"><span className="gx-chip">{statusLabel(p.status)}</span></td>
                <td data-label="Score" className="fw-bold gx-num">{p.score ?? "—"}</td>
                <td data-label="Change" className="gx-num fw-semibold"
                  style={{ color: p.delta == null ? "var(--gx-text-muted)"
                    : p.delta > 0 ? "var(--gx-band-A)" : p.delta < 0 ? "var(--gx-band-E)" : "var(--gx-text-muted)" }}>
                  {p.delta == null ? "—" : (
                    <>
                      <i className={`bi ${p.delta > 0 ? "bi-arrow-up" : p.delta < 0 ? "bi-arrow-down" : "bi-dash"} me-1`}
                        aria-hidden="true" />
                      {Math.abs(p.delta).toFixed(0)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
