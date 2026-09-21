"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Spinner from "@/components/Spinner";
import { api } from "@/lib/api";

type Req = {
  id: string; user_email: string | null; domain_url: string | null;
  requested_pages: number; reason: string | null; status: string; created_at: string;
};

const statusBadge: Record<string, string> = {
  pending: "ux4g-tag-tonal-warning ux4g-tag-s", approved: "ux4g-tag-tonal-success ux4g-tag-s", rejected: "ux4g-tag-tonal-error ux4g-tag-s",
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
          <h1 className="ux4g-mb-2xs">Larger-crawl approvals</h1>
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
            <span className={`ux4g-tag-s gx-dot ${pending > 0 ? "ux4g-tag-tonal-warning" : "ux4g-tag-tonal-success"}`}>
              {pending} pending
            </span>
          </div>
        )}
      </div>
      {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

      <div className="ux4g-card ux4g-card-solid ux4g-card-outline">
        <div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead>
              <tr><th>Requested by</th><th>Domain</th><th>Pages</th><th>Reason</th><th>Status</th><th><span className="ux4g-sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows == null && (
                <tr><td colSpan={6} className="ux4g-text-center ux4g-py-m">
                  <Spinner size="sm" className="ux4g-mr-xs" />Loading…
                </td></tr>
              )}
              {rows?.length === 0 && err && (
                  <tr><td colSpan={6} className="gx-muted ux4g-text-center ux4g-py-l">
                    Crawl requests could not be loaded.
                  </td></tr>
                )}
                {rows?.length === 0 && !err && (
                <tr><td colSpan={6} className="gx-muted ux4g-text-center ux4g-py-l">No crawl requests yet.</td></tr>
              )}
              {(rows || []).map((r) => (
                <tr key={r.id}>
                  <td data-label="Requested by" className="ux4g-fs-14">{r.user_email || "—"}</td>
                  <td data-label="Domain" className="ux4g-fw-semibold">{r.domain_url || "—"}</td>
                  <td data-label="Pages"><b>{r.requested_pages}</b></td>
                  <td data-label="Reason" className="gx-muted ux4g-fs-14">{r.reason || "—"}</td>
                  <td data-label="Status"><span className={statusBadge[r.status] || "ux4g-tag-tonal-neutral ux4g-tag-s"}>{r.status}</span></td>
                  <td data-label="">
                    {r.status === "pending" ? (
                      <div className="ux4g-d-flex ux4g-gap-2xs ux4g-jc-end">
                        <button className="ux4g-btn ux4g-btn-primary ux4g-btn-sm" disabled={busy === r.id}
                          onClick={() => decide(r.id, "approved")}>Approve</button>
                        <button className="ux4g-btn ux4g-btn-outline-danger ux4g-btn-sm" disabled={busy === r.id}
                          onClick={() => decide(r.id, "rejected")}>Reject</button>
                      </div>
                    ) : <span className="gx-muted ux4g-fs-14">decided</span>}
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
