"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

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

        <div className="card shadow-sm mb-3"><div className="card-body">
          <label className="form-label small">Source URL (for the record)</label>
          <input className="form-control mb-2" value={seed} onChange={e => setSeed(e.target.value)} />
          <label className="form-label small">Fetched content (sitemap XML / robots.txt / HTML)</label>
          <textarea className="form-control font-monospace" rows={5} value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Sitemap: https://example.gov.in/sitemap.xml" />
          <button className="btn btn-primary mt-2" onClick={scan}>
            <i className="bi bi-search me-1" /> Scan for gov domains
          </button>
          {result && <div className="alert alert-info mt-2 mb-0 py-2 small">
            Found {result.total_found} host(s), {result.new} new.
          </div>}
        </div></div>

        <div className="card shadow-sm"><div className="table-responsive"><table className="table mb-0">
          <thead><tr><th>Discovered host</th><th>Source</th><th>Imported</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((d, i) => (
              <tr key={i}>
                <td>{d.url}</td>
                <td><span className="badge bg-secondary">{d.source}</span></td>
                <td>{d.imported ? <span className="badge bg-success">yes</span> : <span className="text-secondary">no</span>}</td>
                <td className="small text-secondary">{d.discovered_at?.slice(0, 10)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="text-secondary text-center py-4">Nothing discovered yet.</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </AppShell>
  );
}
