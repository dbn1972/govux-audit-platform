"use client";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Spinner from "@/components/Spinner";
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
            <h1 className="ux4g-mb-2xs">Benchmarking league table</h1>
            <div className="gx-muted">Ranked like-for-like within a segment — never one flat national list.</div>
          </div>
          <div className="gx-actions ux4g-ai-end">
            <div>
              <label className="ux4g-label-m-default" htmlFor="league-category">Service category</label>
              <select id="league-category" className="ux4g-form-select ux4g-form-select-md" style={{ minWidth: 190 }} value={cat}
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
          <Icon name="diagram-3" size={20} />
          <div>
            Ranking <b>{cat}</b> services against {rows?.length ?? 0} peer{rows?.length === 1 ? "" : "s"}.
            Comparing a payments portal with an information site would flatter one and punish the
            other, so segments are ranked separately.
          </div>
        </div>
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

        <div className="ux4g-grid ux4g-grid-cols-12 ux4g-gap-s">
          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-8"><div className="gx-card">
            <div className="gx-card-head"><h2>Ranking — {cat}</h2></div>
            <div className="ux4g-table-responsive ux4g-table-rounded"><table className="ux4g-table ux4g-table-m gx-responsive">
              <thead><tr><th>#</th><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
              <tbody>
                {rows == null && <tr><td colSpan={4} className="ux4g-text-center ux4g-py-m"><Spinner size="sm" /></td></tr>}
                {rows?.length === 0 && !err && <tr><td colSpan={4} className="gx-muted ux4g-text-center ux4g-py-l">No audited domains in this segment yet.</td></tr>}
                {(rows || []).map((r, i) => (
                <tr key={r.url}><td data-label="Rank" className="gx-num gx-muted">{i + 1}</td>
                  <td data-label="Domain" className="gx-cell-primary">{r.url}</td>
                  <td data-label="Score" className="gx-num ux4g-fw-bold">{r.score ?? "—"}</td>
                  <td data-label="Band">{r.band
                    ? <span className="gx-pill" style={bandStyle(r.band)}>{r.band}</span>
                    : <span className="gx-muted">—</span>}</td></tr>
              ))}</tbody>
            </table></div>
          </div></div>

          <div className="ux4g-cols-span-12 ux4g-lg-cols-span-4">
            <div className="gx-card ux4g-mb-s"><div className="gx-card-body">
              <div className="ux4g-d-flex ux4g-ai-center ux4g-mb-xs"><h2 className="h6 ux4g-mb-none">Publishing</h2>
                <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-ml-auto">Governance-gated</span></div>
              <div className="ux4g-d-inline-flex ux4g-gap-2xs ux4g-w-100 ux4g-mb-xs">
                <button className={`ux4g-btn ux4g-btn-sm ${pub === "internal" ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`} onClick={() => setPub("internal")}>
                  <Icon name="lock" size={16} className="ux4g-mr-2xs" />Internal</button>
                <button className={`ux4g-btn ux4g-btn-sm ${pub === "public" ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`} onClick={() => setPub("public")}>
                  <Icon name="globe2" size={16} className="ux4g-mr-2xs" />Public (opt-in)</button>
              </div>
              <p className="gx-muted small ux4g-mb-none">
                Rankings default to the internal steward view. Public publication is a MeitY policy decision — GSA/EU precedent.
              </p>
            </div></div>
            <div className="gx-card" style={{ background: "var(--gx-surface-muted)" }}><div className="gx-card-body">
              <h2 className="h6">Anti-gaming safeguards</h2>
              <ul className="small gx-muted ux4g-mb-none ux4g-ps-s">
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
