"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Domain = { id: string; url: string; verify_status: string; category?: string | null };

export default function Domains() {
  const [rows, setRows] = useState<Domain[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.listDomains()
      .then((d) => setRows(d || []))
      .catch((e) => { setErr(e?.message || "Could not load your domains."); setRows([]); });
  }, []);
  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
        <div className="d-flex align-items-center mb-3">
          <h1 className="h3 mb-0">My domains</h1>
          <Link href="/domains/new" className="btn btn-primary ms-auto">＋ Add domain</Link>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light"><tr><th>Domain</th><th>Category</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows == null && (
                  <tr><td colSpan={4} className="text-center py-4">
                    <span className="spinner-border spinner-border-sm text-primary me-2" />Loading…
                  </td></tr>
                )}
                {rows?.length === 0 && !err && (
                  <tr><td colSpan={4} className="text-secondary text-center py-4">
                    No domains yet. <Link href="/domains/new">Register your first domain →</Link>
                  </td></tr>
                )}
                {(rows || []).map(d => (
                  <tr key={d.id}>
                    <td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{d.url}</td>
                    <td className="text-secondary small">{d.category}</td>
                    <td>{d.verify_status === "verified"
                      ? <span className="badge text-bg-success-subtle text-success">Verified</span>
                      : <span className="badge text-bg-warning-subtle">Pending</span>}</td>
                    <td>{d.verify_status === "verified"
                      ? <Link href="/audits/new" className="btn btn-sm btn-link">Audit →</Link>
                      : <Link href="/domains/new" className="btn btn-sm btn-link">Verify →</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
