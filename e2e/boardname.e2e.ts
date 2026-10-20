import { expect, test, type Page } from "@playwright/test";

import { addChild, boxIds, mapMenu, newTree } from "./helpers";

/**
 * A board renamed in Boardkit (owner, 2026-10-19): a linked map is named
 * after its board, but opening a map writes nothing, so Linkkit's own list
 * and record keep the old name until the map's next edit. Every place that
 * shows the map's name shows the board's new one anyway: Linkkit's header
 * and map list (with another map open, after switching, after a reload),
 * "Map from a Boardkit board…" ("Linked to …"), Boardkit's delete-board
 * question and the gauntlet canvas's "Add a stone" list. And none of that
 * writes a byte of Linkkit's maps or list.
 *
 * Throwaway data in a fresh browser profile on the shared site: one linked
 * map and its board, both deleted at the end. Runs on the live site and on
 * localhost (`node scripts/local-e2e.mjs` in gauntlet).
 *
 *   npm run e2e -- boardname
 */

const NAME = "ZZ board name test";
const RENAMED = "ZZ board renamed";
const endsWith = (name: string) => new RegExp(name + "$");
const startsWith = (name: string) => new RegExp("^" + name);

/** Linkkit's maps and map list, as stored. */
const linkkitData = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("linkkit:map:") || k === "linkkit:registry")
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );

/** The map menu's items, which list the maps. */
async function listedNames(lk: Page): Promise<string[]> {
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  const names = await lk.getByRole("menuitem").allInnerTexts();
  await lk.keyboard.press("Escape");
  await expect(lk.getByRole("menu")).toHaveCount(0);
  // The open map's item starts with a tick on its own line.
  return names.map((n) => n.trim().split("\n").at(-1)!.trim());
}

async function ready(lk: Page) {
  await expect(lk.locator("[data-ready]")).toBeVisible({ timeout: 15_000 });
}

test("a board renamed in Boardkit shows its new name everywhere its linked map is named, writing nothing", async ({ context }) => {
  // Boardkit first: Linkkit offers "Link to Boardkit" only once Boardkit's
  // data is here.
  const first = await context.newPage();
  await first.goto("/boardkit/");
  const notNow = first.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) await notNow.click();
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await ready(lk);

  // A tree linked to a new board.
  await newTree(lk, NAME);
  await addChild(lk, (await boxIds(lk))[NAME], "List A");
  await mapMenu(lk, "This map", "Link to Boardkit…");
  await lk.getByRole("alertdialog").getByRole("button", { name: "Link", exact: true }).click();
  await expect(lk.getByText("Linked to Boardkit")).toBeVisible();
  const linked = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);

  // The board, opened from Linkkit.
  const popup = context.waitForEvent("page");
  await lk.getByRole("link", { name: "Open in Boardkit" }).click();
  const bk = await popup;
  await bk.waitForLoadState();
  await first.close();
  await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(NAME);

  // Another map open in Linkkit, so the linked one is only in its list.
  await lk.bringToFront();
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: "+ New", exact: true }).click();
  await lk.getByRole("menuitem", { name: /^Map(?! with)/ }).click();
  await lk.keyboard.press("Escape");
  await lk.waitForTimeout(1_000);
  const other = await lk.evaluate(() => localStorage.getItem("linkkit:active")!);
  expect(other).not.toBe(linked);

  // Renamed in Boardkit.
  await bk.bringToFront();
  await bk.getByRole("button", { name: "Board name" }).click();
  await bk.keyboard.press("Control+a");
  await bk.keyboard.type(RENAMED);
  await bk.keyboard.press("Enter");
  await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(RENAMED);
  await expect.poll(() => bk.evaluate(() => localStorage.getItem("boardkit:registry")!)).toContain(RENAMED);
  // Linkkit's own copy still has the old name: nothing has edited the map.
  const before = await linkkitData(lk);
  expect(before["linkkit:registry"]).toContain(NAME);
  expect(before["linkkit:registry"]).not.toContain(RENAMED);

  // Linkkit, the other map open: the list follows the rename at once (the
  // storage event), and after a reload.
  await lk.bringToFront();
  await expect.poll(() => listedNames(lk)).toContain(RENAMED);
  expect(await listedNames(lk)).not.toContain(NAME);
  await lk.reload();
  await ready(lk);
  expect(await listedNames(lk)).toContain(RENAMED);

  // "Map from a Boardkit board…": greyed, linked to the map by its new name.
  await mapMenu(lk, "+ New", "From a Boardkit board…");
  const dialog = lk.getByRole("alertdialog");
  const row = dialog.getByRole("radio", { name: startsWith(RENAMED) });
  await expect(row).toBeDisabled();
  await expect(row).toContainText(`Linked to “${RENAMED}”.`);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // Switching to it: the header and the list say the new name.
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: endsWith(RENAMED) }).click();
  await ready(lk);
  await expect(lk.getByRole("button", { name: RENAMED, exact: true })).toBeVisible();
  expect(await listedNames(lk)).toContain(RENAMED);
  await lk.waitForTimeout(1_500);

  // The gauntlet canvas's "Add a stone" list names it after the board too:
  // the board and its map.
  const canvas = await context.newPage();
  await canvas.goto("/");
  await canvas.getByRole("button", { name: "+ Add stone" }).click();
  const picks = canvas.getByRole("dialog", { name: "Add a stone" });
  await expect(picks.getByRole("button", { name: startsWith(RENAMED) })).toHaveCount(2);
  await expect(picks.getByRole("button", { name: startsWith(NAME) })).toHaveCount(0);
  await canvas.close();

  // Boardkit's delete-board question names the map by the board's new name.
  await bk.bringToFront();
  await bk.getByRole("button", { name: "Switch board" }).click();
  await bk.getByRole("menuitem", { name: "Delete this board…" }).click();
  const ask = bk.getByRole("alertdialog");
  await expect(ask).toContainText(`“${RENAMED}” is also a map in Linkkit`);
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);

  // Not one byte of Linkkit's maps or list was written by any of that.
  expect(await linkkitData(lk)).toEqual(before);

  // Clean up: the map to Linkkit's trash, then the board.
  await lk.bringToFront();
  await mapMenu(lk, "This map", "Delete");
  await expect.poll(() => lk.evaluate((id) => localStorage.getItem("linkkit:registry")!.includes(id), linked)).toBe(false);
  await bk.bringToFront();
  await bk.reload();
  await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(RENAMED);
  await bk.getByRole("button", { name: "Switch board" }).click();
  await bk.getByRole("menuitem", { name: "Delete this board…" }).click();
  await bk.getByRole("alertdialog").getByRole("button", { name: "Delete board" }).click();
  await expect(bk.getByRole("button", { name: "Board name" })).not.toHaveText(RENAMED);
});
