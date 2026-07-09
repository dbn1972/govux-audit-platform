"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const NAMES: Record<string, [string, number]> = {
  accessibility: ["Accessibility", 22], usability: ["Usability & UX", 17],
  gigw: ["GIGW 3.0", 15], design: ["Design / UX4G", 11], performance: ["Performance/CWV", 12],
  responsiveness: ["Responsiveness & Compat.", 10], content: ["Content quality", 7], trust: ["Trust & security", 6],
};
// AA-safe semantic palette (≥4.5:1 on white) — mirrors lib/score.ts
const bandColor: Record<string, string> = { A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c" };
const barColor = (s: number) => s >= 75 ? "#15803d" : s >= 60 ? "#b45309" : "#b91c1c";

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
        <div className="d-flex align-items-center mb-1">
          <h1 className="h3 mb-0">Audit report</h1>
          <Link href={`/review?audit=${params.id}`} className="btn btn-outline-secondary ms-auto">Certify (expert review)</Link>
          <Link href={`/audits/${params.id}/issues`} className="btn btn-primary ms-2">See prioritised issues →</Link>
        </div>
        <p className="text-secondary small">Task {params.id}</p>

        <div className="row g-3 mb-3">
          <div className="col-lg-8"><div className="card shadow-sm h-100"><div className="card-body d-flex gap-4 align-items-center flex-wrap">
            <div className="text-center">
              <div className="score-value">{r.overall_score}</div>
              <span className="badge" style={{ background: bandColor[r.band] + "22", color: bandColor[r.band] }}>Band {r.band}</span>
            </div>
            <p className="mb-0 text-secondary flex-grow-1" style={{ minWidth: 220 }}>
              Weighted across 8 categories.
              {r.guardrail_active && <> A critical failure has activated the <b>guard-rail</b>, capping the band until fixed.</>}
            </p>
          </div></div></div>
          <div className="col-lg-4"><div className="card shadow-sm h-100"><div className="card-body">
            <h2 className="h6">Issues by severity</h2>
            {[["Critical", "critical", "#dc3545"], ["High", "high", "#fd7e14"], ["Medium", "medium", "#ffc107"], ["Low", "low", "#6c757d"]].map(([l, k, c]) => (
              <div className="d-flex justify-content-between border-bottom py-1" key={k}>
                <span>{l}</span><b style={{ color: c as string }}>{sev(k as string)}</b>
              </div>
            ))}
          </div></div></div>
        </div>

        <div className="card shadow-sm"><div className="card-header bg-white fw-semibold">Category sub-scores</div><div className="card-body">
          {r.categories.map((c: any) => {
            const [label, wt] = NAMES[c.category] || [c.category, c.weight];
            return (
              <div className="d-flex align-items-center gap-3 my-2" key={c.category}>
                <div style={{ width: 200, fontSize: 14 }}>{label} <span className="text-secondary small">· {wt}%</span></div>
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
