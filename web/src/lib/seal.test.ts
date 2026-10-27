import { describe, expect, it } from "vitest";
import { sealGeometry, starPath, tickLines } from "./seal";

describe("generative seal", () => {
  it("is deterministic for a seed", () => {
    expect(sealGeometry("7:bafyterms")).toEqual(sealGeometry("7:bafyterms"));
  });

  it("changes when the terms change", () => {
    expect(sealGeometry("7:bafyterms")).not.toEqual(sealGeometry("7:bafytermz"));
  });

  it("stays within its design ranges", () => {
    for (let i = 0; i < 200; i++) {
      const g = sealGeometry(`seed-${i}`);
      expect(g.petals).toBeGreaterThanOrEqual(5);
      expect(g.petals).toBeLessThanOrEqual(12);
      expect([36, 48, 60, 72]).toContain(g.ticks);
      expect(g.starStep).toBeGreaterThanOrEqual(2);
      expect(g.starStep).toBeLessThan(g.petals);
    }
  });

  it("renders coordinates at fixed precision so SSR and hydration agree", () => {
    for (const t of tickLines(100, 100, 61, 66, 48, 4)) {
      for (const v of [t.x1, t.y1, t.x2, t.y2]) expect(Math.round(v * 100) / 100).toBe(v);
    }
  });

  it("traces every cycle of a compound star polygon", () => {
    // {6/2} is two triangles: two closed sub-paths.
    expect(starPath(0, 0, 10, 6, 2, 0).match(/M/g)).toHaveLength(2);
    expect(starPath(0, 0, 10, 7, 3, 0).match(/M/g)).toHaveLength(1);
  });
});
