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
    <AppShell><div className="gx-page gx-stack">
      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mb-1">Larger-crawl approvals</h1>
          <div className="gx-muted">
            Domain owners may audit up to the free page limit; deeper crawls need a steward’s approval.
          </div>
        </div>
        {/* the queue depth is the reason to be on this screen, so it belongs in
            the head rather than trailing the explanation as a sentence */}
        {/* shown at zero as well: "0 pending" is the answer to the question a
            steward opens this screen with, and colour carries the state */}
        {rows != null && (
          <div className="gx-actions">
            <span className={`gx-pill ${pending > 0 ? "gx-pill-wait" : "gx-pill-ok"}`}>
              {pending} pending
            </span>
          </div>
        )}
      </div>
      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      <div className="gx-card">
        <div className="table-responsive">
          <table className="gx-table gx-responsive">
            <thead>
              <tr><th>Requested by</th><th>Domain</th><th>Pages</th><th>Reason</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={6} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && !err && (
                <tr><td colSpan={6} className="gx-muted text-center py-5">No crawl requests yet.</td></tr>
              )}
              {(rows || []).map((r) => (
                <tr key={r.id}>
                  <td data-label="Requested by" className="small">{r.user_email || "—"}</td>
                  <td data-label="Domain" className="fw-semibold">{r.domain_url || "—"}</td>
                  <td data-label="Pages"><b>{r.requested_pages}</b></td>
                  <td data-label="Reason" className="gx-muted small">{r.reason || "—"}</td>
                  <td data-label="Status"><span className={`badge ${statusBadge[r.status] || "text-bg-light"}`}>{r.status}</span></td>
                  <td data-label="">
                    {r.status === "pending" ? (
                      <div className="d-flex gap-1 justify-content-end">
                        <button className="btn btn-sm btn-outline-success" disabled={busy === r.id}
                          onClick={() => decide(r.id, "approved")}>Approve</button>
                        <button className="btn btn-sm btn-outline-danger" disabled={busy === r.id}
                          onClick={() => decide(r.id, "rejected")}>Reject</button>
                      </div>
                    ) : <span className="gx-muted small">decided</span>}
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
