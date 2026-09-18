"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import Spinner from "@/components/Spinner";
import { BAND_COLOR as bandColor, bandFor } from "@/lib/score";
import { relative } from "@/lib/format";

type Domain = {
  id: string; url: string; verify_status: string; category?: string | null;
  latest_score?: number | null; latest_band?: string | null; last_audited_at?: string | null;
};

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
          <h1 className="ux4g-mb-2xs">Your workspace</h1>
          <div className="gx-muted">
            {domains == null ? "Loading your estate…"
              : `${me?.org_name ? me.org_name + " · " : ""}${list.length} registered domain${list.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="gx-actions">
          <Link href="/domains/new" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-md">
            <Icon name="plus-lg" size={16} className="ux4g-mr-2xs" />Add domain
          </Link>
          <Link href="/audits/new" className="ux4g-btn ux4g-btn-primary ux4g-btn-md">
            <Icon name="play-fill" size={16} className="ux4g-mr-2xs" />New audit
          </Link>
        </div>
      </div>

      {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

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
            <div className="gx-empty-icon"><Icon name="clipboard-check" size={24} /></div>
            <h2 className="ux4g-mt-s ux4g-mb-2xs">Nothing audited yet</h2>
            <p className="gx-muted ux4g-mb-none" style={{ maxWidth: 560, marginInline: "auto" }}>
              Your domains are verified and ready. An audit crawls the site, runs the
              accessibility, GIGW, UX4G and performance checks, and returns a 0–100
              GovUX score with the evidence behind it.
            </p>
            <div className="gx-steps">
              <div className="gx-step">
                <span className="gx-step-n">1</span>
                <div className="ux4g-fw-semibold ux4g-mt-xs">Pick a domain</div>
                <div className="gx-muted small">Choose which service to inspect and how deep to crawl.</div>
              </div>
              <div className="gx-step">
                <span className="gx-step-n">2</span>
                <div className="ux4g-fw-semibold ux4g-mt-xs">We run the checks</div>
                <div className="gx-muted small">Automated rules run first; anything requiring judgement is flagged for review.</div>
              </div>
              <div className="gx-step">
                <span className="gx-step-n">3</span>
                <div className="ux4g-fw-semibold ux4g-mt-xs">Fix what matters first</div>
                <div className="gx-muted small">Findings arrive ranked by impact, with the guideline each one cites.</div>
              </div>
            </div>
            <Link href="/audits/new" className="ux4g-btn ux4g-btn-primary ux4g-btn-md ux4g-mt-m">
              <Icon name="play-fill" size={16} className="ux4g-mr-2xs" />Run your first audit
            </Link>
          </div>
        </div>
      )}

      <div className="gx-card">
        <div className="gx-card-head">
          <h2>My domains</h2>
          <div className="gx-actions">
            <Link href="/domains" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm">Manage domains</Link>
          </div>
        </div>
        <div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead>
              <tr>
                <th>Domain</th><th>Status</th><th>Latest score</th>
                <th>Last audited</th><th><span className="ux4g-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {domains == null && (
                <tr><td colSpan={5} className="ux4g-text-center ux4g-py-m">
                  <Spinner size="sm" className="ux4g-mr-xs" />Loading…
                </td></tr>
              )}
              {domains?.length === 0 && !err && (
                <tr><td colSpan={5} className="ux4g-text-center ux4g-py-m">
                  <span className="gx-muted">No domains yet. </span>
                  <Link href="/domains/new">Register your first domain →</Link>
                </td></tr>
              )}
              {list.map((d) => (
                <tr key={d.id}>
                  <td data-label="Domain">
                    <div className="gx-cell-primary">{d.url}</div>
                    {d.category && <span className="gx-chip ux4g-mt-2xs">{d.category}</span>}
                  </td>
                  <td data-label="Status">
                    <span className={`gx-pill ${d.verify_status === "verified" ? "gx-pill-ok" : "gx-pill-wait"}`}>
                      {d.verify_status}
                    </span>
                  </td>
                  <td data-label="Latest score">
                    {d.latest_score != null ? (
                      <div className="ux4g-d-flex ux4g-ai-center ux4g-gap-xs" style={{ maxWidth: 180 }}>
                        <span className="gx-num ux4g-fw-bold" style={{ color: bandColor[d.latest_band || ""] }}>
                          {d.latest_score}
                        </span>
                        <span className="gx-meter ux4g-flex-grow-1">
                          <span style={{ width: `${d.latest_score}%`,
                                         background: bandColor[d.latest_band || ""] || "var(--gx-ink-400)" }} />
                        </span>
                      </div>
                    ) : <span className="gx-muted">Not audited</span>}
                  </td>
                  <td data-label="Last audited" className="gx-muted">{relative(d.last_audited_at)}</td>
                  <td data-label="" className="ux4g-text-end">
                    {d.verify_status === "verified"
                      ? <Link href={`/audits/new?domain=${d.id}`} className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm">Run audit</Link>
                      : <Link href="/domains/new" className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-sm">Verify</Link>}
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
