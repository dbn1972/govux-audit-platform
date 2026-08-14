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
