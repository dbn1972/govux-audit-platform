"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
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
            <h1 className="mb-1">Document accessibility</h1>
            <div className="gx-muted">
              Government runs on PDFs. Each linked document is checked for a tagged structure, a
              title and a declared language — the PDF/UA basics a screen reader depends on.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="gx-card">
          <div className="gx-card-head">
            <h2>Linked documents</h2>
            <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>
              {docs.length} document{docs.length === 1 ? "" : "s"} · tagged structure, title and
              language are the three PDF/UA basics
            </span>
          </div>
          <div className="table-responsive">
          <table className="gx-table gx-responsive">
            <thead><tr>
              <th>Document</th><th>Type</th><th>Pages</th><th>Tagged</th>
              <th>Title</th><th>Language</th><th>Score</th><th>Issues</th>
            </tr></thead>
            <tbody>
              {docs.map((d, i) => (
                <tr key={i}>
                  <td data-label="Document" className="text-truncate gx-cell-primary" style={{ maxWidth: 320 }}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">{d.url}
                      <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true" style={{ fontSize: ".7em" }} />
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a></td>
                  <td data-label="Type"><span className="gx-chip">{d.type}</span></td>
                  <td data-label="Pages" className="gx-num">{d.pages ?? "—"}</td>
                  <td data-label="Tagged">{yn(d.tagged)}</td>
                  <td data-label="Title">{yn(d.has_title)}</td>
                  <td data-label="Language">{yn(d.has_lang)}</td>
                  <td data-label="Score" className="fw-semibold gx-num">{d.score ?? "—"}</td>
                  <td data-label="Issues" className="gx-num">{d.issues}</td>
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={8} className="gx-muted text-center py-5">
                No documents were discovered in this audit.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
