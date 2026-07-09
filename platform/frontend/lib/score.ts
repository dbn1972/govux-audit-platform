// Shared score/band helpers (mirror the backend scoring engine bands).
export function bandFor(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "E";
}

// Semantic band colours — chosen for WCAG 2.2 AA: every value clears 4.5:1 on
// white, so the same hue is safe as text AND as a graphic fill (≥3:1).
export const BAND_COLOR: Record<string, string> = {
  A: "#15803d", B: "#0f766e", C: "#b45309", D: "#c2410c", E: "#b91c1c",
};

// good → fair → poor. Amber replaces the old muddy olive; a darker green
// replaces the low-contrast #20c997 that failed as a number label.
export const barColor = (s: number) => (s >= 75 ? "#15803d" : s >= 60 ? "#b45309" : "#b91c1c");
