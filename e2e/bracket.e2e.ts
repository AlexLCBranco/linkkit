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

  // + New → Bracket → 8 players: the first slot opens for typing.
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players", exact: true }).click();
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
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
});

test("bracket marquee: picks both semifinals and lights both their past paths", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/linkkit/");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.evaluate((text) => navigator.clipboard.writeText(text), NAMES.join("\n"));
  await page.keyboard.press("Control+V");
  await page.keyboard.press("Escape");
  // The top player wins each first-round match: Ann, Cat, Eve, Gus go on.
  for (const name of ["Ann", "Cat", "Eve", "Gus"]) await rows(page).getByText(name, { exact: true }).first().click();
  await expect.poll(() => rowTexts(page)).toEqual([...NAMES, "Ann", "Cat", "Eve", "Gus", "—", "—"]);
  await page.mouse.move(5, 400); // off every match, so nothing is hovered

  // Every match's look, top to bottom, round by round (7 of them).
  const looks = () =>
    page.locator("[data-box-id]").evaluateAll((els) =>
      els
        .map((el) => ({ top: el.getBoundingClientRect().top, left: el.getBoundingClientRect().left, look: el.getAttribute("data-highlight") ?? "-" }))
        .sort((a, b) => a.left - b.left || a.top - b.top)
        .map((m) => m.look),
    );

  // A thin strip down the semifinals' column, from above the first to
  // below the second: it touches both and nothing else.
  const semiTop = (await rows(page).nth(8).boundingBox())!;
  const semiBottom = (await rows(page).nth(11).boundingBox())!;
  const x = semiTop.x + semiTop.width / 2;
  await page.mouse.move(x, semiTop.y - 20);
  await page.mouse.down();
  await page.mouse.move(x + 10, semiBottom.y + semiBottom.height + 20, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(5, 400);

  // Round 1 (4), the semis (2), the final: both semis ringed, every
  // first-round match that fed them lit, nothing ahead.
  await expect.poll(looks).toEqual(["teal", "teal", "teal", "teal", "selected", "selected", "plain"]);
  await expect(page.getByText("2 matches selected")).toBeVisible();

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
});

/** The index (in `rows` order) of the row with keyboard focus, or -1. */
const focusedRow = (page: Page) =>
  rows(page).evaluateAll((els) => els.findIndex((el) => el === document.activeElement));

test("bracket keys: Enter and ↓ go down, ← → land on a match's top row, focus comes back after typing", async ({ page }) => {
  await page.goto("/linkkit/");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();

  // Type two names; Esc ends typing and focus is back on that row.
  await page.keyboard.type("Ann");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bob");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect.poll(() => focusedRow(page)).toBe(2);

  // Enter and ↓ go to the next row down; ↑ back up. Enter doesn't pick.
  await page.keyboard.press("Enter");
  await expect.poll(() => focusedRow(page)).toBe(3);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => focusedRow(page)).toBe(1);
  expect(await winners(page)).toBe("..............");

  // → from a bottom row lands on the next match's top row; ← too.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedRow(page)).toBe(3); // match 2's bottom row
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => focusedRow(page)).toBe(8); // semifinal 1's top row
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => focusedRow(page)).toBe(2); // match 2's top row

  // A click on the page leaves no row focused; ↓ starts on the selected
  // match's top row, else the first slot.
  await page.mouse.click(1300, 850);
  await expect.poll(() => focusedRow(page)).toBe(-1);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => focusedRow(page)).toBe(0);

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
});
