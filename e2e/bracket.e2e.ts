import { expect, test, type Page } from "@playwright/test";

/**
 * Bracket mode, end to end (owner's spec, reference/bracket-spec.md, step
 * b2): create an 8-player bracket, paste 8 names, play it to a champion,
 * change a round-1 result and check the cascade, undo it, reload and check
 * it's all still there. Then the bracket is deleted again.
 *
 * Runs in a fresh, empty browser profile (see playwright.config.ts), so the
 * owner's own maps are never in reach.
 *
 *   npm run e2e -- bracket                                    # the live site
 *   BRIDGE_SITE=http://localhost:5181 npm run e2e -- bracket  # the dev server
 */

const NAMES = ["Ann", "Bob", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal"];

/** Every player row, top to bottom and round by round (round 1's 8, the
    semifinals' 4, the final's 2). */
const rows = (page: Page) => page.locator("[data-player-row]");
const rowTexts = (page: Page) => rows(page).allInnerTexts();
/** Which rows are bold winners ("W") or not ("."), in row order. */
const winners = (page: Page) =>
  rows(page).evaluateAll((els) => els.map((el) => (el.closest("[data-winner]") ? "W" : ".")).join(""));
const championName = (page: Page) => page.getByText("Champion", { exact: true }).locator("xpath=..").innerText();

test("bracket: paste names, play to a champion, cascade, undo, reload", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/linkkit/");

  // + New bracket → 8 players: the first slot opens for typing.
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players" }).click();
  const field = page.getByRole("textbox", { name: "Player name" });
  await expect(field).toBeFocused();
  await expect(page.getByText("Quarterfinals")).toBeVisible();
  await expect(page.getByText("Semifinals")).toBeVisible();
  await expect(page.getByText("Final", { exact: true })).toBeVisible();
  // 14 rows, less the one being typed in.
  await expect(rows(page)).toHaveCount(13);

  // Paste 8 names into the first slot: one per slot, going down.
  await page.evaluate((text) => navigator.clipboard.writeText(text), NAMES.join("\n"));
  await page.keyboard.press("Control+V");
  await expect.poll(() => rowTexts(page)).toEqual([...NAMES, "—", "—", "—", "—", "—", "—"]);

  // Play it out: the top player wins every match. Round 1 by click, except
  // one match by keyboard (focus its row, Space).
  for (const name of ["Ann", "Cat", "Eve"]) await rows(page).getByText(name, { exact: true }).first().click();
  await rows(page).nth(6).focus();
  await page.keyboard.press("Space");
  await expect.poll(() => rowTexts(page)).toEqual([...NAMES, "Ann", "Cat", "Eve", "Gus", "—", "—"]);
  await rows(page).nth(8).click(); // Ann beats Cat
  await rows(page).nth(10).click(); // Eve beats Gus
  await rows(page).nth(12).click(); // Ann beats Eve in the final
  await expect.poll(() => championName(page)).toContain("Ann");
  expect(await winners(page)).toBe("W.W.W.W.W.W.W.");

  // Bob beats Ann after all: Ann's semifinal and final results go too.
  await rows(page).nth(1).click();
  await expect(page.getByRole("status")).toContainText("Cleared 2 later results");
  expect(await winners(page)).toBe(".WW.W.W...W...");
  // Eve keeps her place in the final: only Ann's path is cleared.
  expect(await rowTexts(page)).toEqual([...NAMES, "Bob", "Cat", "Eve", "Gus", "—", "Eve"]);
  await expect.poll(() => championName(page)).toContain("—");

  // Undo (the message's button): all of it comes back in one step.
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => championName(page)).toContain("Ann");
  expect(await winners(page)).toBe("W.W.W.W.W.W.W.");

  // Reload: names, results and the champion are all still there.
  await page.waitForTimeout(1_500); // the save is debounced
  await page.reload();
  await expect(rows(page)).toHaveCount(14);
  expect(await rowTexts(page)).toEqual([...NAMES, "Ann", "Cat", "Eve", "Gus", "Ann", "Eve"]);
  expect(await winners(page)).toBe("W.W.W.W.W.W.W.");
  await expect.poll(() => championName(page)).toContain("Ann");

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "Delete this map" }).click();
  await expect(rows(page)).toHaveCount(0);
});
