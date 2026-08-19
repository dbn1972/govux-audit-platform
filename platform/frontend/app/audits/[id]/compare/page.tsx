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
    <AppShell><div className="gx-page">
      <h1 className="h3">Compare &amp; page coverage</h1>
      <AuditNav id={params.id} />
      <p className="text-secondary small">Diff two dated snapshots + per-page coverage.</p>
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
      <p className="text-secondary small">
        Comparing <b>{fmt(data.from_audit!.date)}</b> ({data.from_audit!.score ?? "—"}) against{" "}
        <b>{fmt(data.to_audit!.date)}</b> ({data.to_audit!.score ?? "—"}) — this audit&rsquo;s most recent prior run.
      </p>
      <div className="row g-3 mb-3">
        {[
          ["Overall change", `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`,
            `${data.from_audit!.score ?? "—"} → ${data.to_audit!.score ?? "—"}`],
          ["New issues", `+${newIssues.length}`, "since last run"],
          ["Resolved", `−${resolvedIssues.length}`, "fixes confirmed"],
          ["Coverage", `${coveragePct}%`, `${data.pages_analysed ?? 0} / ${data.pages_total ?? 0} pages`],
        ].map(([l, v, s]) => (
          <div className="col-6 col-md-3" key={l}><div className="card shadow-sm"><div className="card-body">
            <div className="text-secondary small fw-semibold">{l}</div>
            <div className="fs-4 fw-bold" style={{ color: "var(--ux-navy)" }}>{v}</div>
            <div className="text-secondary small">{s}</div>
          </div></div></div>
        ))}
      </div>

      {(newIssues.length > 0 || resolvedIssues.length > 0) && (
        <div className="row g-3 mb-3">
          {newIssues.length > 0 && (
            <div className="col-md-6"><div className="card shadow-sm h-100">
              <div className="card-header bg-white fw-semibold text-danger">New issues</div>
              <ul className="list-group list-group-flush">
                {newIssues.map(i => (
                  <li key={i.guideline_id} className="list-group-item small">
                    <span className="badge text-bg-light me-2">{i.guideline_id}</span>{i.title || "—"}
                  </li>
                ))}
              </ul>
            </div></div>
          )}
          {resolvedIssues.length > 0 && (
            <div className="col-md-6"><div className="card shadow-sm h-100">
              <div className="card-header bg-white fw-semibold text-success">Resolved issues</div>
              <ul className="list-group list-group-flush">
                {resolvedIssues.map(i => (
                  <li key={i.guideline_id} className="list-group-item small">
                    <span className="badge text-bg-light me-2">{i.guideline_id}</span>{i.title || "—"}
                  </li>
                ))}
              </ul>
            </div></div>
          )}
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-header bg-white fw-semibold">Page-wise coverage</div>
        <div className="table-responsive"><table className="gx-table">
          <thead><tr><th>Page</th><th>Status</th><th>Score</th><th>Δ</th></tr></thead>
          <tbody>
            {pages.length === 0 && (
              <tr><td colSpan={4} className="text-secondary text-center py-4">No page-level data captured for either run.</td></tr>
            )}
            {pages.map(p => (
              <tr key={p.url}>
                <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>
                  {p.url}{p.new_page && <span className="badge text-bg-info-subtle ms-2">new</span>}
                </td>
                <td><span className="badge text-bg-light">{statusLabel(p.status)}</span></td>
                <td className="fw-bold">{p.score ?? "—"}</td>
                <td className={`small ${p.delta == null ? "text-secondary" : p.delta >= 0 ? "text-success" : "text-danger"}`}>
                  {p.delta == null ? "—" : `${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(0)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
