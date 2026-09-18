"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
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
            <h1 className="ux4g-mb-2xs">Estate auto-discovery</h1>
            <div className="gx-muted">Find government sites nobody registered — paste a sitemap, robots.txt or page source and
          we extract every <code>.gov.in</code> / <code>.nic.in</code> host.</div>
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning ux4g-py-xs">{err}</div>}

        <div className="gx-card">
          <div className="gx-card-head"><h2>Scan a source</h2></div>
          <div className="gx-card-body">
            {/* labelled properly: these two inputs had no `for`, so a screen
                reader announced an unnamed text box and an unnamed textarea */}
            <div className="ux4g-input-container ux4g-input-md ux4g-input-default ux4g-w-100 ux4g-mb-s">
              <label className="ux4g-label-m-default" htmlFor="disc-seed">Source URL (for the record)</label>
              <div className="ux4g-input">
                <input id="disc-seed" className="ux4g-input-input" value={seed}
                  onChange={e => setSeed(e.target.value)} placeholder="https://example.gov.in/sitemap.xml" />
              </div>
            </div>
            <div className="ux4g-textarea-container ux4g-textarea-md ux4g-w-100 ux4g-mb-s">
              <label className="ux4g-label-m-default" htmlFor="disc-body">Fetched content</label>
              <div className="ux4g-textarea">
                <textarea id="disc-body" className="ux4g-textarea-input font-monospace" rows={5} value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Sitemap: https://example.gov.in/sitemap.xml" />
              </div>
              <div className="ux4g-input-helper">
                <span className="ux4g-input-helper-text">Sitemap XML, robots.txt or page source — anything containing links.</span>
              </div>
            </div>
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" onClick={scan} disabled={!body.trim()}>
              <Icon name="search" size={16} className="ux4g-mr-2xs" />Scan for gov domains
            </button>
            {result && (
              <div className="ux4g-alert ux4g-alert-info ux4g-mt-s ux4g-mb-none ux4g-py-xs small" role="status">
                Found {result.total_found} host{result.total_found === 1 ? "" : "s"},
                {" "}{result.new} new. New hosts appear below and can be imported into the register.
              </div>
            )}
          </div>
        </div>

        <div className="gx-card"><div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m gx-responsive">
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
              <tr><td colSpan={4} className="gx-muted ux4g-text-center ux4g-py-l">
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
