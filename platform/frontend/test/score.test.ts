import { describe, it, expect } from "vitest";
import { bandFor, barColor, BAND_COLOR } from "../lib/score";

describe("score bands (mirror backend engine)", () => {
  it("maps scores to bands at the right boundaries", () => {
    expect(bandFor(95)).toBe("A");
    expect(bandFor(75)).toBe("B");
    expect(bandFor(60)).toBe("C");
    expect(bandFor(40)).toBe("D");
    expect(bandFor(39.9)).toBe("E");
  });
  it("has a colour for every band", () => {
    for (const b of ["A", "B", "C", "D", "E"]) expect(BAND_COLOR[b]).toMatch(/^#/);
  });
  it("bar colour degrades with score", () => {
    expect(barColor(80)).toBe("#20c997");
    expect(barColor(65)).toBe("#997404");
    expect(barColor(40)).toBe("#dc3545");
  });
});
