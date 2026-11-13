import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

import { READY } from "./helpers";

/**
 * Making a map fast (the speed round, v0.0.115): each click flow of items
 * A to J, on throwaway maps in a fresh browser profile (nothing of the
 * owner's is in reach, and the profile goes when the test ends).
 *
 *   npm run e2e -- speed                                      # the live site
 *   BRIDGE_SITE=http://localhost:5181 npm run e2e -- speed    # the dev server
 *
 * Each test leaves a 1400 x 900 screenshot of what it checked in
 * playwright-report/speed-round/after-<item>.png.
 */

const SHOTS = "playwright-report/speed-round";
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, item: string) => page.screenshot({ path: `${SHOTS}/after-${item}.png` });

const field = (page: Page) => page.getByRole("textbox", { name: "Box name" });
const pane = (page: Page) => page.locator(".react-flow__pane");
const boxes = (page: Page) => page.locator("[data-box-id]");
const named = (page: Page, name: string): Locator => boxes(page).filter({ hasText: name });
const arrows = (page: Page) => page.locator(".react-flow__edge");
/** The box whose name is being typed (its id), or null. */
const typingIn = (page: Page) =>
  page.evaluate(() => (document.activeElement?.tagName === "TEXTAREA" ? (document.activeElement.closest("[data-box-id]")?.getAttribute("data-box-id") ?? null) : null));
/** Every box's name, in the order they were made ("" for an unnamed one). */
const names = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-box-id] [class*='name']")].map((el) => (el.innerText.trim() === "Untitled" ? "" : el.innerText.trim())));
const centre = async (box: Locator) => {
  const r = (await box.boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, ...{ left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height } };
};

async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/linkkit/");
  await expect(page.locator("[data-ready]")).toBeVisible(READY);
}

/** "+ New" and the entry whose name starts with one of `starts`. */
async function newMap(page: Page, entry: RegExp) {
  await page.getByRole("button", { name: /^Switch map/ }).click();
  await page.getByRole("menuitem", { name: /^\+ New/ }).click();
  await page.getByRole("menuitem", { name: entry }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** A new map without tree rules, its name left as it is. */
async function newPlainMap(page: Page) {
  await newMap(page, /^(Free map|Map What)/);
  await page.keyboard.press("Enter");
  await expect(boxes(page)).toHaveCount(0);
}

/** Double-click the paper there and type a name; a click away keeps it. */
async function addBoxAt(page: Page, x: number, y: number, name: string) {
  await pane(page).dblclick({ position: { x, y } });
  await expect(field(page)).toBeFocused();
  await page.keyboard.type(name);
  await clickAway(page);
}

/** A click on bare paper, bottom right: typing ends, the text is kept. */
async function clickAway(page: Page) {
  await pane(page).click({ position: { x: 1300, y: 740 } });
  await expect(field(page)).toHaveCount(0);
}

test("A: a plain map's + adds a linked box beside the box, name open, stepped aside when taken, one undo step", async ({ page }) => {
  await open(page);
  await newPlainMap(page);
  await addBoxAt(page, 400, 250, "Alpha");
  const alpha = named(page, "Alpha");

  await alpha.hover();
  await alpha.getByRole("button", { name: "Add a linked box" }).click();
  await expect(field(page)).toBeFocused();
  await expect(boxes(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
  await page.keyboard.type("Beta");
  await clickAway(page);
  const a = await centre(alpha);
  const b = await centre(named(page, "Beta"));
  // The tree's offset, top-down: straight below.
  expect(Math.abs(b.x - a.x)).toBeLessThan(3);
  expect(b.y - a.y).toBeGreaterThan(80);
  expect(b.y - a.y).toBeLessThan(120);

  // Again: the spot is taken, so the next one steps aside, level with it.
  await alpha.hover();
  await alpha.getByRole("button", { name: "Add a linked box" }).click();
  await page.keyboard.type("Gamma");
  await clickAway(page);
  const g = await centre(named(page, "Gamma"));
  expect(Math.abs(g.y - b.y)).toBeLessThan(3);
  expect(g.left).toBeGreaterThan(b.right);
  await expect(arrows(page)).toHaveCount(2);
  await alpha.hover();
  await shot(page, "A");

  // One undo step takes the box, its arrow and its name back together.
  await clickAway(page);
  await page.keyboard.press("Control+z");
  await expect(boxes(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
  expect(await names(page)).toEqual(["Alpha", "Beta"]);
});

