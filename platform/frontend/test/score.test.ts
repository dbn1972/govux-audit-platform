import { describe, it, expect } from "vitest";
import { bandFor, barColor, BAND_COLOR } from "../lib/score";

const rgb = (hex: string) =>
  [0, 2, 4].map((i) => parseInt(hex.replace("#", "").slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((n) => {
    const v = n / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Bootstrap's card/table surface (--bs-body-bg), not white. */
const SURFACE = "#f8f9fa";

/**
 * The band badges are drawn as `background: colour + "22"` with the same colour
 * as text — a 13.3% tint of themselves over the page surface. That is the
 * background the text is actually read against, and it is much darker than
 * white, so it is the one the contrast has to clear.
 */
function tintOf(hex: string, over = SURFACE): string {
  const [f, b] = [rgb(hex), rgb(over)];
  const mix = f.map((c, i) => Math.round(c * (0x22 / 255) + b[i] * (1 - 0x22 / 255)));
  return "#" + mix.map((c) => c.toString(16).padStart(2, "0")).join("");
}

describe("score bands (mirror backend engine)", () => {
  it("maps scores to bands at the right boundaries", () => {
    expect(bandFor(100)).toBe("A");
    expect(bandFor(90)).toBe("A");
    expect(bandFor(89.9)).toBe("B");
    expect(bandFor(75)).toBe("B");
    expect(bandFor(74.9)).toBe("C");
    expect(bandFor(60)).toBe("C");
    expect(bandFor(59.9)).toBe("D");
    expect(bandFor(40)).toBe("D");
    expect(bandFor(39.9)).toBe("E");
    expect(bandFor(0)).toBe("E");
  });

  it("has a colour for every band", () => {
    for (const b of ["A", "B", "C", "D", "E"]) expect(BAND_COLOR[b]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  // Asserts the band each score maps to, not a hex. Pinning literals here is
  // what let the palette be "verified" while its contrast was actually wrong.
  it("bar colour degrades with score", () => {
    expect(barColor(80)).toBe(BAND_COLOR.A);   // >=75 good  (green)
    expect(barColor(65)).toBe(BAND_COLOR.C);   // >=60 fair  (amber)
    expect(barColor(40)).toBe(BAND_COLOR.E);   // <60  poor  (red)
    expect(barColor(75)).toBe(BAND_COLOR.A);   // boundary
    expect(barColor(60)).toBe(BAND_COLOR.C);   // boundary
  });

  // This used to measure against white only, and passed while four of the five
  // bands were failing at 3.99–4.34 on the tint they are actually drawn on.
  it("every band + bar colour clears WCAG AA on the surfaces it is drawn on", () => {
    const swatches = [
      ...["A", "B", "C", "D", "E"].map((b) => [`band ${b}`, BAND_COLOR[b]] as const),
      ...[90, 75, 65, 40, 10].map((s) => [`bar ${s}`, barColor(s)] as const),
    ];
    for (const [name, hex] of swatches) {
      // as a badge, on its own 13.3% tint — the tightest of the three
      expect(contrast(hex, tintOf(hex)), `${name} (${hex}) on its own tint`)
        .toBeGreaterThanOrEqual(4.5);
      // and as plain text, on a card and on white
      expect(contrast(hex, SURFACE), `${name} (${hex}) on ${SURFACE}`)
        .toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex, "#ffffff"), `${name} (${hex}) on white`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
