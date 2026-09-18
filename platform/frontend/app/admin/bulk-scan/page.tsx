"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
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
            <h1 className="ux4g-mb-2xs">Bulk scan &amp; estate discovery</h1>
            <div className="gx-muted">Scan the whole estate, not one site at a time. Each domain is enqueued as an independent task.</div>
          </div>
        </div>

        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-6"><div className="gx-card"><div className="gx-card-body">
            <h2 className="ux4g-heading-2xs-strong">Start a bulk scan</h2>
            <label className="ux4g-label-m-default" htmlFor="scope">Scope</label>
            <select id="scope" className="ux4g-form-select ux4g-form-select-md ux4g-mb-s" value={scope}
              onChange={e => setScope(e.target.value)}>
              <option value="never_audited">All never-audited domains</option>
              <option value="all">Entire register</option>
            </select>
            <div className="ux4g-alert ux4g-alert-info ux4g-b-1 ux4g-fs-14">
              <Icon name="info-circle" size={16} className="ux4g-mr-2xs" />
              Each domain is queued as its own audit and crawled at a polite rate, so a large
              estate takes hours rather than minutes. Re-running is safe — a domain already
              queued is not scanned twice.
            </div>
            {err && <div className="ux4g-alert ux4g-alert-warning ux4g-py-xs ux4g-fs-14" role="alert">{err}</div>}
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-w-100" onClick={enqueue} disabled={busy}>
              {busy ? "Enqueuing…" : <><Icon name="play-fill" size={16} className="ux4g-mr-2xs" />Enqueue bulk scan</>}</button>
            <span className="ux4g-label-s-default gx-muted ux4g-d-block ux4g-mt-xs">
              Loading domains from a spreadsheet? Use{" "}
              <Link href="/admin/registry">Register Import</Link> instead.
            </span>
          </div></div></div>

          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-6"><div className="gx-card ux4g-h-100"><div className="gx-card-body">
            <h2 className="ux4g-heading-2xs-strong">Batch status</h2>
            {result ? (
              <>
                <div className="ux4g-alert ux4g-alert-success">
                  Batch <b>{result.batch_id?.slice(0, 8)}</b> — <b>{result.enqueued}</b>{" "}
                  domain{result.enqueued === 1 ? "" : "s"} enqueued.
                  Each becomes an independent task processed in the background.
                </div>
                {progress && (
                  <>
                    <article className="ux4g-progress-bar" role="progressbar" aria-label="Batch progress"
                      aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}
                      data-ux-progress-bar data-ux-shape="rounded" data-ux-label-placement="outside">
                      <div className="ux4g-progress-bar-track"><div className="ux4g-progress-bar-fill" style={{ width: `${progress.percent}%` }} /></div>
                      <span data-ux-progress-label>{progress.percent}%</span>
                    </article>
                    <div className="ux4g-d-flex ux4g-jc-between ux4g-mt-xs ux4g-fs-14 gx-muted">
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
                <p className="ux4g-fs-14 gx-muted ux4g-mt-xs ux4g-mb-none">
                  Each domain is a separate audit — open them in{" "}
                  <Link href="/audits">Audit History</Link>.
                </p>
              </>
            ) : (
              <div className="gx-muted ux4g-fs-14">
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
