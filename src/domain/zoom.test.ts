import { describe, expect, it } from "vitest";

import { alignFor, CENTERED } from "./page";
import { clampZoom, FIT_ZOOM_MIN, fitZoom, scrollAfterZoom, scrollToContent, ZOOM_MAX, ZOOM_MIN, zoomedIn, zoomedOut, zoomPage } from "./zoom";

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

describe("a bracket zoomed out", () => {
  it("stays flush to the top left, whatever the Align choice", () => {
    const page = { width: 1400, height: 820 };
    const screen = { width: 1900, height: 800 };
    const drawn = zoomPage(page, screen, 0.9, alignFor("bracket", CENTERED));
    expect(drawn.y).toBe(0);
    expect(drawn.x).toBe(0);
    // Other maps still centre.
    expect(zoomPage(page, screen, 0.9, alignFor("connections", CENTERED)).y).toBeGreaterThan(0);
  });
});

describe("fit to view", () => {
  const screen = { width: 957, height: 800 };

  it("stays at 100% for a map that fits, never zooming in", () => {
    expect(fitZoom({ left: 100, top: 100, right: 400, bottom: 300 }, screen, 36)).toBe(1);
    expect(fitZoom({ left: 0, top: 0, right: 0, bottom: 0 }, screen, 36)).toBe(1);
  });

  it("zooms out just enough for the wider or taller side, rounded down", () => {
    // 957 - 72 = 885 across 1770: 50%; 800 - 72 = 728 across 1000: 72.8%.
    expect(fitZoom({ left: 0, top: 0, right: 1770, bottom: 1000 }, screen, 36)).toBe(0.5);
    expect(fitZoom({ left: 0, top: 0, right: 500, bottom: 1000 }, screen, 36)).toBe(0.72);
    // Rounded down, so the boxes really fit.
    const z = fitZoom({ left: 0, top: 0, right: 2000, bottom: 10 }, screen, 36);
    expect(2000 * z).toBeLessThanOrEqual(957 - 72);
  });

  it("goes below the pill's 50% for a narrow window, but not below 10%", () => {
    expect(fitZoom({ left: 0, top: 0, right: 2000, bottom: 500 }, { width: 481, height: 800 }, 36)).toBe(0.2);
    expect(fitZoom({ left: 0, top: 0, right: 100_000, bottom: 500 }, screen, 36)).toBe(FIT_ZOOM_MIN);
  });

  it("scrolls the boxes' top-left corner to the margin, never before 0", () => {
    expect(scrollToContent({ left: 1000, top: 600, right: 2000, bottom: 900 }, { x: 0, y: 0, zoom: 0.5 }, 36)).toEqual({ left: 464, top: 264 });
    expect(scrollToContent({ left: 10, top: 10, right: 200, bottom: 200 }, { x: 0, y: 0, zoom: 1 }, 36)).toEqual({ left: 0, top: 0 });
  });
});
