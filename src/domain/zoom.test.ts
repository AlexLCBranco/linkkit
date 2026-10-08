import { describe, expect, it } from "vitest";

import { CENTERED } from "./page";
import { clampZoom, scrollAfterZoom, ZOOM_MAX, ZOOM_MIN, zoomedIn, zoomedOut, zoomPage } from "./zoom";

describe("zoom steps", () => {
  it("steps by 10% without floating-point drift", () => {
    expect(zoomedIn(1)).toBe(1.1);
    expect(zoomedIn(zoomedIn(0.1 + 0.2 + 0.5))).toBe(1);
    expect(zoomedOut(1)).toBe(0.9);
  });

  it("stops at the ends of the range", () => {
    expect(zoomedIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomedOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });
});

describe("the zoomed page", () => {
  const screen = { width: 1000, height: 600 };

  it("is the screen itself at 100%", () => {
    expect(zoomPage(screen, screen, 1, CENTERED)).toEqual({ width: 1000, height: 600, x: 0, y: 0, zoom: 1 });
  });

  it("zoomed in, grows past the screen so it scrolls", () => {
    expect(zoomPage(screen, screen, 2, CENTERED)).toEqual({ width: 2000, height: 1200, x: 0, y: 0, zoom: 2 });
  });

  it("zoomed out, stays the screen's size with the page placed as Align says", () => {
    expect(zoomPage(screen, screen, 0.5, CENTERED)).toEqual({ width: 1000, height: 600, x: 250, y: 150, zoom: 0.5 });
    expect(zoomPage(screen, screen, 0.5, { x: "start", y: "end" })).toMatchObject({ x: 0, y: 300 });
  });

  it("scrolls only on the axis that does not fit", () => {
    // A tall page: at 50% its width fits (centred), its height still scrolls.
    const page = zoomPage({ width: 1000, height: 3000 }, screen, 0.5, CENTERED);
    expect(page).toEqual({ width: 1000, height: 1500, x: 250, y: 0, zoom: 0.5 });
  });
});

describe("scrolling after a zoom", () => {
  it("keeps the middle of the screen in the middle", () => {
    const view = { left: 0, top: 0, width: 1000, height: 600 };
    // At 100% the middle is page point (500, 300); at 200% that is drawn at (1000, 600).
    expect(scrollAfterZoom(view, { x: 0, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 2 })).toEqual({ left: 500, top: 300 });
  });

  it("never asks for a scroll before the start", () => {
    const view = { left: 500, top: 300, width: 1000, height: 600 };
    expect(scrollAfterZoom(view, { x: 0, y: 0, zoom: 2 }, { x: 250, y: 150, zoom: 0.5 })).toEqual({ left: 0, top: 0 });
  });
});
