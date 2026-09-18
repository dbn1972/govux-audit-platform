"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";

// Document (PDF/Office) accessibility results (gap G3).
export default function Documents({ params }: { params: { id: string } }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.auditDocuments(params.id).then(r => setDocs(r.documents || []))
      .catch(e => setErr(e?.message || "Could not load document results."));
  }, [params.id]);

  // A green "yes" and a red "no" carry the verdict in colour alone; the pill
  // says which way it went in words too (WCAG 1.4.1), and "not checked" is kept
  // distinct from "failed" — a document we could not open is not a failing one.
  const yn = (v: boolean | null) => v === null || v === undefined
    ? <span className="gx-pill gx-pill-off">not checked</span>
    : v ? <span className="gx-pill gx-pill-ok">yes</span>
        : <span className="gx-pill gx-pill-bad">no</span>;

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="ux4g-mb-2xs">Document accessibility</h1>
            <div className="gx-muted">
              Government runs on PDFs. Each linked document is checked for a tagged structure, a
              title and a declared language — the PDF/UA basics a screen reader depends on.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}
        <div className="gx-card">
          <div className="gx-card-head">
            <h2>Linked documents</h2>
            <span className="gx-muted ux4g-ml-auto" style={{ fontSize: ".8125rem" }}>
              {docs.length} document{docs.length === 1 ? "" : "s"} · tagged structure, title and
              language are the three PDF/UA basics
            </span>
          </div>
          <div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead><tr>
              <th>Document</th><th>Type</th><th>Pages</th><th>Tagged</th>
              <th>Title</th><th>Language</th><th>Score</th><th>Issues</th>
            </tr></thead>
            <tbody>
              {docs.map((d, i) => (
                <tr key={i}>
                  <td data-label="Document" className="ux4g-line-clamp-1 gx-cell-primary" style={{ maxWidth: 320 }}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">{d.url}
                      <Icon name="box-arrow-up-right" size={12} className="ux4g-ml-2xs" />
                      <span className="ux4g-sr-only"> (opens in a new tab)</span>
                    </a></td>
                  <td data-label="Type"><span className="gx-chip">{d.type}</span></td>
                  <td data-label="Pages" className="gx-num">{d.pages ?? "—"}</td>
                  <td data-label="Tagged">{yn(d.tagged)}</td>
                  <td data-label="Title">{yn(d.has_title)}</td>
                  <td data-label="Language">{yn(d.has_lang)}</td>
                  <td data-label="Score" className="ux4g-fw-semibold gx-num">{d.score ?? "—"}</td>
                  <td data-label="Issues" className="gx-num">{d.issues}</td>
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={8} className="gx-muted ux4g-text-center ux4g-py-l">
                No documents were discovered in this audit.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
