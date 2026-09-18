"use client";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import AuditNav from "@/components/AuditNav";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";

const SEV = { critical: "ux4g-tag-tonal-error ux4g-tag-s", high: "ux4g-tag-tonal-warning ux4g-tag-s", medium: "ux4g-tag-tonal-warning ux4g-tag-s", low: "ux4g-tag-tonal-neutral ux4g-tag-s" } as const;

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
            <h1 className="ux4g-mb-2xs">Prioritised issues</h1>
            <div className="gx-muted">
              {findings.length} finding{findings.length === 1 ? "" : "s"} from the audit engine,
              ranked by severity. Fix the critical ones first — those are what hold the band down.
            </div>
          </div>
        </div>
        <AuditNav id={params.id} />
        {err && <div className="ux4g-alert ux4g-alert-warning" role="alert">{err}</div>}

        <div className="ux4g-mb-s ux4g-d-flex ux4g-gap-xs ux4g-flex-wrap ux4g-ai-center">
          {["all", "critical", "high", "medium", "low"].map(s => (
            <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s}
              className={`ux4g-btn ux4g-btn-sm ${filter === s ? "ux4g-btn-primary" : "ux4g-btn-outline-neutral"}`}>
              {s === "all" ? `All ${findings.length}` : `${s} ${count(s)}`}
            </button>
          ))}
          {aiState !== "done" && (
            <button className="ux4g-btn ux4g-btn-outline-primary ux4g-btn-sm ux4g-ml-auto" onClick={explainWithAI}
              disabled={aiState === "loading" || !findings.length}>
              {aiState === "loading" ? "Thinking…"
                : <><Icon name="stars" size={16} className="ux4g-mr-2xs" />Explain how to fix (AI)</>}
            </button>
          )}
        </div>
        {aiState === "unavailable" && (
          <div className="ux4g-alert ux4g-alert-info ux4g-py-xs small">
            Advisory AI is off. A steward can enable it in <b>Configuration → Advisory AI</b>. The
            deterministic fix guidance below still applies.
          </div>
        )}
        {aiState === "done" && (
          <div className="ux4g-alert ux4g-alert-info ux4g-py-xs small">
            <Icon name="stars" size={16} className="ux4g-mr-2xs" />AI guidance is <b>advisory</b> — plain-language help for the top issues. It never affects the score or verdict.
          </div>
        )}

        <div className="gx-card"><div className="ux4g-table-responsive ux4g-table-rounded">
          <table className="ux4g-table ux4g-table-m gx-responsive">
            <thead><tr><th>Issue &amp; how to fix</th><th>Category</th><th>Guideline</th><th>Severity</th></tr></thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={i}>
                  <td data-label="Issue">
                    <div className="gx-cell-primary">{f.title || f.guideline}</div>
                    {f.remediation && (
                      <div className="gx-muted small ux4g-mt-2xs">
                        <Icon name="arrow-return-right" size={16} className="ux4g-mr-2xs" />{f.remediation}
                      </div>
                    )}
                    {ai[f.id] && (
                      <div className="small ux4g-mt-2xs ux4g-p-xs ux4g-radius-m" style={{ background: "var(--bs-tertiary-bg, #f6f8fa)", whiteSpace: "pre-line" }}>
                        <span className="ux4g-tag-tonal-neutral ux4g-tag-s ux4g-mr-2xs">
                          <Icon name="stars" size={16} className="ux4g-mr-2xs" />AI advisory</span>{ai[f.id]}
                      </div>
                    )}
                  </td>
                  <td data-label="Category"><span className="ux4g-tag-tonal-neutral ux4g-tag-s">{f.category}</span></td>
                  <td data-label="Guideline"><code className="small">{f.guideline}</code></td>
                  <td data-label="Severity"><span className={SEV[f.severity as keyof typeof SEV] || "ux4g-tag-tonal-neutral ux4g-tag-s"}>{f.severity}</span></td>
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={4} className="ux4g-text-center gx-muted ux4g-py-m">
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
