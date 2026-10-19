import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "./memoryStorage";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

/** A fresh store, as a reload would make, over what is saved. */
async function freshStore() {
  vi.resetModules();
  return await import("./viewStore");
}

describe("zoom per map", () => {
  it("keeps each map's zoom apart, across a reload", async () => {
    const { useViewStore, zoomOf } = await freshStore();
    useViewStore.getState().setZoom("a", 1.5);
    useViewStore.getState().setZoom("b", 0.5);
    const after = await freshStore();
    const state = after.useViewStore.getState();
    expect(zoomOf(state, "a")).toBe(1.5);
    expect(zoomOf(state, "b")).toBe(0.5);
    expect(zoomOf(state, "c")).toBe(1);
  });

  it("keeps a map put back to 100% (an explicit choice), and keeps zooms in range", async () => {
    const { useViewStore } = await freshStore();
    useViewStore.getState().setZoom("a", 1.5);
    useViewStore.getState().setZoom("a", 1);
    useViewStore.getState().setZoom("b", 9);
    expect(JSON.parse(localStorage.getItem("linkkit:zoom")!)).toEqual({ a: 1, b: 2 });
  });

  it("ignores a damaged saved value", async () => {
    localStorage.setItem("linkkit:zoom", '{"a":"big","b":0.7');
    const { useViewStore } = await freshStore();
    expect(useViewStore.getState().zooms).toEqual({});
  });
});

describe("fit to the window on open", () => {
  it("shows a fit zoom for this visit only, never stored, and the map's own zoom wins", async () => {
    localStorage.setItem("linkkit:zoom", JSON.stringify({ own: 1.2 }));
    const { useViewStore, zoomOf, fitsOnOpen } = await freshStore();
    const s = () => useViewStore.getState();
    expect(fitsOnOpen(s(), "a")).toBe(true);
    expect(fitsOnOpen(s(), "own")).toBe(false);
    s().setFit("a", 0.37);
    s().setFit("own", 0.4);
    expect(zoomOf(s(), "a")).toBe(0.37);
    expect(zoomOf(s(), "own")).toBe(1.2);
    expect(JSON.parse(localStorage.getItem("linkkit:zoom")!)).toEqual({ own: 1.2 });
    // Gone after a reload: the next visit fits again.
    const after = await freshStore();
    expect(zoomOf(after.useViewStore.getState(), "a")).toBe(1);
    expect(after.fitsOnOpen(after.useViewStore.getState(), "a")).toBe(true);
  });

  it("the pill wins: its zoom is stored, 100% too, and the map is not fitted again, even after a reload", async () => {
    const { useViewStore, zoomOf, fitsOnOpen } = await freshStore();
    const s = () => useViewStore.getState();
    s().setFit("a", 0.37);
    s().setZoom("a", 0.5);
    expect(zoomOf(s(), "a")).toBe(0.5);
    expect(JSON.parse(localStorage.getItem("linkkit:zoom")!)).toEqual({ a: 0.5 });
    s().setFit("b", 0.3);
    s().setZoom("b", 1);
    expect(zoomOf(s(), "b")).toBe(1);
    expect(fitsOnOpen(s(), "b")).toBe(false);
    expect(JSON.parse(localStorage.getItem("linkkit:zoom")!)).toEqual({ a: 0.5, b: 1 });
    const after = await freshStore();
    expect(after.fitsOnOpen(after.useViewStore.getState(), "b")).toBe(false);
    expect(after.zoomOf(after.useViewStore.getState(), "b")).toBe(1);
  });
});

describe("hidden rounds per bracket", () => {
  it("keeps each bracket's choice apart, across a reload, and forgets one showing every round", async () => {
    const { useViewStore, roundsHiddenOf } = await freshStore();
    useViewStore.getState().setHiddenRounds("a", 2);
    useViewStore.getState().setHiddenRounds("b", 1);
    useViewStore.getState().setHiddenRounds("b", 0);
    const after = await freshStore();
    const { hiddenRounds } = after.useViewStore.getState();
    expect(roundsHiddenOf(hiddenRounds, "a")).toBe(2);
    expect(roundsHiddenOf(hiddenRounds, "b")).toBe(0);
    expect(JSON.parse(localStorage.getItem("linkkit:hiddenRounds")!)).toEqual({ a: 2 });
  });

  it("ignores a damaged saved value", async () => {
    localStorage.setItem("linkkit:hiddenRounds", '{"a":-1,"b":"two","c":2}');
    const { useViewStore } = await freshStore();
    expect(useViewStore.getState().hiddenRounds).toEqual({ c: 2 });
  });
});

describe("pinned rounds per bracket", () => {
  it("keeps each bracket's choice apart, across a reload, and forgets one turned off", async () => {
    const { useViewStore } = await freshStore();
    useViewStore.getState().setPinnedFrom("a", 4);
    useViewStore.getState().setPinnedFrom("b", 3);
    useViewStore.getState().setPinnedFrom("b", 0);
    const after = await freshStore();
    const { pinnedRounds } = after.useViewStore.getState();
    expect(after.pinnedFromOf(pinnedRounds, "a")).toBe(4);
    expect(after.pinnedFromOf(pinnedRounds, "b")).toBe(0);
    expect(JSON.parse(localStorage.getItem("linkkit:pinnedRounds")!)).toEqual({ a: 4 });
  });

  it("ignores a damaged saved value, and round 1 (pinning everything)", async () => {
    localStorage.setItem("linkkit:pinnedRounds", '{"a":1,"b":"two","c":3}');
    const { useViewStore } = await freshStore();
    expect(useViewStore.getState().pinnedRounds).toEqual({ c: 3 });
  });
});
