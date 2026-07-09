"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const bandBg: Record<string, string> = { A: "#198754", B: "#15803d", C: "#b45309", D: "#c2410c", E: "#b91c1c" };

export default function National() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.national().then(setD).catch((e) => setErr(e?.message || "Could not load national data."));
  }, []);

  if (err) return <AppShell><div className="container-fluid p-4"><div className="alert alert-warning" role="alert">{err}</div></div></AppShell>;
  if (!d) return <AppShell><div className="container-fluid p-4 text-center"><span className="spinner-border text-primary" role="status" aria-label="Loading" /></div></AppShell>;
  const maxBand = Math.max(...Object.values(d.band_distribution || {}) as number[], 1);

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <div className="d-flex align-items-center mb-3">
          <div><h1 className="h3 mb-0">National digital-service quality</h1>
            <div className="text-secondary small">Live across all audited .gov.in / .nic.in domains</div></div>
          <Link href="/admin/bulk-scan" className="btn btn-outline-secondary ms-auto me-2">🗂️ Bulk scan</Link>
          <button className="btn btn-primary">⬇ Export brief</button>
        </div>

        <div className="row g-3 mb-3">
          {[["Domains audited", d.audited, `${d.coverage_pct}% coverage`],
            ["National avg. score", d.avg_score ?? "—", "GovUX Score"],
            ["Band E (critical)", d.band_distribution?.E ?? 0, "need intervention"],
            ["Register size", d.domains_total, "known domains"]].map(([l, v, s]) => (
            <div className="col-6 col-md-3" key={l as string}><div className="card shadow-sm"><div className="card-body">
              <div className="text-secondary small fw-semibold">{l}</div>
              <div className="fs-3 fw-bold" style={{ color: "var(--ux-navy)" }}>{v as any}</div>
              <div className="text-secondary small">{s}</div>
            </div></div></div>
          ))}
        </div>

        <div className="row g-3">
          <div className="col-lg-7"><div className="card shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Score distribution — all domains</div>
            <div className="card-body d-flex align-items-end gap-3" style={{ height: 200 }}>
              {Object.entries(d.band_distribution || {}).map(([band, n]) => (
                <div key={band} className="text-center flex-grow-1">
                  <div style={{ height: `${(Number(n) / maxBand) * 150}px`, background: bandBg[band], borderRadius: "6px 6px 0 0" }} />
                  <div className="fw-bold mt-1">{n as any}</div>
                  <span className="badge" style={{ background: bandBg[band] + "22", color: bandBg[band] }}>{band}</span>
                </div>
              ))}
            </div>
          </div></div>
          <div className="col-lg-5"><div className="card shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Top performers</div>
            <div className="table-responsive"><table className="table table-hover align-middle mb-0">
              <thead className="table-light"><tr><th>Domain</th><th>Score</th><th>Band</th></tr></thead>
              <tbody>{(d.league || []).map((r: any) => (
                <tr key={r.url}><td className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{r.url}</td>
                  <td className="fw-bold">{r.score}</td>
                  <td><span className="badge" style={{ background: bandBg[r.band] + "22", color: bandBg[r.band] }}>{r.band}</span></td></tr>
              ))}</tbody>
            </table></div>
          </div></div>
        </div>
      </div>
    </AppShell>
  );
}
