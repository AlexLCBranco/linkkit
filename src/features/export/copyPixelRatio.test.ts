import { describe, expect, it } from "vitest";

import { copyPixelRatio } from "./renderMapImage";

describe("copyPixelRatio", () => {
  it("copies at 4x so a pasted picture stays sharp when resized", () => {
    expect(copyPixelRatio(800, 600)).toBe(4);
  });

  it("lowers the density for a huge map instead of passing the canvas limit", () => {
    const ratio = copyPixelRatio(8000, 1000);
    expect(ratio).toBe(2);
    expect(8000 * ratio).toBeLessThanOrEqual(16000);
    expect(1000 * copyPixelRatio(1000, 10000)).toBeLessThanOrEqual(16000);
  });
});
