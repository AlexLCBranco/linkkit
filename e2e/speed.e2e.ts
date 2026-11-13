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


/** Drags from the middle of `from` to a point on the screen. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const r = (await from.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move((r.x + to.x) / 2, (r.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

const dot = (box: Locator) => box.locator("[title='Drag to another box to connect']");

test("B: a box's dot dragged onto empty paper adds a linked box there, name open", async ({ page }) => {
  await open(page);
  await newPlainMap(page);
  await addBoxAt(page, 400, 250, "Alpha");
  const alpha = named(page, "Alpha");

  await alpha.hover();
  await drag(page, dot(alpha), { x: 760, y: 520 });
  await expect(field(page)).toBeFocused();
  await expect(boxes(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
  await page.keyboard.type("Delta");
  await shot(page, "B");
  await clickAway(page);
  const d = await centre(named(page, "Delta"));
  expect(Math.abs(d.x - 760)).toBeLessThan(6);
  expect(Math.abs(d.y - 520)).toBeLessThan(6);
  // The arrow runs from Alpha to the new box: Alpha selected, Delta is what it needs.
  await alpha.click();
  await expect(named(page, "Delta")).toHaveAttribute("data-highlight", "teal");

  // One undo step.
  await clickAway(page);
  await page.keyboard.press("Control+z");
  await expect(boxes(page)).toHaveCount(1);
  await expect(arrows(page)).toHaveCount(0);
});

test("C: Enter keeps the chain going from the same parent; Esc, a click away or a blank Enter stops it and only the blank box goes", async ({ page }) => {
  await open(page);
  await newPlainMap(page);
  await addBoxAt(page, 300, 250, "Alpha");
  const alpha = named(page, "Alpha");

  // From the +: three names, Enter after each.
  await alpha.hover();
  await alpha.getByRole("button", { name: "Add a linked box" }).click();
  for (const name of ["One", "Two", "Three"]) {
    await expect(field(page)).toBeFocused();
    await page.keyboard.type(name);
    await page.keyboard.press("Enter");
  }
  // A fourth is open and blank: Esc stops, and only it goes.
  await expect(field(page)).toBeFocused();
  await expect(boxes(page)).toHaveCount(5);
  await shot(page, "C");
  await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  expect(await names(page)).toEqual(["Alpha", "One", "Two", "Three"]);
  await expect(arrows(page)).toHaveCount(3);
  // All three hang off Alpha, side by side.
  await alpha.click();
  for (const name of ["One", "Two", "Three"]) await expect(named(page, name)).toHaveAttribute("data-highlight", "teal");
  const [one, two, three] = await Promise.all(["One", "Two", "Three"].map((n) => centre(named(page, n))));
  expect(two.left).toBeGreaterThan(one.right);
  expect(three.left).toBeGreaterThan(two.right);
  expect(Math.abs(three.y - one.y)).toBeLessThan(3);

  // From a dot dragged onto the paper: the chain goes on beside that box; a click away stops it.
  await alpha.hover();
  await drag(page, dot(alpha), { x: 500, y: 560 });
  await page.keyboard.type("Four");
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Five");
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await clickAway(page);
  expect(await names(page)).toEqual(["Alpha", "One", "Two", "Three", "Four", "Five"]);
  const [four, five] = await Promise.all(["Four", "Five"].map((n) => centre(named(page, n))));
  expect(five.left).toBeGreaterThan(four.right);
  expect(Math.abs(five.y - four.y)).toBeLessThan(3);

  // A blank Enter stops it too.
  await alpha.hover();
  await alpha.getByRole("button", { name: "Add a linked box" }).click();
  await page.keyboard.type("Six");
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  expect(await names(page)).toEqual(["Alpha", "One", "Two", "Three", "Four", "Five", "Six"]);

  // A named box renamed to nothing stays (shown as "Untitled"), with its arrow.
  await named(page, "Six").dblclick();
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  await expect(boxes(page)).toHaveCount(7);
  await expect(arrows(page)).toHaveCount(6);
});

/** A new flowchart whose first step is named `start`. */
async function newFlowchart(page: Page, start: string) {
  await newMap(page, /^(Flowchart|Process)/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type(start);
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
}

/** A step's "Add next" menu, and one of its entries. */
async function addNext(page: Page, step: Locator, entry: string) {
  await step.hover();
  await step.getByRole("button", { name: "Add next" }).click();
  await page.getByRole("menuitem", { name: entry }).click();
  await expect(field(page)).toBeFocused();
}

test("D: in a flowchart Enter keeps the name and opens the next unnamed branch; after the last it stops", async ({ page }) => {
  await open(page);
  await newFlowchart(page, "Ready?");
  await addNext(page, named(page, "Ready?"), "Yes / No");
  await expect(boxes(page)).toHaveCount(3);
  const first = await typingIn(page);
  await page.keyboard.type("Go ahead");
  await page.keyboard.press("Enter");
  // The second branch is open now, not the first again.
  await expect(field(page)).toBeFocused();
  const second = await typingIn(page);
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  await page.keyboard.type("Stop");
  await shot(page, "D");
  await page.keyboard.press("Enter");
  // After the last branch typing ends.
  await expect(field(page)).toHaveCount(0);
  expect(await names(page)).toEqual(["Ready?", "Go ahead", "Stop"]);
});

const stepNumbers = (page: Page) => page.locator("[data-box-id] [aria-label^='Step ']");
const numbersSwitch = (page: Page) => page.getByRole("button", { name: "Step numbers" });

test("F: a new flowchart starts with its step numbers off; the header's Numbers switch turns them on, and that is kept", async ({ page }) => {
  await open(page);
  await newFlowchart(page, "Ready?");
  await addNext(page, named(page, "Ready?"), "Yes / No");
  await page.keyboard.type("Go");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Stop");
  await page.keyboard.press("Enter");
  await expect(boxes(page)).toHaveCount(3);
  await expect(stepNumbers(page)).toHaveCount(0);
  await expect(numbersSwitch(page)).toHaveAttribute("aria-pressed", "false");
  await shot(page, "F");

  // The switch still shows them, and the map keeps its setting over a reload.
  await numbersSwitch(page).click();
  await expect(stepNumbers(page)).toHaveCount(3);
  await page.waitForTimeout(1_500);
  await page.reload();
  await expect(page.locator("[data-ready]")).toBeVisible(READY);
  await expect(stepNumbers(page)).toHaveCount(3);
  await expect(numbersSwitch(page)).toHaveAttribute("aria-pressed", "true");
});

test("G: Tab on a new Choice's first branch, still blank, keeps every branch and moves on to the next; the keys typed next go into its name", async ({ page }) => {
  await open(page);
  await newFlowchart(page, "Which?");
  await addNext(page, named(page, "Which?"), "Choice");
  const branches = (await boxes(page).count()) - 1;
  expect(branches).toBeGreaterThanOrEqual(2);
  const first = await typingIn(page);
  expect(first).not.toBeNull();

  // Before 0.0.115 this Tab took every new branch away and left the focus on the page.
  await page.keyboard.press("Tab");
  await expect(boxes(page)).toHaveCount(branches + 1);
  await expect(field(page)).toBeFocused();
  const second = await typingIn(page);
  expect(second).not.toBe(first);

  // "N" is typed, not the Notes shortcut.
  await page.keyboard.type("Next one");
  await expect(field(page)).toHaveValue("Next one");
  await expect(page.getByRole("textbox", { name: /notes/i })).toHaveCount(0);
  await shot(page, "G");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(field(page)).toHaveCount(0);
  await expect(boxes(page)).toHaveCount(branches + 1);
  expect((await names(page)).filter(Boolean)).toEqual(["Which?", "Next one"]);
});
