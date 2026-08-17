/**
 * Findings → rule identity.
 *
 * A finding is only actionable if it names the rule it broke. Both mappings
 * here used to collapse to a single coarse string — every axe violation came
 * back as "WCAG2AA" and all seventeen GIGW checks as "GIGW" — so a report
 * listed a stack of issues that pointed at nothing, and none of them could be
 * joined to the guideline library for remediation guidance.
 *
 * Kept out of runner.js (which runs main() on import) so it can be tested.
 */

/**
 * The specific WCAG success criterion behind an axe violation, as "WCAG-1.4.3".
 *
 * axe tags carry BOTH the conformance level and the criterion — colour contrast
 * is ["cat.color", "wcag2aa", "wcag143", …]. The level comes first, so taking
 * the first tag starting with "wcag" yielded "wcag2aa": true, useless, and
 * identical across a third of the rule set. Level tags are wcag2a / wcag2aa /
 * wcag21aa …; criteria are all-digit (wcag143 → 1.4.3, wcag2411 → 2.4.11).
 *
 * Returns null when no criterion tag is present, so the caller can fall back to
 * the axe rule id rather than inventing a criterion.
 */
export function wcagCriterion(tags = []) {
  const t = (tags || []).find(x => /^wcag\d{3,4}$/.test(x));
  return t ? `WCAG-${t[4]}.${t[5]}.${t.slice(6)}` : null;
}

/**
 * Stable id for each GIGW 3.0 mandatory-element check.
 *
 * The explicit entries match ids that already exist in the guideline library so
 * findings link straight to their remediation text; anything else follows the
 * same shape, staying traceable and ready for a library entry to be written.
 */
const GIGW_IDS = {
  contact_info:       "GIGW-contact-info",
  last_updated:       "GIGW-content-freshness",
  accessibility_stmt: "GIGW-accessibility-statement",
  hyperlink_policy:   "GIGW-hyperlinking-policy",
  rti:                "GIGW-rti",
  https:              "GIGW-6.2",
};

export const gigwId = (key) => GIGW_IDS[key] || `GIGW-${key.replace(/_/g, "-")}`;

/**
 * Core Web Vitals thresholds, and the findings a breach produces.
 *
 * Lighthouse already measured these on every audit, but the numbers only ever
 * reached the report as a metric tile — no finding was emitted, so the worst
 * problem on a report could be absent from the remediation plan a department
 * actually works through. A 13.6s LCP (three times the "poor" bound) showed as
 * a red number and nothing else.
 *
 * Boundaries are Google's published good/needs-improvement/poor bounds and must
 * stay in step with cwvJudge() in app/audits/[id]/report/page.tsx, or a metric
 * will read "Poor" on the report while the plan disagrees.
 *
 * INP is a FIELD metric and cannot be measured in a lab run. Lighthouse's lab
 * proxy is Total Blocking Time, so that is what is judged — and the finding
 * says so rather than quietly presenting TBT as INP.
 */
export const CWV = {
  lcp: { id: "CWV-LCP", label: "Largest Contentful Paint", unit: "ms",
         good: 2500, poor: 4000,
         advice: "Optimise and correctly size the hero image, preload it, serve modern " +
                 "formats, and take render-blocking CSS and fonts off the critical path." },
  cls: { id: "CWV-CLS", label: "Cumulative Layout Shift", unit: "",
         good: 0.1, poor: 0.25,
         advice: "Reserve space for images, ads and embeds with explicit width/height or " +
                 "aspect-ratio, and never insert content above content already on screen." },
  tbt: { id: "CWV-INP", label: "Total Blocking Time (lab proxy for INP)", unit: "ms",
         good: 200, poor: 600,
         advice: "Break up long JavaScript tasks, defer non-essential scripts, and keep " +
                 "heavy work out of input handlers." },
};

/** Findings for any Core Web Vital outside its "good" band. */
export function cwvFindings(cwv = {}) {
  const out = [];
  const seen = { lcp: cwv.lcp_ms, cls: cwv.cls, tbt: cwv.tbt_ms };
  for (const [key, spec] of Object.entries(CWV)) {
    const v = seen[key];
    // 0 is what the collector writes when Lighthouse failed to produce a value;
    // reporting a perfect score from a missing measurement would be worse than
    // saying nothing.
    if (v === undefined || v === null || v === 0) continue;
    if (v <= spec.good) continue;
    const poor = v > spec.poor;
    const shown = spec.unit === "ms" ? `${(v / 1000).toFixed(1)}s` : v.toFixed(3);
    const bound = spec.unit === "ms" ? `${(spec.good / 1000).toFixed(1)}s` : String(spec.good);
    out.push({
      category: "performance",
      severity: poor ? "high" : "medium",
      guideline: spec.id,
      title: `${spec.label}: ${shown} (${poor ? "poor" : "needs improvement"}; target ${bound} or better)`,
      remediation: spec.advice,
      effort: "high",
    });
  }
  return out;
}
