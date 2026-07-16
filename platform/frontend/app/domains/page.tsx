"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};

const bandColor: Record<string, string> = { A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c" };
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

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
            <table className="table table-hover align-middle mb-0 gx-responsive">
              <thead className="table-light"><tr><th>Domain</th><th>Category</th><th>Status</th><th>Latest score</th><th>Last audited</th><th></th></tr></thead>
              <tbody>
                {rows == null && (
                  <tr><td colSpan={6} className="text-center py-4">
                    <span className="spinner-border spinner-border-sm text-primary me-2" />Loading…
                  </td></tr>
                )}
                {rows?.length === 0 && !err && (
                  <tr><td colSpan={6} className="text-secondary text-center py-4">
                    No domains yet. <Link href="/domains/new">Register your first domain →</Link>
                  </td></tr>
                )}
                {(rows || []).map(d => (
                  <tr key={d.id}>
                    <td data-label="Domain" className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{d.url}</td>
                    <td data-label="Category" className="text-secondary small">{d.category || "—"}</td>
                    <td data-label="Status">{d.verify_status === "verified"
                      ? <span className="badge text-bg-success-subtle text-success">Verified</span>
                      : <span className="badge text-bg-warning-subtle">Pending</span>}</td>
                    <td data-label="Latest score">{d.latest_score != null
                      ? <><b>{d.latest_score}</b>{d.latest_band &&
                          <span className="badge ms-1" style={{ background: (bandColor[d.latest_band] || "#5c636a") + "22", color: bandColor[d.latest_band] || "#5c636a" }}>{d.latest_band}</span>}</>
                      : <span className="text-secondary">Not audited</span>}</td>
                    <td data-label="Last audited" className="text-secondary small">{fmtDate(d.last_audited_at)}</td>
                    <td data-label="">{d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="btn btn-sm btn-link">Audit →</Link>
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
