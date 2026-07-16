"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const bandBg: Record<string, string> = { A: "#198754", B: "#15803d", C: "#b45309", D: "#c2410c", E: "#b91c1c" };

export default function League() {
  const [cat, setCat] = useState("transactional");
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [pub, setPub] = useState<"internal" | "public">("internal");
  useEffect(() => {
    setRows(null); setErr("");
    api.rankings(cat).then(r => setRows(r.ranking || [])).catch(e => { setErr(e?.message || "Could not load rankings."); setRows([]); });
  }, [cat]);

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Benchmarking league table</h1>
        <p className="text-secondary small">Ranked like-for-like within a segment — never one flat national list.</p>

        <div className="card shadow-sm mb-3"><div className="card-body d-flex gap-3 flex-wrap align-items-end">
          <div>
            <label className="form-label fw-semibold small">Service category</label>
            <select className="form-select form-select-sm" value={cat} onChange={e => setCat(e.target.value)}>
              <option value="transactional">Transactional</option>
              <option value="information">Information</option>
              <option value="payments">Payments</option>
            </select>
          </div>
          <div className="alert alert-light border small mb-0 ms-auto">
            ⚖️ Ranking <b>{cat}</b> — {rows?.length ?? 0} peers. Segmentation prevents unfair comparison.
          </div>
        </div></div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="row g-3">
          <div className="col-lg-8"><div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">Ranking — {cat}</div>
            <div className="table-responsive"><table className="table table-hover align-middle mb-0 gx-responsive">
              <thead className="table-light"><tr><th>#</th><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
              <tbody>
                {rows == null && <tr><td colSpan={4} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" role="status" aria-label="Loading" /></td></tr>}
                {rows?.length === 0 && !err && <tr><td colSpan={4} className="text-secondary text-center py-4">No audited domains in this segment yet.</td></tr>}
                {(rows || []).map((r, i) => (
                <tr key={r.url}><td data-label="Rank">{i + 1}</td>
                  <td data-label="Domain" className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{r.url}</td>
                  <td data-label="Score" className="fw-bold">{r.score ?? "—"}</td>
                  <td data-label="Band">{r.band
                    ? <span className="badge" style={{ background: bandBg[r.band] + "22", color: bandBg[r.band] }}>{r.band}</span>
                    : <span className="text-secondary">—</span>}</td></tr>
              ))}</tbody>
            </table></div>
          </div></div>

          <div className="col-lg-4">
            <div className="card shadow-sm mb-3"><div className="card-body">
              <div className="d-flex align-items-center mb-2"><h2 className="h6 mb-0">Publishing</h2>
                <span className="badge text-bg-primary-subtle ms-auto">Governance-gated</span></div>
              <div className="btn-group w-100 mb-2">
                <button className={`btn btn-sm ${pub === "internal" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setPub("internal")}>🔒 Internal</button>
                <button className={`btn btn-sm ${pub === "public" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setPub("public")}>🌐 Public (opt-in)</button>
              </div>
              <p className="text-secondary small mb-0">
                Rankings default to the internal steward view. Public publication is a MeitY policy decision — GSA/EU precedent.
              </p>
            </div></div>
            <div className="card shadow-sm bg-light"><div className="card-body">
              <h2 className="h6">Anti-gaming safeguards</h2>
              <ul className="small text-secondary mb-0 ps-3">
                <li>Guard-rails cap the band on critical failures</li>
                <li>Versioned, reproducible scores</li>
                <li>Periodic expert &ldquo;audit of the auditor&rdquo;</li>
                <li>Methodology &amp; date published with any ranking</li>
              </ul>
            </div></div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
