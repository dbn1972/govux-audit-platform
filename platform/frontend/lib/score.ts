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
  A: "var(--gx-band-A)", B: "var(--gx-band-B)", C: "var(--gx-band-C)",
  D: "var(--gx-band-D)", E: "var(--gx-band-E)",
};

// The literal values behind those tokens, per theme. Kept here so the contrast
// guarantee stays testable: a var() cannot be measured, and dropping the check
// when the palette moved into CSS would have retired the only thing standing
// between this product and shipping unreadable band badges. MIRRORS the
// --gx-band-* tokens in app/design-system.css — change both together.
export const BAND_HEX: Record<"light" | "dark", Record<string, string>> = {
  light: { A: "#116932", B: "#0c655e", C: "#9a4508", D: "#a6370a", E: "#b91c1c" },
  dark:  { A: "#5dc98a", B: "#54c9bd", C: "#e39a5c", D: "#ef8b63", E: "#f08a90" },
};

/** The surface each theme's badges are actually read against. */
export const BAND_SURFACE: Record<"light" | "dark", string> = {
  light: "#f8f9fa", dark: "#111a2b",
};

// The 12%-ish ground each band badge paints under its own colour. Was written
// at every call site as `BAND_COLOR[b] + "22"`, which stops working the moment
// the colour is a var() — and stopped being correct the moment there was a
// second theme.
export const BAND_TINT: Record<string, string> = {
  A: "var(--gx-band-A-tint)", B: "var(--gx-band-B-tint)", C: "var(--gx-band-C-tint)",
  D: "var(--gx-band-D-tint)", E: "var(--gx-band-E-tint)",
};

// good → fair → poor, drawn from the same band palette so a bar and a badge
// never disagree about what "fair" looks like.
export const barColor = (s: number) =>
  (s >= 75 ? BAND_COLOR.A : s >= 60 ? BAND_COLOR.C : BAND_COLOR.E);

/** Colour + matching ground for a band, falling back to neutral for none. */
export const bandStyle = (b?: string | null) => ({
  color: BAND_COLOR[b || ""] || "var(--gx-band-none)",
  background: BAND_TINT[b || ""] || "var(--gx-band-none-tint)",
});
