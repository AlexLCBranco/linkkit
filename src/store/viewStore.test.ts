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
    const { zooms } = after.useViewStore.getState();
    expect(zoomOf(zooms, "a")).toBe(1.5);
    expect(zoomOf(zooms, "b")).toBe(0.5);
    expect(zoomOf(zooms, "c")).toBe(1);
  });

  it("forgets a map put back to 100%, and keeps zooms in range", async () => {
    const { useViewStore } = await freshStore();
    useViewStore.getState().setZoom("a", 1.5);
    useViewStore.getState().setZoom("a", 1);
    useViewStore.getState().setZoom("b", 9);
    expect(JSON.parse(localStorage.getItem("linkkit:zoom")!)).toEqual({ b: 2 });
  });

  it("ignores a damaged saved value", async () => {
    localStorage.setItem("linkkit:zoom", '{"a":"big","b":0.7');
    const { useViewStore } = await freshStore();
    expect(useViewStore.getState().zooms).toEqual({});
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
