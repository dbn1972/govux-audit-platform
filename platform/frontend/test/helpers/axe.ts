import axe from "axe-core";

/**
 * Runs axe over a rendered container inside jsdom.
 *
 * This is the per-PR half of the accessibility net. The browser sweep in
 * e2e/a11y.auth.spec.ts is richer but needs the whole stack up, so it only runs
 * nightly; these run on every push with no backend at all.
 *
 * jsdom has no layout engine, so anything that depends on geometry or painted
 * pixels — colour contrast, target size, reading order — cannot be judged here
 * and is switched off rather than left to report a meaningless result. What
 * survives is the structural half: does every control have an accessible name,
 * is the ARIA coherent, are labels really attached to something. That is
 * precisely the class of defect that keeps turning up on the signed-in screens.
 */
const LAYOUT_DEPENDENT = [
  "color-contrast",
  "target-size",
];

/** Rules that only make sense for a whole document, not a mounted fragment. */
const WHOLE_PAGE_ONLY = [
  "region",
  "page-has-heading-one",
  "landmark-one-main",
  "html-has-lang",
  "document-title",
  "bypass",
];

export async function findA11yViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: Object.fromEntries(
      [...LAYOUT_DEPENDENT, ...WHOLE_PAGE_ONLY].map((id) => [id, { enabled: false }])),
  });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    // Include the offending markup: "select-name" alone doesn't say which one.
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.html).join(" | ")}`);
}
