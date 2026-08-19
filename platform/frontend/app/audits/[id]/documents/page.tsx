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

  const yn = (v: boolean | null) => v === null || v === undefined
    ? <span className="text-secondary">—</span>
    : v ? <span className="badge text-bg-success">yes</span> : <span className="badge text-bg-danger">no</span>;

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
        <div className="gx-card"><div className="table-responsive">
          <table className="gx-table">
            <thead><tr>
              <th>Document</th><th>Type</th><th>Pages</th><th>Tagged</th>
              <th>Title</th><th>Language</th><th>Score</th><th>Issues</th>
            </tr></thead>
            <tbody>
              {docs.map((d, i) => (
                <tr key={i}>
                  <td className="text-truncate" style={{ maxWidth: 320 }}>
                    <a href={d.url} target="_blank" rel="noreferrer">{d.url}</a></td>
                  <td><span className="badge bg-secondary">{d.type}</span></td>
                  <td>{d.pages ?? "—"}</td>
                  <td>{yn(d.tagged)}</td><td>{yn(d.has_title)}</td><td>{yn(d.has_lang)}</td>
                  <td className="fw-semibold">{d.score ?? "—"}</td>
                  <td>{d.issues}</td>
                </tr>
              ))}
              {!docs.length && <tr><td colSpan={8} className="text-center text-secondary py-4">
                No documents were discovered in this audit.</td></tr>}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
