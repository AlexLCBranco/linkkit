import { expect, test, type Page } from "@playwright/test";

import { addChild, box, boxIds, mapMenu, newTree } from "./helpers";

/**
 * Opening a map is read-only (owner, 2026-10-19): opening, reloading or
 * reopening a map, in a window of any size, never moves or saves anything.
 * A smaller window shows part of the map and scrolls. And a bracket is laid
 * out the same in every window: hiding and showing its first round again
 * in a narrow window puts every match back where a wide window put it.
 *
 * Throwaway data in a fresh browser profile: a bracket and a tree are made
 * here and deleted at the end. Runs on the live site and on previews.
 *
 *   npm run e2e -- readonly
 */

const WIDE = { width: 1915, height: 910 };
const SIZES = [WIDE, { width: 957, height: 910 }, { width: 1366, height: 768 }];
const PLAYERS = Array.from({ length: 32 }, (_, i) => `Player ${i + 1}`);

const stored = (page: Page, id: string) => page.evaluate((id) => localStorage.getItem(`linkkit:map:${id}`), id);
const activeId = (page: Page) => page.evaluate(() => localStorage.getItem("linkkit:active")!);
type Rec = { map: { nodes: Record<string, { x: number; y: number }>; page: { width: number; height: number } } };
const layoutOf = (text: string) => {
  const { map } = JSON.parse(text) as Rec;
  return { page: map.page, at: Object.fromEntries(Object.entries(map.nodes).map(([id, n]) => [id, [n.x, n.y]])) };
};

/** Opens map `id` as a reload does (the map open last), or in a whiteboard
    frame, and waits past Linkkit's save delay (400 ms). */
async function open(page: Page, id: string, how: "app" | "embed") {
  if (how === "app") {
    await page.evaluate((id) => localStorage.setItem("linkkit:active", id), id);
    await page.goto("/linkkit/");
  } else {
    await page.goto(`/linkkit/?embed=1&id=${encodeURIComponent(id)}`);
  }
  await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-box-id]").first()).toBeVisible();
  await page.waitForTimeout(1_500);
}

test("opening, reloading and reopening a bracket and a tree in three window sizes moves and saves nothing", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize(WIDE);
  await page.goto("/linkkit/");

  // A 32-player bracket, taller than every window here.
  await mapMenu(page, "+ New", "Bracket", "32 players");
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.evaluate((text) => navigator.clipboard.writeText(text), PLAYERS.join("\n"));
  await page.keyboard.press("Control+V");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-player-row]").getByText("Player 32", { exact: true })).toBeVisible();
  const bracket = await activeId(page);

  // A tree wider than half the window and taller than a laptop's: 8 next
  // steps side by side, and a chain 6 deep under the first.
  await newTree(page, "Start");
  let ids = await boxIds(page);
  for (let i = 1; i <= 8; i++) await addChild(page, ids.Start, `Next step number ${i}`);
  let parent = (await boxIds(page))["Next step number 1"];
  for (let i = 1; i <= 6; i++) {
    await addChild(page, parent, `Deeper ${i}`);
    parent = (await boxIds(page))[`Deeper ${i}`];
  }
  ids = await boxIds(page);
  await expect(box(page, ids["Deeper 6"])).toBeVisible();
  const tree = await activeId(page);
  await page.waitForTimeout(1_500);

  const was = { [bracket]: (await stored(page, bracket))!, [tree]: (await stored(page, tree))! };
  expect(Object.keys(layoutOf(was[tree]).at)).toHaveLength(15);
  // The tree really reaches past the smaller windows (else this proves nothing).
  const far = Object.values(layoutOf(was[tree]).at);
  expect(Math.max(...far.map(([x]) => x))).toBeGreaterThan(957);
  expect(Math.max(...far.map(([, y]) => y))).toBeGreaterThan(768 - 100);

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const [id, how] of [[bracket, "app"], [tree, "app"], [bracket, "app"], [tree, "embed"], [bracket, "embed"]] as const) {
      await open(page, id, how);
      for (const k of [bracket, tree]) expect(await stored(page, k), `${k === bracket ? "bracket" : "tree"} after opening the ${id === bracket ? "bracket" : "tree"} (${how}) at ${size.width}x${size.height}`).toBe(was[k]);
    }
    // A plain reload of the map open last, too.
    await page.reload();
    await expect(page.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_500);
    for (const k of [bracket, tree]) expect(await stored(page, k)).toBe(was[k]);
  }

  // The same bracket, laid out again in a narrow window (its first round
  // hidden, then shown again): every match and the page back exactly where
  // the wide window put them.
  await page.setViewportSize(SIZES[1]);
  await open(page, bracket, "app");
  const rounds = async (n: number) => {
    await page.getByRole("button", { name: "Rounds shown" }).click();
    await page.getByRole("menuitemradio").nth(n).click();
    await page.waitForTimeout(1_500);
  };
  await rounds(1);
  expect(layoutOf((await stored(page, bracket))!)).not.toEqual(layoutOf(was[bracket]));
  await rounds(0);
  expect(layoutOf((await stored(page, bracket))!)).toEqual(layoutOf(was[bracket]));

  // Clean up: both maps go (to the trash of this throwaway profile). In
  // the wide window: at 957 px the toolbar's "+" covers "Switch map".
  await page.setViewportSize(WIDE);
  for (const id of [bracket, tree]) {
    await open(page, id, "app");
    await page.getByRole("button", { name: /Switch map/ }).click();
    await page.getByRole("menuitem", { name: "This map" }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect.poll(() => page.evaluate((id) => localStorage.getItem("linkkit:registry")!.includes(id), id)).toBe(false);
  }
});
