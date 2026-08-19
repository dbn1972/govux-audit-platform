"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

export default function BulkScan() {
  const [scope, setScope] = useState("never_audited");
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const poll = useRef<any>(null);

  useEffect(() => () => clearInterval(poll.current), []);

  async function enqueue() {
    setBusy(true); setErr(""); setResult(null); setProgress(null);
    clearInterval(poll.current);
    // inline error like every other screen — this used to be a bare alert()
    try {
      const r = await api.bulkScan(scope);
      setResult(r);
      // Poll the real batch endpoint. This screen used to draw a hardcoded
      // "38% · 517 / 1,360 done · ~2h 10m left" bar with nothing behind it.
      const tick = async () => {
        try {
          const p = await api.bulkScanStatus(r.batch_id);
          setProgress(p);
          if (p.finished) clearInterval(poll.current);
        } catch { clearInterval(poll.current); }   // stop rather than spin on an error
      };
      await tick();
      poll.current = setInterval(tick, 5000);
    }
    catch (e: any) { setErr(e?.message || "Could not enqueue the bulk scan."); }
    finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Bulk scan &amp; estate discovery</h1>
            <div className="gx-muted">Scan the whole estate, not one site at a time. Each domain is enqueued as an independent task.</div>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-lg-6"><div className="gx-card"><div className="gx-card-body">
            <h2 className="h6">Start a bulk scan</h2>
            <label className="form-label" htmlFor="scope">Scope</label>
            <select id="scope" className="form-select mb-3" value={scope}
              onChange={e => setScope(e.target.value)}>
              <option value="never_audited">All never-audited domains</option>
              <option value="all">Entire register</option>
            </select>
            <div className="alert alert-light border small">
              <i className="bi bi-info-circle me-1" aria-hidden="true" />
              Each domain is queued as its own audit and crawled at a polite rate, so a large
              estate takes hours rather than minutes. Re-running is safe — a domain already
              queued is not scanned twice.
            </div>
            {err && <div className="alert alert-warning py-2 small" role="alert">{err}</div>}
            <button className="btn btn-primary w-100" onClick={enqueue} disabled={busy}>
              {busy ? "Enqueuing…" : <><i className="bi bi-play-fill me-1" aria-hidden="true" />Enqueue bulk scan</>}</button>
            <div className="form-text mt-2">
              Loading domains from a spreadsheet? Use{" "}
              <Link href="/admin/registry">Register Import</Link> instead.
            </div>
          </div></div></div>

          <div className="col-lg-6"><div className="gx-card h-100"><div className="gx-card-body">
            <h2 className="h6">Batch status</h2>
            {result ? (
              <>
                <div className="alert alert-success">
                  Batch <b>{result.batch_id?.slice(0, 8)}</b> — <b>{result.enqueued}</b>{" "}
                  domain{result.enqueued === 1 ? "" : "s"} enqueued.
                  Each becomes an independent task processed in the background.
                </div>
                {progress && (
                  <>
                    <div className="progress" role="progressbar"
                      aria-label="Batch progress"
                      aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`progress-bar${progress.finished ? "" : " progress-bar-striped progress-bar-animated"}`}
                        style={{ width: `${progress.percent}%` }}>{progress.percent}%</div>
                    </div>
                    <div className="d-flex justify-content-between mt-2 small gx-muted">
                      <span>{progress.done} / {progress.total} done</span>
                      <span>
                        {progress.finished
                          ? `${progress.scored} scored · ${progress.no_result} without a score`
                          : `${progress.running} running · ${progress.queued} queued`}
                      </span>
                    </div>
                    {/* No time estimate: audit duration varies with crawl depth and
                        the target's own speed, so any "~2h 10m left" would be a
                        guess dressed as a measurement — which is what this screen
                        used to show. */}
                  </>
                )}
                <p className="small gx-muted mt-2 mb-0">
                  Each domain is a separate audit — open them in{" "}
                  <Link href="/audits">Audit History</Link>.
                </p>
              </>
            ) : (
              <div className="gx-muted small">
                Submit a bulk scan to enqueue the estate. The batch reference and the number of
                domains queued will appear here.
              </div>
            )}
          </div></div></div>
        </div>
      </div>
    </AppShell>
  );
}
