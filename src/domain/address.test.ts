import { describe, expect, it } from "vitest";

import { HOME_URL, isPreviewAddress, movedTo } from "./address";

describe("movedTo", () => {
  it("runs normally at the gauntlet site and on local addresses", () => {
    for (const host of ["gauntlet-home.vercel.app", "GAUNTLET-HOME.vercel.app", "localhost", "127.0.0.1", "[::1]", "app.localhost"]) {
      expect(movedTo(host)).toBeNull();
    }
  });

  it("points every other address at the gauntlet site", () => {
    for (const host of [
      "linkkit-lake.vercel.app",
      "linkkit-abc123-alexlcbrancos-projects.vercel.app",
      "gauntlet-home.vercel.app.evil.com",
      "localhost.example.com",
      "gauntlet-home-git-x-someone-else.vercel.app",
      "gauntlet-home-git-x-alexlcbrancos-projects.vercel.app.evil.com",
    ]) {
      expect(movedTo(host)).toBe(HOME_URL);
    }
  });

  it("runs on a preview of the gauntlet site (no automatic folder backups there)", () => {
    for (const host of ["gauntlet-home-git-phase-2-alexlcbrancos-projects.vercel.app", "gauntlet-home-8jc7nejqy-alexlcbrancos-projects.vercel.app"]) {
      expect(isPreviewAddress(host)).toBe(true);
      expect(movedTo(host)).toBeNull();
    }
    expect(isPreviewAddress("gauntlet-home.vercel.app")).toBe(false);
  });

  it("the target is itself an address that runs normally (no loop)", () => {
    expect(movedTo(new URL(HOME_URL).hostname)).toBeNull();
  });
});
