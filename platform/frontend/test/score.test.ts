import { describe, it, expect } from "vitest";
import { bandFor, barColor, BAND_COLOR } from "../lib/score";

// WCAG relative-luminance contrast ratio vs white — used to guarantee the
// score/band palette stays AA-compliant (a regression guard for the a11y pass).
function contrastVsWhite(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.0 + 0.05) / (L + 0.05);
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

  it("bar colour degrades with score (AA-contrast palette)", () => {
    expect(barColor(80)).toBe("#15803d");   // >=75 good  (green)
    expect(barColor(65)).toBe("#b45309");   // >=60 fair  (amber)
    expect(barColor(40)).toBe("#b91c1c");   // <60  poor  (red)
    expect(barColor(75)).toBe("#15803d");   // boundary
    expect(barColor(60)).toBe("#b45309");   // boundary
  });

  it("every band + bar colour clears WCAG AA (>=4.5:1 on white)", () => {
    for (const b of ["A", "B", "C", "D", "E"]) {
      expect(contrastVsWhite(BAND_COLOR[b])).toBeGreaterThanOrEqual(4.5);
    }
    for (const s of [90, 75, 65, 40, 10]) {
      expect(contrastVsWhite(barColor(s))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
