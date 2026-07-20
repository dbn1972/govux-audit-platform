"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Req = {
  id: string; user_email: string | null; domain_url: string | null;
  requested_pages: number; reason: string | null; status: string; created_at: string;
};

const statusBadge: Record<string, string> = {
  pending: "text-bg-warning-subtle", approved: "text-bg-success-subtle text-success", rejected: "text-bg-danger-subtle text-danger",
};

export default function Approvals() {
  const [rows, setRows] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string>("");

  function load() {
    api.scanRequests()
      .then((d) => setRows(d || []))
      .catch((e: any) => { setErr(e?.message || "Could not load requests."); setRows([]); });
  }
  useEffect(load, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(id); setErr("");
    try {
      await api.decideScanRequest(id, status);
      setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e: any) { setErr(e?.message || "Could not update the request."); }
    finally { setBusy(""); }
  }

  const pending = (rows || []).filter((r) => r.status === "pending").length;

  return (
    <AppShell><div className="container-fluid p-4" style={{ maxWidth: 1100 }}>
      <h1 className="h3 mb-0">Larger-crawl approvals</h1>
      <p className="text-secondary small">
        Domain owners may audit up to the free page limit; deeper crawls need a steward’s approval.
        {rows != null && ` ${pending} pending.`}
      </p>
      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 gx-responsive">
            <thead className="table-light">
              <tr><th>Requested by</th><th>Domain</th><th>Pages</th><th>Reason</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={6} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={6} className="text-secondary text-center py-4">No crawl requests yet.</td></tr>
              )}
              {(rows || []).map((r) => (
                <tr key={r.id}>
                  <td data-label="Requested by" className="small">{r.user_email || "—"}</td>
                  <td data-label="Domain" className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{r.domain_url || "—"}</td>
                  <td data-label="Pages"><b>{r.requested_pages}</b></td>
                  <td data-label="Reason" className="text-secondary small">{r.reason || "—"}</td>
                  <td data-label="Status"><span className={`badge ${statusBadge[r.status] || "text-bg-light"}`}>{r.status}</span></td>
                  <td data-label="">
                    {r.status === "pending" ? (
                      <div className="d-flex gap-1 justify-content-end">
                        <button className="btn btn-sm btn-outline-success" disabled={busy === r.id}
                          onClick={() => decide(r.id, "approved")}>Approve</button>
                        <button className="btn btn-sm btn-outline-danger" disabled={busy === r.id}
                          onClick={() => decide(r.id, "rejected")}>Reject</button>
                      </div>
                    ) : <span className="text-secondary small">decided</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div></AppShell>
  );
}
