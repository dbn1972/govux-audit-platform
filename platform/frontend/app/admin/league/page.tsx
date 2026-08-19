"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

import { BAND_COLOR as bandBg, bandStyle } from "@/lib/score";

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
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Benchmarking league table</h1>
            <div className="gx-muted">Ranked like-for-like within a segment — never one flat national list.</div>
          </div>
          <div className="gx-actions align-items-end">
            <div>
              <label className="form-label" htmlFor="league-category">Service category</label>
              <select id="league-category" className="form-select" style={{ minWidth: 190 }} value={cat}
                onChange={e => setCat(e.target.value)}>
                <option value="transactional">Transactional</option>
                <option value="information">Information</option>
                <option value="payments">Payments</option>
              </select>
            </div>
          </div>
        </div>

        <div className="gx-callout" style={{ background: "var(--gx-surface-muted)",
          borderColor: "var(--gx-border)", color: "var(--gx-ink-700)" }}>
          <i className="bi bi-diagram-3" aria-hidden="true" />
          <div>
            Ranking <b>{cat}</b> services against {rows?.length ?? 0} peer{rows?.length === 1 ? "" : "s"}.
            Comparing a payments portal with an information site would flatter one and punish the
            other, so segments are ranked separately.
          </div>
        </div>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="row g-3">
          <div className="col-lg-8"><div className="gx-card">
            <div className="gx-card-head"><h2>Ranking — {cat}</h2></div>
            <div className="table-responsive"><table className="gx-table gx-responsive">
              <thead><tr><th>#</th><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
              <tbody>
                {rows == null && <tr><td colSpan={4} className="text-center py-4"><span className="spinner-border spinner-border-sm text-primary" role="status" aria-label="Loading" /></td></tr>}
                {rows?.length === 0 && !err && <tr><td colSpan={4} className="gx-muted text-center py-5">No audited domains in this segment yet.</td></tr>}
                {(rows || []).map((r, i) => (
                <tr key={r.url}><td data-label="Rank" className="gx-num gx-muted">{i + 1}</td>
                  <td data-label="Domain" className="gx-cell-primary">{r.url}</td>
                  <td data-label="Score" className="gx-num fw-bold">{r.score ?? "—"}</td>
                  <td data-label="Band">{r.band
                    ? <span className="badge" style={bandStyle(r.band)}>{r.band}</span>
                    : <span className="text-secondary">—</span>}</td></tr>
              ))}</tbody>
            </table></div>
          </div></div>

          <div className="col-lg-4">
            <div className="gx-card mb-3"><div className="gx-card-body">
              <div className="d-flex align-items-center mb-2"><h2 className="h6 mb-0">Publishing</h2>
                <span className="badge text-bg-primary-subtle ms-auto">Governance-gated</span></div>
              <div className="btn-group w-100 mb-2">
                <button className={`btn btn-sm ${pub === "internal" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setPub("internal")}>
                  <i className="bi bi-lock me-1" aria-hidden="true" />Internal</button>
                <button className={`btn btn-sm ${pub === "public" ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setPub("public")}>
                  <i className="bi bi-globe2 me-1" aria-hidden="true" />Public (opt-in)</button>
              </div>
              <p className="text-secondary small mb-0">
                Rankings default to the internal steward view. Public publication is a MeitY policy decision — GSA/EU precedent.
              </p>
            </div></div>
            <div className="gx-card" style={{ background: "var(--gx-surface-muted)" }}><div className="gx-card-body">
              <h2 className="h6">Anti-gaming safeguards</h2>
              <ul className="small gx-muted mb-0 ps-3">
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
