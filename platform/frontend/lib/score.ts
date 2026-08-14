// Shared score/band helpers (mirror the backend scoring engine bands).
export function bandFor(score: number): "A" | "B" | "C" | "D" | "E" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "E";
}

// Semantic band colours for WCAG 2.2 AA. The bar is NOT 4.5:1 on white: these
// are most often drawn as a badge whose background is a 13.3% tint of the very
// same colour, and each has to clear 4.5:1 against that much darker surface.
// Every value below does, which leaves white and #f8f9fa comfortable too.
// Mirrored by .band-*/.bg-band-* in app/ux4g-theme.css — change both together.
export const BAND_COLOR: Record<string, string> = {
  A: "#116932", B: "#0c655e", C: "#9a4508", D: "#a6370a", E: "#b91c1c",
};

// good → fair → poor, drawn from the same band palette so a bar and a badge
// never disagree about what "fair" looks like.
export const barColor = (s: number) =>
  (s >= 75 ? BAND_COLOR.A : s >= 60 ? BAND_COLOR.C : BAND_COLOR.E);
