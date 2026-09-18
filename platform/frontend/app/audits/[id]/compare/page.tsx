"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
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
          <h1 className="ux4g-mb-2xs">Compare &amp; page coverage</h1>
          <div className="gx-muted">
            What changed between two dated snapshots, and which pages the crawl actually reached.
          </div>
        </div>
      </div>
      <AuditNav id={params.id} />
      {b}
    </div></AppShell>
  );

  if (err) return wrap(<div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>);
  if (!data) return wrap(<div className="ux4g-text-center ux4g-py-m"><Spinner size="md" label="Loading" /></div>);
  if (!data.has_baseline) {
    return wrap(<div className="ux4g-alert ux4g-alert-info" role="status">
      <Icon name="info-circle" size={16} className="ux4g-mr-2xs" />{data.message || "No earlier completed audit for this domain yet."}
    </div>);
  }

  const delta = data.overall_delta ?? 0;
  const pages = data.pages || [];
  const newIssues = data.new_issues || [];
  const resolvedIssues = data.resolved_issues || [];
  const coveragePct = data.pages_total ? Math.round(100 * (data.pages_analysed || 0) / data.pages_total) : 0;

  return wrap(
    <>
      <p className="gx-muted ux4g-fs-14">
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
        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s ux4g-mb-s">
          {newIssues.length > 0 && (
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-6"><div className="gx-card ux4g-h-100">
              <div className="gx-card-head">
                <h2 style={{ color: "var(--gx-band-E)" }}>
                  <Icon name="plus-circle" size={20} className="ux4g-mr-2xs" />New issues
                </h2>
                <span className="gx-muted ux4g-ml-auto gx-num">{newIssues.length}</span>
              </div>
              <ul className="ux4g-list ux4g-list-m ux4g-list-default">
                {newIssues.map(i => (
                  <li key={i.guideline_id} className="ux4g-list-item">
                    <div className="ux4g-list-item-row ux4g-fs-14">
                    <span className="gx-chip ux4g-mr-xs">{i.guideline_id}</span>{i.title || "—"}
                    </div>
                  </li>
                ))}
              </ul>
            </div></div>
          )}
          {resolvedIssues.length > 0 && (
            <div className="ux4g-cols-span-12 ux4g-md-cols-span-6"><div className="gx-card ux4g-h-100">
              <div className="gx-card-head">
                <h2 style={{ color: "var(--gx-band-A)" }}>
                  <Icon name="check-circle" size={20} className="ux4g-mr-2xs" />Resolved
                </h2>
                <span className="gx-muted ux4g-ml-auto gx-num">{resolvedIssues.length}</span>
              </div>
              <ul className="ux4g-list ux4g-list-m ux4g-list-default">
                {resolvedIssues.map(i => (
                  <li key={i.guideline_id} className="ux4g-list-item">
                    <div className="ux4g-list-item-row ux4g-fs-14">
                    <span className="gx-chip ux4g-mr-xs">{i.guideline_id}</span>{i.title || "—"}
                    </div>
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
          <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
            A page missing from the newer run keeps its earlier score, marked not recrawled
          </span>
        </div>
        <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m gx-responsive">
          <thead><tr><th>Page</th><th>Status</th><th>Score</th><th>Change</th></tr></thead>
          <tbody>
            {pages.length === 0 && (
              <tr><td colSpan={4} className="gx-muted ux4g-text-center ux4g-py-l">No page-level data captured for either run.</td></tr>
            )}
            {pages.map(p => (
              <tr key={p.url}>
                <td data-label="Page" className="gx-cell-primary">
                  {p.url}{p.new_page && <span className="ux4g-tag-tonal-info ux4g-tag-s ux4g-ml-xs">new</span>}
                </td>
                <td data-label="Status"><span className="gx-chip">{statusLabel(p.status)}</span></td>
                <td data-label="Score" className="ux4g-fw-bold gx-num">{p.score ?? "—"}</td>
                <td data-label="Change" className="gx-num ux4g-fw-semibold"
                  style={{ color: p.delta == null ? "var(--gx-text-muted)"
                    : p.delta > 0 ? "var(--gx-band-A)" : p.delta < 0 ? "var(--gx-band-E)" : "var(--gx-text-muted)" }}>
                  {p.delta == null ? "—" : (
                    <>
                      <Icon name={p.delta > 0 ? "arrow-up" : p.delta < 0 ? "arrow-down" : "dash"} size={16} className="ux4g-mr-2xs" />
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
