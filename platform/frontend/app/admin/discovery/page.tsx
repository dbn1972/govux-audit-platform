"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";

// Estate auto-discovery (gap G2): parse a sitemap / robots / page for
// .gov.in/.nic.in hosts we don't yet know about.
export default function Discovery() {
  const [rows, setRows] = useState<any[]>([]);
  const [seed, setSeed] = useState("https://www.india.gov.in/robots.txt");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");

  async function load() {
    try { setRows(await api.discovered()); } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function scan() {
    try {
      const r = await api.discoveryScan([{ seed, body, kind: "auto" }]);
      setResult(r); await load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <AppShell>
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Estate auto-discovery</h1>
            <div className="gx-muted">Find government sites nobody registered — paste a sitemap, robots.txt or page source and
          we extract every <code>.gov.in</code> / <code>.nic.in</code> host.</div>
          </div>
        </div>
        {err && <div className="alert alert-warning py-2">{err}</div>}

        <div className="gx-card">
          <div className="gx-card-head"><h2>Scan a source</h2></div>
          <div className="gx-card-body">
            {/* labelled properly: these two inputs had no `for`, so a screen
                reader announced an unnamed text box and an unnamed textarea */}
            <label className="form-label" htmlFor="disc-seed">Source URL (for the record)</label>
            <input id="disc-seed" className="form-control mb-3" value={seed}
              onChange={e => setSeed(e.target.value)} placeholder="https://example.gov.in/sitemap.xml" />
            <label className="form-label" htmlFor="disc-body">Fetched content</label>
            <textarea id="disc-body" className="form-control font-monospace" rows={5} value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Sitemap: https://example.gov.in/sitemap.xml" />
            <div className="form-text mb-3">Sitemap XML, robots.txt or page source — anything containing links.</div>
            <button className="btn btn-primary" onClick={scan} disabled={!body.trim()}>
              <i className="bi bi-search me-1" aria-hidden="true" />Scan for gov domains
            </button>
            {result && (
              <div className="alert alert-info mt-3 mb-0 py-2 small" role="status">
                Found {result.total_found} host{result.total_found === 1 ? "" : "s"},
                {" "}{result.new} new. New hosts appear below and can be imported into the register.
              </div>
            )}
          </div>
        </div>

        <div className="gx-card"><div className="table-responsive"><table className="gx-table gx-responsive">
          <thead><tr><th>Discovered host</th><th>Source</th><th>Imported</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i}>
                <td data-label="Discovered host" className="gx-cell-primary">{d.url}</td>
                <td data-label="Source"><span className="gx-chip">{d.source}</span></td>
                <td data-label="Imported">
                  {d.imported
                    ? <span className="gx-pill gx-pill-ok">imported</span>
                    : <span className="gx-pill gx-pill-off">not imported</span>}
                </td>
                <td data-label="When" className="small gx-muted">{relative(d.discovered_at)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} className="gx-muted text-center py-5">
                Nothing discovered yet. Paste a sitemap or robots.txt above to find
                hosts nobody has registered.
              </td></tr>
            )}
          </tbody>
        </table></div></div>
      </div>
    </AppShell>
  );
}
