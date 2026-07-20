"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const SEV = { critical: "text-bg-danger", high: "text-bg-warning", medium: "text-bg-warning-subtle", low: "text-bg-light" } as const;

export default function Issues({ params }: { params: { id: string } }) {
  const [findings, setFindings] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState("");
  const [ai, setAi] = useState<Record<string, string>>({});
  const [aiState, setAiState] = useState<"idle" | "loading" | "done" | "unavailable">("idle");
  useEffect(() => {
    api.auditReport(params.id).then(r => setFindings(r.findings || []))
      .catch(e => setErr(e?.message || "Could not load findings."));
  }, [params.id]);

  async function explainWithAI() {
    setAiState("loading");
    try {
      const r = await api.remediation(params.id, true);
      if (!r.ai_available) { setAiState("unavailable"); return; }
      const map: Record<string, string> = {};
      for (const it of r.items || []) if (it.remediation_ai) map[it.id] = it.remediation_ai;
      setAi(map); setAiState("done");
    } catch { setAiState("unavailable"); }
  }

  const shown = useMemo(() =>
    filter === "all" ? findings : findings.filter(f => f.severity === filter), [findings, filter]);
  const count = (s: string) => findings.filter(f => f.severity === s).length;

  return (
    <AppShell>
      <div className="container-fluid p-4">
        <h1 className="h3">Prioritised issues</h1>
        <p className="text-secondary small">{findings.length} findings from the audit engine, ranked by severity.</p>
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="mb-3 d-flex gap-2 flex-wrap align-items-center">
          {["all", "critical", "high", "medium", "low"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline-secondary"}`}>
              {s === "all" ? `All ${findings.length}` : `${s} ${count(s)}`}
            </button>
          ))}
          {aiState !== "done" && (
            <button className="btn btn-sm btn-outline-primary ms-auto" onClick={explainWithAI}
              disabled={aiState === "loading" || !findings.length}>
              {aiState === "loading" ? "Thinking…" : "✨ Explain how to fix (AI)"}
            </button>
          )}
        </div>
        {aiState === "unavailable" && (
          <div className="alert alert-info py-2 small">
            Advisory AI is off. A steward can enable it in <b>Configuration → Advisory AI</b>. The
            deterministic fix guidance below still applies.
          </div>
        )}
        {aiState === "done" && (
          <div className="alert alert-secondary py-2 small">
            ✨ AI guidance is <b>advisory</b> — plain-language help for the top issues. It never affects the score or verdict.
          </div>
        )}

        <div className="card shadow-sm"><div className="table-responsive">
          <table className="table table-hover align-middle mb-0 gx-responsive">
            <thead className="table-light"><tr><th>Issue &amp; how to fix</th><th>Category</th><th>Guideline</th><th>Severity</th></tr></thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td data-label="Issue">
                    <div className="fw-semibold" style={{ color: "var(--ux-navy)" }}>{f.title || f.guideline}</div>
                    {f.remediation && <div className="text-secondary small mt-1">↳ {f.remediation}</div>}
                    {ai[f.id] && (
                      <div className="small mt-1 p-2 rounded" style={{ background: "var(--bs-tertiary-bg, #f6f8fa)", whiteSpace: "pre-line" }}>
                        <span className="badge text-bg-primary-subtle me-1">✨ AI advisory</span>{ai[f.id]}
                      </div>
                    )}
                  </td>
                  <td data-label="Category"><span className="badge text-bg-primary-subtle">{f.category}</span></td>
                  <td data-label="Guideline" className="text-secondary small">{f.guideline}</td>
                  <td data-label="Severity"><span className={`badge ${SEV[f.severity as keyof typeof SEV] || "text-bg-light"}`}>{f.severity}</span></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={4} className="text-center text-secondary py-4">No issues in this filter.</td></tr>}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
