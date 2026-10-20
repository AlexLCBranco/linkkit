import { expect, test, type Page } from "@playwright/test";

import { box, mapMenu, newTree, READY } from "./helpers";

/**
 * Every header control is on screen and clickable in windows from just
 * above phone size (481 px) up. Before 0.0.103 the header was one row that
 * needed ~1064 px: below that the map switcher shrank to nothing, its
 * "Switch map" chevron sat under the "+" button, and the buttons on the
 * right ran off the window.
 *
 * Throwaway data in a fresh browser profile: one tree map, deleted at the
 * end. Runs on the live site and on previews.
 *
 *   npm run e2e -- header
 */

const WIDTHS = [481, 600, 768, 957, 1000, 1400];

/** Each header button is inside the window and is what a click at its
    middle reaches (nothing painted over it). */
async function everyButtonClickable(page: Page, width: number) {
  const buttons = page.locator("header button");
  const n = await buttons.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const name = (await b.getAttribute("aria-label")) ?? (await b.getAttribute("title")) ?? (await b.innerText());
    const r = (await b.boundingBox())!;
    expect(r.x, `"${name}" at ${width} px`).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width, `"${name}" at ${width} px`).toBeLessThanOrEqual(width);
    const hit = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
    expect(hit, `"${name}" covered at ${width} px`).toBe(true);
  }
}

async function switchMapOpens(page: Page, width: number) {
  await page.getByRole("button", { name: /^Switch map/ }).click({ timeout: 3_000 });
  await expect(page.getByRole("menuitem", { name: /^\+ New/ }), `menu at ${width} px`).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("every header control is clickable from 481 px wide up, in a plain map and a tree (nothing selected, then a box selected)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 910 });
  await page.goto("/linkkit/");
  await expect(page.locator("[data-ready]")).toBeVisible(READY);

  // The first map of a fresh profile: a plain connections map.
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 910 });
    await everyButtonClickable(page, width);
    await switchMapOpens(page, width);
  }

  // A tree with nothing selected: its "+" is greyed out (half see-through),
  // the case that painted it over "Switch map".
  await page.setViewportSize({ width: 1400, height: 910 });
  await newTree(page, "Header check");
  const tree = await page.evaluate(() => localStorage.getItem("linkkit:active")!);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("[data-ready]")).toBeVisible(READY);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 910 });
    await everyButtonClickable(page, width);
    await switchMapOpens(page, width);
  }

  // The same tree with its start box selected: "+" is enabled (opaque),
  // and the header is as wide as it gets in a tree.
  await page.setViewportSize({ width: 1400, height: 910 });
  const addBox = page.locator("header").getByRole("button", { name: "Add box" });
  await expect(addBox).toHaveAttribute("aria-disabled", "true");
  const start = await page.locator("[data-box-id]").first().getAttribute("data-box-id");
  await box(page, start!).click();
  await expect(addBox).toHaveAttribute("aria-disabled", "false");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 910 });
    await expect(addBox, `"+" enabled at ${width} px`).toHaveAttribute("aria-disabled", "false");
    await everyButtonClickable(page, width);
    await switchMapOpens(page, width);
    // Still selected after the menu closed: the next width checks the same case.
    await expect(addBox, `"+" still enabled at ${width} px`).toHaveAttribute("aria-disabled", "false");
  }

  // Clean up, in the narrow window the old header failed in.
  await page.setViewportSize({ width: 957, height: 910 });
  await mapMenu(page, "This map", "Delete");
  await expect.poll(() => page.evaluate((id) => localStorage.getItem("linkkit:registry")!.includes(id), tree)).toBe(false);
});
