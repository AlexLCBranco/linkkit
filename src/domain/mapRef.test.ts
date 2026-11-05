import { describe, expect, it } from "vitest";

import { mapRefUrl } from "./mapRef";

describe("map reference (Ctrl+C with no box picked)", () => {
  it("names the map", () => {
    const u = new URL(mapRefUrl("https://gauntlet-home.vercel.app", "m 1"));
    expect(u.pathname).toBe("/linkkit/");
    expect(u.searchParams.get("map")).toBe("m 1");
  });
});
