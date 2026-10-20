import { expect, test, type Page } from "@playwright/test";

import { READY } from "./helpers";

/**
 * The tips under the header ("Click any box to see what it needs…" and
 * "Start from a template or example…") sit behind a small "Tips" toggle
 * (owner, 2026-10-19): open from 700 px wide up, closed below, until the
 * user toggles them; then that choice (`linkkit:ui-prefs`) wins over the
 * width, after a reload too. A view preference only: no map is written.
 *
 * Throwaway data in a fresh browser profile: only the first-visit example,
 * and the preference this test sets. Runs on the live site and on previews.
 *
 *   npm run e2e -- tips
 */

const NARROW = { width: 481, height: 910 };
const WIDE = { width: 1400, height: 910 };

const mapRecords = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("linkkit:map:") || k === "linkkit:registry")
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );
const canvasTop = async (page: Page) => (await page.locator("main").boundingBox())!.y;
const toggle = (page: Page) => page.getByRole("button", { name: "Tips" });
const hint = (page: Page) => page.getByText(/^Click any box to see what it needs/);
const templates = (page: Page) => page.getByRole("button", { name: "Start from a template or example…" });

async function ready(page: Page) {
  await expect(page.locator("[data-ready]")).toBeVisible(READY);
  await expect(page.locator("[data-box-id]").first()).toBeVisible();
}

test("tips start closed below 700 px, open from 700 px, and the user's choice wins and survives a reload", async ({ page }) => {
  // The first visit: the example map, saved once it is tidied.
  await page.setViewportSize(WIDE);
  await page.goto("/linkkit/");
  await ready(page);
  await page.waitForTimeout(1_500);
  // Open at 1400 px, with the template link.
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(hint(page)).toBeVisible();
  await expect(templates(page)).toBeVisible();
  const before = await mapRecords(page);

  // 481 px: closed, so the map starts higher than with the tips open
  // (measured by opening them, at the same width).
  await page.setViewportSize(NARROW);
  await page.reload();
  await ready(page);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(hint(page)).toHaveCount(0);
  await expect(templates(page)).toHaveCount(0);
  const closedTop = await canvasTop(page);
  expect(await page.evaluate(() => localStorage.getItem("linkkit:ui-prefs")), "nothing stored before a toggle").toBeNull();

  // Toggling opens them; the template link is in them.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(hint(page)).toBeVisible();
  await expect(templates(page)).toBeVisible();
  const openTop = await canvasTop(page);
  expect(closedTop, "the map starts higher with the tips closed").toBeLessThan(openTop - 30);

  // The choice survives a reload at 481 px, where the default is closed.
  await page.reload();
  await ready(page);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(hint(page)).toBeVisible();

  // Closed by hand, they stay closed at 1400 px, where the default is open.
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize(WIDE);
  await page.reload();
  await ready(page);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(hint(page)).toHaveCount(0);

  // The template link still opens the gallery, from the open tips.
  await toggle(page).click();
  await templates(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Not one map byte changed; only the preference was stored.
  await page.waitForTimeout(1_000);
  expect(await mapRecords(page)).toEqual(before);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("linkkit:ui-prefs")))!)).toEqual({ tips: "open" });
});

test("with storage unavailable the tips still render and toggle", async ({ page }) => {
  // Every storage call throws, as in a locked-down browser.
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", { get: fail, configurable: true });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize(NARROW);
  await page.goto("/linkkit/");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(hint(page)).toBeVisible();
  expect(errors.filter((e) => /ui-prefs|tips/i.test(e))).toEqual([]);
});
