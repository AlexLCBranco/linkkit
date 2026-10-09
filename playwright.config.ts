import { defineConfig } from "@playwright/test";

/**
 * End-to-end checks of Linkkit and Boardkit together (BRIDGE-CHECKLIST.md
 * steps 3-6 and 8). Kept apart from vitest: these drive the real apps on the
 * shared site in a real browser, so they are slow and need the network.
 *
 * Each run gets a fresh, empty browser profile, so the owner's own maps and
 * boards (in their everyday browser) are never in reach. Edge is used
 * because it ships with Windows: no browser download needed.
 *
 *   npm run e2e                                    # the live shared site
 *   BRIDGE_SITE=http://localhost:3000 npm run e2e  # another copy of it
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 5 * 60_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    baseURL: process.env.BRIDGE_SITE ?? "https://gauntlet-home.vercel.app",
    channel: "msedge",
    viewport: { width: 1400, height: 900 },
  },
});
