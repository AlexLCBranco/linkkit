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

test("E: a Choice starts with two branches and no labels; its + adds one more", async ({ page }) => {
  await open(page);
  await newFlowchart(page, "Drink?");
  const choice = named(page, "Drink?");
  await addNext(page, choice, "Choice");
  // Two branches (three boxes with the Choice itself), and no "Option A/B/C" on the arrows.
  await expect(boxes(page)).toHaveCount(3);
  await expect(arrows(page)).toHaveCount(2);
  await expect(page.getByText(/Option [A-Z]/)).toHaveCount(0);
  await page.keyboard.type("Tea");
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Coffee");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);

  // One more branch: the Choice's own +, name open, still unlabelled.
  await choice.hover();
  const more = choice.getByRole("button", { name: "Add a branch" });
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute("title", /another branch/);
  await shot(page, "E");
  await more.click();
  await expect(field(page)).toBeFocused();
  await expect(boxes(page)).toHaveCount(4);
  await page.keyboard.type("Water");
  await page.keyboard.press("Enter");
  await expect(field(page)).toHaveCount(0);
  expect(await names(page)).toEqual(["Drink?", "Tea", "Coffee", "Water"]);
  await expect(arrows(page)).toHaveCount(3);
  await expect(page.getByText(/Option [A-Z]/)).toHaveCount(0);
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

test("H: the + New entries say what you get, the decision tree first, and each still makes its kind", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Switch map/ }).click();
  await page.getByRole("menuitem", { name: /^\+ New/ }).click();
  const entries = (await page.getByRole("menu").last().getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  expect(entries.slice(0, 4)).toEqual([
    "Decision tree (arranges itself)",
    "Flowchart (Yes/No and choices, arranges itself)",
    "Free map (you place the boxes)",
    "Bracket",
  ]);
  // Each "?" says the same thing in a sentence.
  await page.getByRole("menuitem", { name: /^Flowchart/ }).getByRole("button", { name: "What is this?" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("A flowchart");
  await shot(page, "H");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Decision tree: a start box, and a child from its +.
  await newMap(page, /^Decision tree/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Start here");
  await page.keyboard.press("Enter");
  await named(page, "Start here").hover();
  await expect(named(page, "Start here").getByRole("button", { name: "Add a child", exact: true })).toBeVisible();

  // Flowchart: a first step with the Add next menu.
  await newFlowchart(page, "First");
  await named(page, "First").hover();
  await expect(named(page, "First").getByRole("button", { name: "Add next" })).toBeVisible();

  // Free map: empty paper; a double-click adds a box that stands on its own.
  await newPlainMap(page);
  await addBoxAt(page, 500, 300, "Loose");
  await named(page, "Loose").hover();
  await expect(named(page, "Loose").getByRole("button", { name: "Add a linked box" })).toBeVisible();
});

const cursorAt = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => getComputedStyle(document.elementFromPoint(px, py)!).cursor, [x, y]);

/** A press at `from`, dragged to `to` in a few steps, let go there. */
async function dragPoints(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("I: a band round a box's border starts an arrow from any side; the middle still moves the box; relinking and the marquee still work", async ({ page }) => {
  await open(page);
  await newPlainMap(page);
  await addBoxAt(page, 400, 300, "Alpha");
  await addBoxAt(page, 800, 300, "Beta");
  const alpha = named(page, "Alpha");
  const beta = named(page, "Beta");
  const a = await centre(alpha);
  const b = await centre(beta);

  // 3 px inside each side, and 2 px outside the left one: a crosshair, and a drag from there draws the arrow.
  const starts = {
    left: { x: a.left + 3, y: a.y },
    top: { x: a.x, y: a.top + 3 },
    bottom: { x: a.x, y: a.bottom - 3 },
    right: { x: a.right - 3, y: a.top + 5 },
    "just outside": { x: a.left - 2, y: a.y },
  };
  for (const [side, from] of Object.entries(starts)) {
    await page.mouse.move(from.x, from.y);
    // The toolbar eases into place over the box's top edge for a moment.
    await page.waitForTimeout(300);
    expect(await cursorAt(page, from.x, from.y), `cursor on the ${side} band`).toBe("crosshair");
    await page.mouse.down();
    await page.mouse.move((from.x + b.x) / 2, (from.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    if (side === "top") await shot(page, "I");
    await page.mouse.up();
    await expect(arrows(page), `an arrow from the ${side} band`).toHaveCount(1);
    expect((await centre(alpha)).x, "the box did not move").toBeCloseTo(a.x, 0);
    await page.keyboard.press("Control+z");
    await expect(arrows(page)).toHaveCount(0);
  }

  // The middle: the open hand, and a drag moves the box (no arrow).
  expect(await cursorAt(page, a.x, a.y)).toBe("grab");
  await dragPoints(page, { x: a.x, y: a.y }, { x: a.x + 60, y: a.y + 150 });
  const moved = await centre(alpha);
  expect(moved.x - a.x).toBeGreaterThan(50);
  expect(moved.y - a.y).toBeGreaterThan(140);
  await expect(arrows(page)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await centre(alpha)).x)).toBe(Math.round(a.x));

  // A click on the band selects the box; a double-click there renames it.
  await clickAway(page);
  await page.mouse.click(a.left + 3, a.y);
  await expect(alpha).toHaveAttribute("data-highlight", "selected");
  await page.mouse.dblclick(a.left + 3, a.y);
  await expect(field(page)).toBeFocused();
  await page.keyboard.press("Escape");
  // Nothing selected again: the status line is as it was, and so is where the boxes are on screen.
  await clickAway(page);
  expect(Math.round((await centre(alpha)).y)).toBe(Math.round(a.y));

  // From the band onto bare paper: a new linked box there (item B), and an arrow to a box as before.
  await dragPoints(page, starts.bottom, { x: 400, y: 560 });
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Gamma");
  await clickAway(page);
  await dragPoints(page, starts.top, { x: b.x, y: b.y });
  await expect(arrows(page)).toHaveCount(2);

  // Relinking: pick the arrow to Beta and drag its far end onto a third box.
  const g = await centre(named(page, "Gamma"));
  const ends = page.locator(".react-flow__edge circle");
  await addBoxAt(page, 800, 560, "Delta");
  const d = await centre(named(page, "Delta"));
  await page.mouse.click(a.right + (b.left - a.right) * 0.25, a.y);
  await expect(ends).toHaveCount(2);
  const toEnd = (await ends.nth(1).boundingBox())!;
  await dragPoints(page, { x: toEnd.x + toEnd.width / 2, y: toEnd.y + toEnd.height / 2 }, { x: d.x, y: d.y });
  await clickAway(page);
  await alpha.click();
  await expect(named(page, "Delta")).toHaveAttribute("data-highlight", "teal");
  await expect(beta).not.toHaveAttribute("data-highlight", "teal");
  await expect(arrows(page)).toHaveCount(2);

  // The marquee: a drag across bare paper picks the boxes it holds.
  await clickAway(page);
  await dragPoints(page, { x: a.left - 60, y: a.top - 40 }, { x: b.right + 40, y: b.bottom + 30 });
  await expect(page.locator("[data-box-id][data-picked]")).toHaveCount(2);
  expect(g.y).toBeGreaterThan(b.bottom + 30);
});

test("I: in a decision tree the band starts an arrow too (onto the paper: a child)", async ({ page }) => {
  await open(page);
  await newMap(page, /^Decision tree/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Start");
  await page.keyboard.press("Enter");
  const s = await centre(named(page, "Start"));
  await dragPoints(page, { x: s.x, y: s.bottom - 3 }, { x: s.x + 200, y: s.y + 250 });
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Child");
  await page.keyboard.press("Enter");
  await expect(boxes(page)).toHaveCount(2);
  await expect(arrows(page)).toHaveCount(1);
});

/**
 * Ctrl+V with `text` on the clipboard, without touching the PC's real
 * clipboard: the key first (Linkkit's own copied boxes take it), then,
 * as the browser does when the key was left alone, the paste event with
 * the text. Says which of the two took it, or "none".
 */
const pasteText = (page: Page, text: string) =>
  page.evaluate((t) => {
    const key = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    if (key.defaultPrevented) return "boxes";
    const data = new DataTransfer();
    data.setData("text/plain", t);
    const paste = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    document.body.dispatchEvent(paste);
    return paste.defaultPrevented ? "list" : "none";
  }, text);

/** Whether two boxes overlap on screen. */
async function overlap(one: Locator, other: Locator) {
  const [p, q] = [await centre(one), await centre(other)];
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
}

test("J: a list pasted with a box selected adds its lines under that box; with nothing selected, as new boxes; copied boxes still come first", async ({ page }) => {
  await open(page);
  await newPlainMap(page);
  await addBoxAt(page, 400, 200, "Alpha");
  const alpha = named(page, "Alpha");

  // The Tips line says so.
  await expect(page.getByText(/paste it here \(Ctrl\+V\): each line becomes a box/)).toBeVisible();

  // One box selected: three lines, three boxes under it.
  await alpha.click();
  expect(await pasteText(page, "Milk\nEggs\nFlour")).toBe("list");
  await expect(boxes(page)).toHaveCount(4);
  await expect(arrows(page)).toHaveCount(3);
  expect(await names(page)).toEqual(["Alpha", "Milk", "Eggs", "Flour"]);
  for (const name of ["Milk", "Eggs", "Flour"]) await expect(named(page, name)).toHaveAttribute("data-highlight", "teal");
  // Placed below it, clear of each other.
  await expect.poll(async () => (await centre(named(page, "Milk"))).y - (await centre(alpha)).y).toBeGreaterThan(60);
  await page.waitForTimeout(400);
  expect(await overlap(named(page, "Milk"), named(page, "Eggs"))).toBe(false);
  expect(await overlap(named(page, "Eggs"), named(page, "Flour"))).toBe(false);

  // One undo step for the whole list.
  await clickAway(page);
  await page.keyboard.press("Control+z");
  await expect(boxes(page)).toHaveCount(1);
  await page.keyboard.press("Control+y");
  await expect(boxes(page)).toHaveCount(4);

  // Nothing selected: the lines become boxes of their own, no arrows added, on screen and clear of the rest.
  await clickAway(page);
  expect(await pasteText(page, "Red\nGreen")).toBe("list");
  await expect(boxes(page)).toHaveCount(6);
  await expect(arrows(page)).toHaveCount(3);
  await page.waitForTimeout(400);
  for (const name of ["Red", "Green"]) {
    const at = await centre(named(page, name));
    expect(at.left).toBeGreaterThan(0);
    expect(at.right).toBeLessThan(1400);
    expect(at.top).toBeGreaterThan(100);
    expect(at.bottom).toBeLessThan(900);
    for (const other of ["Alpha", "Milk", "Eggs", "Flour"]) expect(await overlap(named(page, name), named(page, other)), `${name} over ${other}`).toBe(false);
  }
  await shot(page, "J");

  // One line of text is not a list: nothing happens.
  await clickAway(page);
  expect(await pasteText(page, "Just one line")).toBe("none");
  await expect(boxes(page)).toHaveCount(6);

  // Boxes copied in Linkkit come first: Ctrl+V pastes them, not the text.
  await alpha.click();
  await page.keyboard.press("Control+c");
  expect(await pasteText(page, "Blue\nPink")).toBe("boxes");
  await expect(boxes(page)).toHaveCount(7);
  expect((await names(page)).filter((n) => n === "Alpha")).toHaveLength(2);
  expect(await names(page)).not.toContain("Blue");
});

test("J: in a decision tree a pasted list becomes children of the selected box", async ({ page }) => {
  await open(page);
  await newMap(page, /^Decision tree/);
  await expect(field(page)).toBeFocused();
  await page.keyboard.type("Dinner");
  await page.keyboard.press("Enter");
  await named(page, "Dinner").click();
  expect(await pasteText(page, "Cook\nOrder in\nGo out")).toBe("list");
  await expect(boxes(page)).toHaveCount(4);
  await expect(arrows(page)).toHaveCount(3);
  // With nothing selected a tree takes no loose boxes.
  await clickAway(page);
  expect(await pasteText(page, "Loose\nBoxes")).toBe("none");
  await expect(boxes(page)).toHaveCount(4);
});
