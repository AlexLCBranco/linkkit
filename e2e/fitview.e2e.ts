import { expect, test, type Page } from "@playwright/test";

import { addChild, boxIds, mapMenu, newTree } from "./helpers";

/**
 * Fit to view on open (owner, 2026-10-19): a map bigger than the window
 * opens with every box on screen (zoomed out, never moved), and opening it
 * still writes nothing. At 957 px 14 of the owner's 18 maps opened with
 * boxes past the window's edge, out of sight.
 *
 * Throwaway data in a fresh browser profile: one tree, made here and
 * deleted at the end. Runs on the live site and on previews.
 *
 *   npm run e2e -- fitview
 */

// Made in a tall window, so no new box lands under the zoom pill.
const MAKE = { width: 1400, height: 1600 };
const OPEN_IN = [
  { width: 957, height: 910 },
  { width: 481, height: 910 },
];

const stored = (page: Page, id: string) => page.evaluate((id) => localStorage.getItem(`linkkit:map:${id}`), id);

/** Boxes not wholly inside the part of the canvas on screen. */
async function boxesOffScreen(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const view = {
      left: Math.max(0, main.left),
      top: Math.max(0, main.top),
      right: Math.min(window.innerWidth, main.right),
      bottom: Math.min(window.innerHeight, main.bottom),
    };
    return [...document.querySelectorAll<HTMLElement>("[data-box-id]")]
      .map((el) => ({ name: el.innerText.split("\n")[0].trim(), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left < view.left - 0.5 || r.top < view.top - 0.5 || r.right > view.right + 0.5 || r.bottom > view.bottom + 0.5)
      .map(({ name, r }) => `${name} at ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
  });
}

// Failed on v0.0.104 (11 of 19 boxes off screen at 957 x 910).
test("a map bigger than the window opens with every box on screen, and opening writes nothing", async ({ page }) => {
  await page.setViewportSize(MAKE);
  await page.goto("/linkkit/");
  await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });

  // Wider than 957 px (8 next steps side by side) and taller than 910 px
  // (a chain 10 deep under the first).
  await newTree(page, "Start");
  const start = (await boxIds(page)).Start;
  for (let i = 1; i <= 8; i++) await addChild(page, start, `Next step number ${i}`);
  let parent = (await boxIds(page))["Next step number 1"];
  for (let i = 1; i <= 10; i++) {
    await addChild(page, parent, `Deeper ${i}`);
    parent = (await boxIds(page))[`Deeper ${i}`];
  }
  const id = await page.evaluate(() => localStorage.getItem("linkkit:active")!);
  await page.waitForTimeout(1_500);
  const was = (await stored(page, id))!;
  const nodes = Object.values((JSON.parse(was) as { map: { nodes: Record<string, { x: number; y: number }> } }).map.nodes);
  expect(nodes).toHaveLength(19);
  // Really bigger than the 957 x 910 window (else this proves nothing).
  expect(Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x))).toBeGreaterThan(957);
  expect(Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y))).toBeGreaterThan(910);

  for (const size of OPEN_IN) {
    await page.setViewportSize(size);
    await page.reload();
    await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-box-id]")).toHaveCount(19);
    // Past Linkkit's save delay (400 ms) and any glide.
    await page.waitForTimeout(1_500);
    expect(await boxesOffScreen(page), `boxes off screen at ${size.width}x${size.height}`).toEqual([]);
    expect(await stored(page, id), `stored map after opening at ${size.width}x${size.height}`).toBe(was);
  }

  // The fit is never stored: no zoom of its own for this map. At 481 px it
  // is below the pill's 50%.
  expect(await page.evaluate(() => localStorage.getItem("linkkit:zoom"))).toBeNull();
  const pill = page.getByRole("button", { name: "Reset zoom to 100%" });
  const shown = async () => Number((await pill.innerText()).replace("%", ""));
  expect(await shown()).toBeLessThan(50);

  // The pill wins: its zoom is stored, and a reload opens at it, not fitted.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(pill).toHaveText("50%");
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("linkkit:zoom")))!)).toEqual({ [id]: 0.5 });
  await page.setViewportSize(OPEN_IN[0]);
  await page.reload();
  await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });
  await expect(pill).toHaveText("50%");
  expect(await stored(page, id)).toBe(was);

  // Clean up (to this throwaway profile's trash).
  await mapMenu(page, "This map", "Delete");
  await expect.poll(() => page.evaluate((id) => localStorage.getItem("linkkit:registry")!.includes(id), id)).toBe(false);
});
