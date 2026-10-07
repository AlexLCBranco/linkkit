import { describe, expect, it } from "vitest";

import { HOME_URL, movedTo } from "./address";

describe("movedTo", () => {
  it("runs normally at the gauntlet site and on local addresses", () => {
    for (const host of ["gauntlet-home.vercel.app", "GAUNTLET-HOME.vercel.app", "localhost", "127.0.0.1", "[::1]", "app.localhost"]) {
      expect(movedTo(host)).toBeNull();
    }
  });

  it("points every other address at the gauntlet site", () => {
    for (const host of ["linkkit-lake.vercel.app", "linkkit-abc123-alexlcbrancos-projects.vercel.app", "gauntlet-home.vercel.app.evil.com", "localhost.example.com"]) {
      expect(movedTo(host)).toBe(HOME_URL);
    }
  });

  it("the target is itself an address that runs normally (no loop)", () => {
    expect(movedTo(new URL(HOME_URL).hostname)).toBeNull();
  });
});
