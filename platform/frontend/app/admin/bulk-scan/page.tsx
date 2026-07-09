"use client";
import { useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

export default function BulkScan() {
  const [scope, setScope] = useState("never_audited");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function enqueue() {
    setBusy(true);
    try { setResult(await api.bulkScan(scope)); } catch (e: any) { alert(e.message); }
    setBusy(false);
  }

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Bulk scan &amp; estate discovery</h1>
        <p className="text-secondary small">Scan the whole estate, not one site at a time. Each domain is enqueued as an independent task.</p>

        <div className="row g-3">
          <div className="col-lg-6"><div className="card shadow-sm"><div className="card-body">
            <h2 className="h6">Start a bulk scan</h2>
            <div className="btn-group mb-3">
              <button className="btn btn-outline-secondary active">🗂️ Auto-discover register</button>
              <button className="btn btn-outline-secondary">📄 Upload CSV</button>
            </div>
            <label className="form-label fw-semibold">Scope</label>
            <select className="form-select mb-3" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="never_audited">All never-audited domains</option>
              <option value="all">Entire register</option>
            </select>
            <div className="alert alert-light border small">
              ⚙️ Enqueued to <code>Redis Streams</code> · consumed by the polyglot worker fleet · idempotent · polite per-domain rate limits.
            </div>
            <button className="btn btn-primary w-100" onClick={enqueue} disabled={busy}>
              {busy ? "Enqueuing…" : "▶ Enqueue bulk scan"}</button>
          </div></div></div>

          <div className="col-lg-6"><div className="card shadow-sm h-100"><div className="card-body">
            <h2 className="h6">Batch status</h2>
            {result ? (
              <div className="alert alert-success">
                Batch <b>{result.batch_id?.slice(0, 8)}</b> — <b>{result.enqueued}</b> domains enqueued.
                Each becomes an independent task processed in the background.
              </div>
            ) : (
              <div className="text-secondary small">Submit a bulk scan to enqueue the estate. Task IDs and progress will appear here.</div>
            )}
            <div className="progress mt-3" role="progressbar"><div className="progress-bar" style={{ width: "38%" }}>38%</div></div>
            <div className="d-flex justify-content-between mt-2 small text-secondary">
              <span>517 / 1,360 done</span><span>~2h 10m left</span>
            </div>
          </div></div></div>
        </div>
      </div>
    </AppShell>
  );
}
