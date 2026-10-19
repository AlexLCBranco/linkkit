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
  await expect(page.getByText("Semifinals", { exact: true })).toBeVisible();
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

test("bracket rounds: hiding the first rounds closes up the rest, survives a reload, and comes back", async ({ page, context }) => {
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
  for (const name of ["Ann", "Cat", "Eve", "Gus"]) await rows(page).getByText(name, { exact: true }).first().click();
  await expect.poll(() => rowTexts(page)).toEqual([...NAMES, "Ann", "Cat", "Eve", "Gus", "—", "—"]);
  const firstMatchLeft = async () => (await rows(page).first().boundingBox())!.x;
  const leftBefore = await firstMatchLeft();

  // Rounds ▸ Semifinals: the quarterfinals go, the semifinals take their
  // place on the left.
  await page.getByRole("button", { name: "Rounds shown" }).click();
  await page.getByRole("menuitemradio", { name: "Semifinals" }).click();
  await expect.poll(() => rowTexts(page)).toEqual(["Ann", "Cat", "Eve", "Gus", "—", "—"]);
  await expect(page.getByText("Quarterfinals")).toHaveCount(0);
  await expect(page.getByText("Semifinals", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rounds shown" })).toHaveText("From Semifinals");
  await expect.poll(firstMatchLeft).toBeCloseTo(leftBefore, 0);

  // Still played as usual: Ann beats Cat, and moves on.
  await rows(page).first().click();
  await expect.poll(() => rowTexts(page)).toEqual(["Ann", "Cat", "Eve", "Gus", "Ann", "—"]);

  // A reload keeps the choice.
  await page.waitForTimeout(1_500); // the save is debounced
  await page.reload();
  await expect.poll(() => rowTexts(page)).toEqual(["Ann", "Cat", "Eve", "Gus", "Ann", "—"]);

  // Back to every round: the quarterfinals return with their results.
  await page.getByRole("button", { name: "Rounds shown" }).click();
  await page.getByRole("menuitemradio", { name: /Quarterfinals/ }).click();
  await expect.poll(() => rowTexts(page)).toEqual([...NAMES, "Ann", "Cat", "Eve", "Gus", "Ann", "—"]);
  await expect(page.getByRole("button", { name: "Rounds shown" })).toHaveText("Rounds");
  expect(await winners(page)).toBe("W.W.W.W.W.....");

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
});

test("bracket pinned rounds: the later rounds stay still while the rest scrolls, survive a reload, and let go", async ({ page }) => {
  await page.goto("/linkkit/");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "32 players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.keyboard.press("Escape");

  const view = page.locator("[data-map-view]");
  const scrollTo = (top: number) => view.evaluate((v, t) => v.scrollTo(0, t), top);
  // Round 1's first row, and the quarterfinals' first (after round 1's 32
  // rows and round 2's 16).
  const yOf = async (n: number) => (await rows(page).nth(n).boundingBox())!.y;
  const pin = async (item: string) => {
    await page.getByRole("button", { name: "Rounds shown" }).click();
    await page.getByRole("menuitem", { name: "Keep on screen" }).click();
    await page.getByRole("menuitemradio", { name: item }).click();
  };

  await pin("Quarterfinals on");
  await expect(page.getByRole("button", { name: "Rounds shown" })).toHaveAttribute("aria-pressed", "true");
  const round1 = await yOf(0);
  const quarters = await yOf(48);
  const heading = page.getByText("Quarterfinals", { exact: true });
  const headingY = (await heading.boundingBox())!.y;

  // The pinned block sits in the middle of the screen: the final, its
  // middle, is level with the screen's middle below the headings (60px).
  const middle = async () => {
    const box = (await view.boundingBox())!;
    const final = (await rows(page).nth(60).boundingBox())!;
    return final.y + final.height - (box.y + 60 + (box.height - 60) / 2);
  };
  expect(Math.abs(await middle())).toBeLessThan(8);

  // Scrolled down: round 1 goes up the screen, the quarterfinals and their
  // heading stay put.
  await scrollTo(600);
  await expect.poll(() => yOf(0)).toBeCloseTo(round1 - 600, 0);
  await expect.poll(() => yOf(48)).toBeCloseTo(quarters, 0);
  expect((await heading.boundingBox())!.y).toBeCloseTo(headingY, 0);
  expect(Math.abs(await middle())).toBeLessThan(8);

  // Not even for a frame: read in the same moment as the scroll, before
  // any script could react to it, the pinned rows have not moved while
  // round 1 has.
  const moved = await view.evaluate((v) => {
    const pinned = v.querySelector("[data-pinned-layer] [data-player-row]")!;
    const first = v.querySelector("[data-player-row]")!;
    const before = [pinned.getBoundingClientRect().y, first.getBoundingClientRect().y];
    v.scrollTop -= 300;
    return [pinned.getBoundingClientRect().y - before[0], first.getBoundingClientRect().y - before[1]];
  });
  expect(moved[0]).toBeCloseTo(0, 0); // within half a pixel
  expect(moved[1]).toBeCloseTo(300, 0);

  // The pinned rounds are drawn once, in the layer: 7 matches, 14 rows.
  await expect(page.locator("[data-pinned-layer] [data-player-row]")).toHaveCount(14);

  // A reload keeps the choice.
  await page.reload();
  await expect(rows(page)).toHaveCount(62);
  await expect(page.getByRole("button", { name: "Rounds shown" })).toHaveAttribute("aria-pressed", "true");
  // A saved map opens fitted to the window (v0.0.105): back to 100%, where
  // the positions above were measured.
  await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).toHaveText("100%");
  await scrollTo(600);
  // Within a pixel: text measures a fraction differently after a reload.
  await expect.poll(async () => Math.abs((await yOf(48)) - quarters)).toBeLessThan(1);

  // Off: the quarterfinals scroll with the rest again.
  await scrollTo(0);
  await pin("Off");
  await expect(page.getByRole("button", { name: "Rounds shown" })).toHaveAttribute("aria-pressed", "false");
  const unpinned = await yOf(48);
  await scrollTo(600);
  await expect.poll(() => yOf(48)).toBeCloseTo(unpinned - 600, 0);

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows(page)).toHaveCount(0);
});
