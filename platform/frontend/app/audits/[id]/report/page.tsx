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
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
// CWV lab thresholds (good/needs/poor)
const cwvJudge = (metric: string, v: number | null) => {
  if (v == null) return ["—", "#5c636a"];
  if (metric === "lcp") return v <= 2500 ? ["Good", BAND_COLOR.A] : v <= 4000 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
  if (metric === "cls") return v <= 0.1 ? ["Good", BAND_COLOR.A] : v <= 0.25 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
  return v <= 200 ? ["Good", BAND_COLOR.A] : v <= 500 ? ["Needs work", BAND_COLOR.C] : ["Poor", BAND_COLOR.E];
};

export default function Report({ params }: { params: { id: string } }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.auditReport(params.id).then(setR).catch(e => setErr(e.message)); }, [params.id]);

  if (err) return <AppShell><div className="container-fluid p-4"><div className="alert alert-warning">Report not ready: {err}</div></div></AppShell>;
  if (!r) return <AppShell><div className="container-fluid p-4"><div className="spinner-border text-primary" /></div></AppShell>;

  const sev = (s: string) => r.findings.filter((f: any) => f.severity === s).length;

  return (
    <AppShell>
      <div className="container-fluid p-4" style={{ maxWidth: 1240 }}>
        <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
          <div>
            <h1 className="h3 mb-0" style={{ color: "var(--ux-navy)" }}>{r.domain || "Audit report"}</h1>
            <div className="text-secondary small">
              Audit report{r.date ? ` · ${fmtDate(r.date)}` : ""}{r.engine_version ? ` · Engine ${r.engine_version}` : ""}
            </div>
          </div>
          <button type="button" className="btn btn-outline-secondary ms-auto"
            onClick={async () => {
              const blob = await api.evidencePack(params.id);
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `govux-evidence-${params.id}.zip`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}>
            <i className="bi bi-file-earmark-zip me-1" aria-hidden="true" />Evidence pack (STQC)
          </button>
          <Link href={`/review?audit=${params.id}`} className="btn btn-outline-secondary">Certify (expert review)</Link>
          <Link href={`/audits/${params.id}/issues`} className="btn btn-primary">See prioritised issues →</Link>
        </div>

        {/* every other view of this audit — four of them previously had no
            inbound link anywhere in the app */}
        <AuditNav id={params.id} />

        {r.integrity?.flagged && (
          <div className="alert alert-danger mt-2" role="alert">
            <b>⚠ Integrity check — possible gaming detected.</b> The compliance verdict is capped pending human review.
            The GovUX score itself is unchanged.
            <ul className="mb-0 mt-1 small">
              {r.integrity.techniques.map((t: any) => <li key={t.key}>{t.label}</li>)}
              {r.integrity.jump && <li>Score rose {r.integrity.jump.from} → {r.integrity.jump.to} with no matching change.</li>}
            </ul>
          </div>
        )}

        {(r.findings || []).some((f: any) => String(f.guideline || "").startsWith("Integrity")) && (
          <div className="alert alert-warning d-flex gap-2" role="alert">
            <i className="bi bi-shield-exclamation" aria-hidden="true" />
            <div>
              <b>Integrity flag — possible “accessibility theater”.</b> An accessibility overlay widget
              and/or mandatory elements hidden from users were detected. These can inflate an automated
              score without helping citizens, so this audit <b>cannot be certified compliant</b>. See the
              flagged issues below.
            </div>
          </div>
        )}

        <div className="row g-3 mb-3">
          <div className="col-lg-8"><div className="card shadow-sm h-100"><div className="card-body d-flex gap-4 align-items-center flex-wrap">
            <div className="text-center">
              <div className="score-value">{r.overall_score}</div>
              <span className="badge" style={{ background: BAND_COLOR[r.band] + "22", color: BAND_COLOR[r.band] }}>Band {r.band}</span>
            </div>
            <div className="flex-grow-1" style={{ minWidth: 220 }}>
              <p className="mb-2 text-secondary">
                Weighted across 8 categories.
                {r.guardrail_active && <> A critical failure has activated the <b>guard-rail</b>, capping the band until fixed.</>}
              </p>
              {r.compliance?.status && (
                <div className="small">
                  <span className="text-secondary">Compliance verdict: </span>
                  <span className="badge text-bg-secondary-subtle">{String(r.compliance.status).replace(/_/g, " ")}</span>
                  <span className="text-secondary"> · {r.compliance.method === "automated" ? "automated evidence" : r.compliance.method}</span>
                </div>
              )}
            </div>
          </div></div></div>
          <div className="col-lg-4"><div className="card shadow-sm h-100"><div className="card-body">
            <h2 className="h6">Issues by severity</h2>
            {/* AA-safe severity palette (≥4.5:1 on white) — mirrors lib/score.ts */}
            {[["Critical", "critical", BAND_COLOR.E], ["High", "high", BAND_COLOR.D], ["Medium", "medium", BAND_COLOR.C], ["Low", "low", "#5c636a"]].map(([l, k, c]) => (
              <div className="d-flex justify-content-between border-bottom py-1" key={k}>
                <span>{l}</span><b style={{ color: c as string }}>{sev(k as string)}</b>
              </div>
            ))}
          </div></div></div>
        </div>

        {r.cwv && (r.cwv.lcp_ms != null || r.cwv.cls != null) && (
          <div className="row g-3 mb-3">
            {[["Largest Contentful Paint", "lcp", r.cwv.lcp_ms != null ? (r.cwv.lcp_ms / 1000).toFixed(1) + "s" : null, r.cwv.lcp_ms],
              ["Cumulative Layout Shift", "cls", r.cwv.cls != null ? r.cwv.cls : null, r.cwv.cls != null ? r.cwv.cls * 1000 : null],
              ["Interaction to Next Paint", "inp", r.cwv.inp_ms != null ? r.cwv.inp_ms + "ms" : null, r.cwv.inp_ms]].map(([label, key, disp, raw]) => {
              const [verdict, col] = cwvJudge(key as string, raw as number | null);
              return (
                <div className="col-6 col-md-4" key={key as string}><div className="card shadow-sm h-100"><div className="card-body py-3">
                  <div className="text-secondary small">{label}</div>
                  <div className="fs-4 fw-bold" style={{ color: col }}>{disp ?? "—"}</div>
                  <div className="small fw-semibold" style={{ color: col }}>{verdict}</div>
                </div></div></div>
              );
            })}
          </div>
        )}

        <div className="card shadow-sm"><div className="card-header bg-white fw-semibold">Category sub-scores</div><div className="card-body">
          {r.categories.map((c: any) => {
            const [label, wt] = NAMES[c.category] || [c.category, c.weight];
            return (
              <div className="d-flex align-items-center gap-3 my-2" key={c.category}>
                <div style={{ width: 210, flexShrink: 0, fontSize: 14 }}>{label} <span className="text-secondary small">· {wt}%</span></div>
                <div className="score-bar flex-grow-1"><i style={{ width: `${c.score}%`, background: barColor(c.score) }} /></div>
                <b style={{ width: 40, textAlign: "right", color: barColor(c.score) }}>{Math.round(c.score)}</b>
              </div>
            );
          })}
        </div></div>
      </div>
    </AppShell>
  );
}
