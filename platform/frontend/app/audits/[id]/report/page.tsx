"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import { api } from "@/lib/api";
import { BAND_COLOR, barColor } from "@/lib/score";

const NAMES: Record<string, [string, number]> = {
  accessibility: ["Accessibility", 22], usability: ["Usability & UX", 17],
  gigw: ["GIGW 3.0", 15], design: ["Design / UX4G", 11], performance: ["Performance/CWV", 12],
  responsiveness: ["Responsiveness", 10], content: ["Content quality", 7], trust: ["Trust & security", 6],
};
const BANDS = ["A", "B", "C", "D", "E"] as const;
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
// CWV lab thresholds (good/needs/poor)
const cwvJudge = (metric: string, v: number | null) => {
  if (v == null) return ["—", "#5c636a"];
  if (metric === "lcp") return v <= 2500 ? ["Good", BAND_COLOR.A] : v <= 4000 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
  if (metric === "cls") return v <= 0.1 ? ["Good", BAND_COLOR.A] : v <= 0.25 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
  return v <= 200 ? ["Good", BAND_COLOR.A] : v <= 500 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
};

const SEVERITIES: [string, string, string][] = [
  ["Critical", "critical", BAND_COLOR.E], ["High", "high", BAND_COLOR.D],
  ["Medium", "medium", BAND_COLOR.C], ["Low", "low", "#5c636a"],
];

export default function Report({ params }: { params: { id: string } }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.auditReport(params.id).then(setR).catch(e => setErr(e.message)); }, [params.id]);

  if (err) return <AppShell><div className="gx-page"><div className="alert alert-warning">Report not ready: {err}</div></div></AppShell>;
  if (!r) return <AppShell><div className="gx-page"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading report…</span></div></div></AppShell>;

  const sev = (s: string) => r.findings.filter((f: any) => f.severity === s).length;

  // Ordered by points lost, not alphabetically. A 58 in accessibility (weight 22)
  // and a 58 in trust (weight 6) are not the same problem, and the old list —
  // sorted by name — gave a reader no way to tell which to fix first.
  const cats = [...(r.categories || [])]
    .map((c: any) => {
      const [label, wt] = NAMES[c.category] || [c.category, c.weight];
      return { ...c, label, weight: wt, lost: ((100 - c.score) * wt) / 100 };
    })
    .sort((a, b) => b.lost - a.lost);
  const worst = cats[0];

  return (
    <AppShell>
      <div className="gx-page gx-stack">

        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">{r.domain || "Audit report"}</h1>
            <div className="gx-muted">
              Audit report{r.date ? ` · ${fmtDate(r.date)}` : ""}{r.engine_version ? ` · Engine ${r.engine_version}` : ""}
            </div>
          </div>
          <div className="gx-actions">
            <button type="button" className="btn btn-outline-secondary"
              onClick={async () => {
                const blob = await api.evidencePack(params.id);
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `govux-evidence-${params.id}.zip`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}>
              <i className="bi bi-file-earmark-zip me-1" aria-hidden="true" />Evidence pack
            </button>
            <Link href={`/review?audit=${params.id}`} className="btn btn-outline-secondary">Certify</Link>
            <Link href={`/audits/${params.id}/issues`} className="btn btn-primary">
              See prioritised issues<i className="bi bi-arrow-right ms-1" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* every other view of this audit — four of them previously had no
            inbound link anywhere in the app */}
        <AuditNav id={params.id} />

        {r.integrity?.flagged && (
          <div className="gx-callout gx-callout-danger" role="alert">
            <i className="bi bi-exclamation-octagon" aria-hidden="true" />
            <div>
              <b>Integrity check — possible gaming detected.</b> The compliance verdict is capped pending
              human review. The GovUX score itself is unchanged.
              <ul className="mb-0 mt-1 small">
                {r.integrity.techniques.map((t: any) => <li key={t.key}>{t.label}</li>)}
                {r.integrity.jump && <li>Score rose {r.integrity.jump.from} → {r.integrity.jump.to} with no matching change.</li>}
              </ul>
            </div>
          </div>
        )}

        {(r.findings || []).some((f: any) => String(f.guideline || "").startsWith("Integrity")) && (
          <div className="gx-callout" role="alert">
            <i className="bi bi-shield-exclamation" aria-hidden="true" />
            <div>
              <b>Integrity flag — possible “accessibility theater”.</b> An accessibility overlay widget
              and/or mandatory elements hidden from users were detected. These can inflate an automated
              score without helping citizens, so this audit <b>cannot be certified compliant</b>. See the
              flagged issues below.
            </div>
          </div>
        )}

        {/* Score and legal verdict, side by side and visibly distinct. */}
        <div className="gx-verdict">
          <div className="gx-card">
            <div className="gx-card-body">
              <div className="gx-score">
                <div>
                  <div className="gx-label">GovUX score</div>
                  <div className="gx-score-figure" style={{ color: BAND_COLOR[r.band] }}>{r.overall_score}</div>
                  <div className="fw-semibold" style={{ color: BAND_COLOR[r.band] }}>Band {r.band}</div>
                </div>
                <div className="flex-grow-1" style={{ minWidth: 240 }}>
                  {/* the ladder the letter sits on */}
                  <div className="gx-scale" aria-hidden="true">
                    {BANDS.map((b) => (
                      <span key={b} className="gx-scale-step"
                        style={b === r.band ? { background: BAND_COLOR[b] } : undefined} />
                    ))}
                  </div>
                  <div className="gx-scale-labels" aria-hidden="true">
                    {BANDS.map((b) => <span key={b}>{b}</span>)}
                  </div>
                  <p className="gx-muted mt-3 mb-0" style={{ fontSize: ".875rem" }}>
                    Weighted across {cats.length} categories
                    {r.pages_total ? ` from ${r.pages_total} audited page${r.pages_total === 1 ? "" : "s"}` : ""}.
                    {worst && <> Most of the gap is in <b>{worst.label}</b> — {worst.lost.toFixed(1)} of
                    the {(100 - Number(r.overall_score)).toFixed(1)} points lost.</>}
                  </p>
                </div>
              </div>

              {r.guardrail_active && (
                <div className="gx-callout mt-4">
                  <i className="bi bi-shield-fill-exclamation" aria-hidden="true" />
                  <div>
                    <b>Guard-rail active — band capped at C.</b> A critical accessibility or trust failure
                    holds the band down regardless of the weighted score, and lifts as soon as it is fixed.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="gx-card">
            <div className="gx-card-body">
              <div className="gx-label">Legal compliance verdict</div>
              <div className="h4 mt-2 mb-1" style={{ color: "var(--gx-navy-800)" }}>
                {String(r.compliance?.status || "not assessed").replace(/_/g, " ")}
              </div>
              <div className="gx-muted" style={{ fontSize: ".875rem" }}>
                Evidence: {r.compliance?.method === "automated" ? "automated only" : r.compliance?.method || "—"}
              </div>
              <hr className="my-3" />
              <p className="gx-muted mb-3" style={{ fontSize: ".8125rem" }}>
                This is a separate judgement from the score above. Automated evidence alone can never
                carry a site past a <b>partial</b> verdict — full conformance needs an assessor to
                certify the checks a machine cannot make.
              </p>
              <Link href={`/review?audit=${params.id}`} className="btn btn-outline-primary btn-sm w-100">
                Certify with expert review
              </Link>
            </div>
          </div>
        </div>

        {/* Severity counts, each a way into the issues it counts. */}
        <div className="gx-sev">
          {SEVERITIES.map(([label, key, colour]) => (
            <Link key={key} href={`/audits/${params.id}/issues?severity=${key}`}
              className="gx-sev-tile" style={{ color: colour }}>
              <div>
                <div className="gx-sev-count">{sev(key)}</div>
                <span className="gx-sev-name">{label}</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="gx-card">
          <div className="gx-card-head">
            <h2>Where the points went</h2>
            <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>Ordered by points lost</span>
          </div>
          <div>
            {cats.map((c: any) => (
              <div className="gx-cat" key={c.category}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: ".9375rem" }}>{c.label}</div>
                  <div className="gx-muted" style={{ fontSize: ".75rem" }}>Weight {c.weight}%</div>
                </div>
                <span className="gx-meter">
                  <span style={{ width: `${c.score}%`, background: barColor(c.score) }} />
                </span>
                <span className="gx-cat-score" style={{ color: barColor(c.score) }}>{Math.round(c.score)}</span>
                <span className="gx-cat-cost">−{c.lost.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        </div>

        {r.cwv && (r.cwv.lcp_ms != null || r.cwv.cls != null) && (
          <div className="gx-card">
            <div className="gx-card-head">
              <h2>Core Web Vitals</h2>
              <span className="gx-muted ms-auto" style={{ fontSize: ".8125rem" }}>Lab measurement</span>
            </div>
            <div className="gx-card-body">
              <div className="gx-stats">
                {[["Largest Contentful Paint", "lcp", r.cwv.lcp_ms != null ? (r.cwv.lcp_ms / 1000).toFixed(1) + "s" : null, r.cwv.lcp_ms, "under 2.5s"],
                  ["Cumulative Layout Shift", "cls", r.cwv.cls != null ? r.cwv.cls : null, r.cwv.cls != null ? r.cwv.cls * 1000 : null, "under 0.1"],
                  ["Interaction to Next Paint", "inp", r.cwv.inp_ms != null ? r.cwv.inp_ms + "ms" : null, r.cwv.inp_ms, "under 200ms"]].map(([label, key, disp, raw, target]) => {
                  const [verdict, col] = cwvJudge(key as string, raw as number | null);
                  return (
                    <div className="gx-stat" key={key as string}>
                      <div className="gx-label">{label}</div>
                      <div className="gx-stat-value" style={{ color: col }}>{(disp as string) ?? "—"}</div>
                      <div className="gx-stat-note">
                        <span style={{ color: col, fontWeight: 600 }}>{verdict}</span> · target {target}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
