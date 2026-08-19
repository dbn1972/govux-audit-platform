"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
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
      <div className="gx-page gx-stack">
        <div className="gx-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="mb-1">Prioritised issues</h1>
            <div className="gx-muted">
              {findings.length} finding{findings.length === 1 ? "" : "s"} from the audit engine,
              ranked by severity. Fix the critical ones first — those are what hold the band down.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="alert alert-warning" role="alert">{err}</div>}

        <div className="mb-3 d-flex gap-2 flex-wrap align-items-center">
          {["all", "critical", "high", "medium", "low"].map(s => (
            <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s}
              className={`btn btn-sm ${filter === s ? "btn-primary" : "btn-outline-secondary"}`}>
              {s === "all" ? `All ${findings.length}` : `${s} ${count(s)}`}
            </button>
          ))}
          {aiState !== "done" && (
            <button className="btn btn-sm btn-outline-primary ms-auto" onClick={explainWithAI}
              disabled={aiState === "loading" || !findings.length}>
              {aiState === "loading" ? "Thinking…"
                : <><i className="bi bi-stars me-1" aria-hidden="true" />Explain how to fix (AI)</>}
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
            <i className="bi bi-stars me-1" aria-hidden="true" />AI guidance is <b>advisory</b> — plain-language help for the top issues. It never affects the score or verdict.
          </div>
        )}

        <div className="gx-card"><div className="table-responsive">
          <table className="gx-table gx-responsive">
            <thead><tr><th>Issue &amp; how to fix</th><th>Category</th><th>Guideline</th><th>Severity</th></tr></thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td data-label="Issue">
                    <div className="gx-cell-primary">{f.title || f.guideline}</div>
                    {f.remediation && (
                      <div className="gx-muted small mt-1">
                        <i className="bi bi-arrow-return-right me-1" aria-hidden="true" />{f.remediation}
                      </div>
                    )}
                    {ai[f.id] && (
                      <div className="small mt-1 p-2 rounded" style={{ background: "var(--bs-tertiary-bg, #f6f8fa)", whiteSpace: "pre-line" }}>
                        <span className="badge text-bg-primary-subtle me-1">
                          <i className="bi bi-stars me-1" aria-hidden="true" />AI advisory</span>{ai[f.id]}
                      </div>
                    )}
                  </td>
                  <td data-label="Category"><span className="badge text-bg-primary-subtle">{f.category}</span></td>
                  <td data-label="Guideline"><code className="small">{f.guideline}</code></td>
                  <td data-label="Severity"><span className={`badge ${SEV[f.severity as keyof typeof SEV] || "text-bg-light"}`}>{f.severity}</span></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={4} className="text-center gx-muted py-4">
                  {findings.length ? "No issues at this severity — try another filter."
                                   : "No issues found in this audit."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div></div>
      </div>
    </AppShell>
  );
}
