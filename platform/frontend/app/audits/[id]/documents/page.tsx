"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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
      <div className="container-fluid p-4">
        <h1 className="h3" style={{ color: "var(--ux-navy)" }}>Document accessibility</h1>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <p className="text-secondary small">
          Government runs on PDFs. Each linked document is checked for a tagged structure, a title and
          a declared language (PDF/UA basics).
        </p>
        <div className="card shadow-sm"><div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light"><tr>
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
