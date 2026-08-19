"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { BAND_COLOR as bandColor, bandFor } from "@/lib/score";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};

/** "3 days ago" beats "14/08/2026" here: the question this column answers is
 *  "is this stale?", and a reader shouldn't have to do date arithmetic. */
function fmtWhen(s?: string | null) {
  if (!s) return "Never";
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return new Date(s).toLocaleDateString();
}

export default function Dashboard() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.listDomains()
      .then((d) => setDomains(d || []))
      .catch((e) => { setErr(e?.message || "Could not load your domains."); setDomains([]); });
    api.me().then(setMe).catch(() => {});
  }, []);

  const list = domains || [];
  const verified = list.filter((d) => d.verify_status === "verified").length;
  const pending = list.filter((d) => d.verify_status !== "verified").length;
  const scored = list.filter((d) => d.latest_score != null);
  const average = scored.length
    ? Math.round((scored.reduce((t, d) => t + (d.latest_score as number), 0) / scored.length) * 10) / 10
    : null;
  const nothingAudited = domains != null && list.length > 0 && scored.length === 0;

  return (
    <AppShell><div className="gx-page gx-stack">

      <div className="gx-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mb-1">Your workspace</h1>
          <div className="gx-muted">
            {domains == null ? "Loading your estate…"
              : `${me?.org_name ? me.org_name + " · " : ""}${list.length} registered domain${list.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="gx-actions">
          <Link href="/domains/new" className="btn btn-outline-secondary">
            <i className="bi bi-plus-lg me-1" aria-hidden="true" />Add domain
          </Link>
          <Link href="/audits/new" className="btn btn-primary">
            <i className="bi bi-play-fill me-1" aria-hidden="true" />New audit
          </Link>
        </div>
      </div>

      {err && <div className="alert alert-warning" role="alert">{err}</div>}

      {/* Four figures, and the fourth is the one that matters: an estate with
          three verified domains and no score is not a healthy estate, which the
          old three-count row could not express. */}
      <div className="gx-stats">
        <div className="gx-stat">
          <div className="gx-label">Registered domains</div>
          <div className="gx-stat-value">{domains?.length ?? "—"}</div>
        </div>
        <div className="gx-stat">
          <div className="gx-label">Verified</div>
          <div className="gx-stat-value">{domains == null ? "—" : verified}</div>
          <div className="gx-stat-note">{domains == null ? " " : "Ready to audit"}</div>
        </div>
        <div className="gx-stat">
          <div className="gx-label">Pending verification</div>
          <div className="gx-stat-value">{domains == null ? "—" : pending}</div>
          <div className="gx-stat-note">
            {pending > 0 ? <Link href="/domains">Finish verification →</Link> : " "}
          </div>
        </div>
        <div className="gx-stat">
          <div className="gx-label">Average GovUX score</div>
          <div className="gx-stat-value" style={average != null ? { color: bandColor[bandFor(average)] } : undefined}>
            {average ?? "—"}
          </div>
          <div className="gx-stat-note">
            {average != null
              ? `Band ${bandFor(average)} · across ${scored.length} audited domain${scored.length === 1 ? "" : "s"}`
              : "No audits yet"}
          </div>
        </div>
      </div>

      {/* First run. Three verified domains and nothing audited used to render as
          half a screen of white space with no next step anywhere on it. */}
      {nothingAudited && (
        <div className="gx-card">
          <div className="gx-empty">
            <div className="gx-empty-icon"><i className="bi bi-clipboard-check" aria-hidden="true" /></div>
            <h2 className="mt-3 mb-1">Nothing audited yet</h2>
            <p className="gx-muted mb-0" style={{ maxWidth: 560, marginInline: "auto" }}>
              Your domains are verified and ready. An audit crawls the site, runs the
              accessibility, GIGW, UX4G and performance checks, and returns a 0–100
              GovUX score with the evidence behind it.
            </p>
            <div className="gx-steps">
              <div className="gx-step">
                <span className="gx-step-n">1</span>
                <div className="fw-semibold mt-2">Pick a domain</div>
                <div className="gx-muted small">Choose which service to inspect and how deep to crawl.</div>
              </div>
              <div className="gx-step">
                <span className="gx-step-n">2</span>
                <div className="fw-semibold mt-2">We run the checks</div>
                <div className="gx-muted small">Automated rules run first; anything requiring judgement is flagged for review.</div>
              </div>
              <div className="gx-step">
                <span className="gx-step-n">3</span>
                <div className="fw-semibold mt-2">Fix what matters first</div>
                <div className="gx-muted small">Findings arrive ranked by impact, with the guideline each one cites.</div>
              </div>
            </div>
            <Link href="/audits/new" className="btn btn-primary mt-4">
              <i className="bi bi-play-fill me-1" aria-hidden="true" />Run your first audit
            </Link>
          </div>
        </div>
      )}

      <div className="gx-card">
        <div className="gx-card-head">
          <h2>My domains</h2>
          <div className="gx-actions">
            <Link href="/domains" className="btn btn-sm btn-outline-secondary">Manage domains</Link>
          </div>
        </div>
        <div className="table-responsive">
          <table className="gx-table gx-responsive">
            <thead>
              <tr>
                <th>Domain</th><th>Status</th><th>Latest score</th>
                <th>Last audited</th><th><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {domains == null && (
                <tr><td colSpan={5} className="text-center py-4">
                  <span className="spinner-border spinner-border-sm text-primary me-2" />Loading…
                </td></tr>
              )}
              {domains?.length === 0 && !err && (
                <tr><td colSpan={5} className="text-center py-4">
                  <span className="gx-muted">No domains yet. </span>
                  <Link href="/domains/new">Register your first domain →</Link>
                </td></tr>
              )}
              {list.map((d) => (
                <tr key={d.id}>
                  <td data-label="Domain">
                    <div className="gx-cell-primary">{d.url}</div>
                    {d.category && <span className="gx-chip mt-1">{d.category}</span>}
                  </td>
                  <td data-label="Status">
                    <span className={`gx-pill ${d.verify_status === "verified" ? "gx-pill-ok" : "gx-pill-wait"}`}>
                      {d.verify_status}
                    </span>
                  </td>
                  <td data-label="Latest score">
                    {d.latest_score != null ? (
                      <div className="d-flex align-items-center gap-2" style={{ maxWidth: 180 }}>
                        <span className="gx-num fw-bold" style={{ color: bandColor[d.latest_band || ""] }}>
                          {d.latest_score}
                        </span>
                        <span className="gx-meter flex-grow-1">
                          <span style={{ width: `${d.latest_score}%`,
                                         background: bandColor[d.latest_band || ""] || "var(--gx-ink-400)" }} />
                        </span>
                      </div>
                    ) : <span className="gx-muted">Not audited</span>}
                  </td>
                  <td data-label="Last audited" className="gx-muted">{fmtWhen(d.last_audited_at)}</td>
                  <td data-label="" className="text-end">
                    {d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="btn btn-sm btn-outline-primary">Run audit</Link>
                      : <Link href="/domains/new" className="btn btn-sm btn-outline-secondary">Verify</Link>}
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
