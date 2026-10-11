import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * BRIDGE-CHECKLIST.md steps 1-8, automated: Linkkit and Boardkit side by
 * side on the shared site, in one browser context (one localStorage, like
 * two windows of the same browser). Step 0 (safety copies) has nothing to
 * protect in a fresh profile.
 *
 * Automatic backup (steps 1, 2, 7, 8.5) needs a folder picker, which a test
 * can't click through. So the picker is swapped for one that hands back a
 * private folder in the browser's own storage (OPFS): the apps write to it
 * with the same File System Access calls as to a real folder, and the test
 * reads the files back from there.
 *
 * Safety: the context is a fresh, empty profile, so the only maps and boards
 * in it are the apps' starter ones; the owner's real data lives in their own
 * browser and is never in reach. Even so, the test works only on the
 * "ZZ bridge test" map and board it makes, and step 8.6 checks that every
 * other map and board record is byte-for-byte what it was at the start.
 *
 * Each checklist line is one check. A failed check is recorded and the run
 * goes on (later checks may then fail as a knock-on), and the summary at the
 * end lists pass / fail per step.
 */

const NAME = "ZZ bridge test";
/** "Each change should show in the other window within a second or two." */
const LIVE = { timeout: 3_000 };

type Result = { id: string; title: string; ok: boolean; error?: string };
const results: Result[] = [];
/** Both apps' pages, for a screenshot of each when a check fails. */
const shots: { lk?: Page; bk?: Page } = {};

async function check(id: string, title: string, run: () => Promise<void>) {
  try {
    await test.step(`${id} ${title}`, run);
    results.push({ id, title, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const [app, page] of Object.entries(shots))
      await page?.screenshot({ path: `test-results/bridge-${id}-${app}.png` }).catch(() => {});
    results.push({ id, title, ok: false, error: message.split("\n").slice(0, 30).join("\n") });
  }
}

test.afterAll(() => {
  const lines = results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.title}${r.ok ? "" : `\n        ${r.error?.replaceAll("\n", "\n        ")}`}`);
  console.log(`\nBridge checklist, automated:\n${lines.join("\n")}\n`);
});

// ---------------------------------------------------------------- Linkkit

const box = (lk: Page, id: string) => lk.locator(`[data-box-id="${id}"]`);

/** A box's name: the first line of its text (the toolbar is icons only). */
const boxName = (lk: Page, id: string) =>
  box(lk, id).evaluate((el) => (el as HTMLElement).innerText.split("\n")[0].trim());

/** The ids of every box, by name (names are unique in this test). */
const boxIds = (lk: Page) =>
  lk.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-box-id]")].map((el) => [
        el.innerText.split("\n")[0].trim(),
        el.getAttribute("data-box-id")!,
      ]),
    ),
  );

/** The names of a box's next steps, left to right (the map is top-down),
    read from the arrows React Flow draws ("Edge from A to B"). */
const childNames = (lk: Page, parent: string) =>
  lk.evaluate((parent) => {
    const prefix = `Edge from ${parent} to `;
    const ids = [...document.querySelectorAll("[aria-label]")]
      .map((el) => el.getAttribute("aria-label")!)
      .filter((label) => label.startsWith(prefix))
      .map((label) => label.slice(prefix.length));
    return ids
      .map((id) => document.querySelector<HTMLElement>(`[data-box-id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null)
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((el) => el.innerText.split("\n")[0].trim());
  }, parent);

async function toolbarButton(lk: Page, id: string, name: string): Promise<Locator> {
  await box(lk, id).hover();
  return box(lk, id).getByRole("button", { name, exact: true });
}

/** Add a next step with the toolbar's "+", and type its name. */
async function addChild(lk: Page, parent: string, name: string) {
  await (await toolbarButton(lk, parent, "Add a child")).click();
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
}

async function renameBox(lk: Page, id: string, name: string) {
  await box(lk, id).dblclick();
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.press("Control+a");
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
}

async function mapMenu(lk: Page, item: string) {
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: item }).click();
}

// --------------------------------------------------------------- Boardkit

const card = (bk: Page, id: string) => bk.locator(`[data-card-id="${id}"]`);
const list = (bk: Page, id: string) => bk.locator(`section[data-list-id="${id}"]`);
const cardTitle = (bk: Page, id: string) => card(bk, id).getByRole("button", { name: "Card title", exact: true });
const listTitle = (bk: Page, id: string) => list(bk, id).getByRole("button", { name: "List title", exact: true });

/** The board as Boardkit draws it: each list's title and its cards' titles. */
const boardShown = (bk: Page) =>
  bk.evaluate(() =>
    [...document.querySelectorAll("section[data-list-id]")].map((section) => ({
      list: section.querySelector('[aria-label="List title"]')?.textContent?.trim() ?? "",
      cards: [...section.querySelectorAll("[data-card-id]")].map(
        (c) => c.querySelector('[aria-label="Card title"]')?.textContent?.trim() ?? "",
      ),
    })),
  );

async function retitle(bk: Page, title: Locator, name: string) {
  await title.click();
  const field = bk.locator("textarea:focus, input:focus");
  await expect(field).toHaveCount(1);
  await bk.keyboard.press("Control+a");
  await bk.keyboard.type(name);
  await bk.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
}

/** A mouse drag in small steps, so dnd-kit (4px to start) and Linkkit's own
    gestures both see a real drag. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.waitForTimeout(250);
  await page.mouse.up();
}

async function centre(locator: Locator) {
  const r = (await locator.boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

// ----------------------------------------------------------------- backup

/** Stands in for the folder picker: `showDirectoryPicker({ id })` returns
    the OPFS folder `e2e-<id>`, so Linkkit ("linkkit-backup") and Boardkit
    ("boardkit-backup") each get their own. */
function fakeFolderPicker() {
  (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async ({ id }: { id: string }) =>
    (await navigator.storage.getDirectory()).getDirectoryHandle(`e2e-${id}`, { create: true });
}

type BackupFile = { name: string; modified: number; text: string };

/** The files in an app's backup folder, newest first. */
const backupFiles = (page: Page, app: "linkkit" | "boardkit") =>
  page.evaluate(async (app) => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle(`e2e-${app}-backup`, { create: true });
    const files: { name: string; modified: number; text: string }[] = [];
    for await (const entry of (folder as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      if (entry.kind !== "file") continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      files.push({ name: entry.name, modified: file.lastModified, text: await file.text() });
    }
    return files.sort((a, b) => b.modified - a.modified);
  }, app);

/** The newest backup written after `since` (the browser's clock). Backups
    wait for 10 s of quiet, so this allows 25 s. */
async function backupAfter(page: Page, app: "linkkit" | "boardkit", since: number): Promise<BackupFile> {
  let newest: BackupFile | undefined;
  await expect
    .poll(async () => ((newest = (await backupFiles(page, app))[0])?.modified ?? 0) > since, {
      timeout: 25_000,
      message: `a ${app} backup written after the last edit`,
    })
    .toBe(true);
  return newest!;
}

const browserNow = (page: Page) => page.evaluate(() => Date.now());

/** The text of an app's switcher menu, which holds the backup status line. */
async function menuText(page: Page, button: RegExp | string) {
  // A hidden tab doesn't run animations, so its menu would never finish
  // closing.
  await page.bringToFront();
  await page.getByRole("button", { name: button }).click();
  const text = await page.getByRole("menu").innerText();
  await page.keyboard.press("Escape");
  // Closed for good before the next look, so a click can't land on a menu
  // still animating shut.
  await expect(page.getByRole("menu")).toHaveCount(0);
  return text;
}
const linkkitMenu = (lk: Page) => menuText(lk, /^Switch map/);
const boardkitMenu = (bk: Page) => menuText(bk, "Switch board");

async function openBoardkitTrash(bk: Page) {
  await bk.getByRole("button", { name: "Recently deleted lists and cards" }).click();
  return bk.getByRole("dialog");
}

// ------------------------------------------------------------------- test

/** Every map and board record in the browser, by storage key. */
const records = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("linkkit:map:") || k.startsWith("boardkit:board:"))
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );

test("Linkkit + Boardkit side by side (BRIDGE-CHECKLIST 1-8)", async ({ context }) => {
  await context.addInitScript(fakeFolderPicker);
  // ---- Setup: both apps open, Boardkit first (Linkkit offers "Link to
  // Boardkit" only once Boardkit has made its data here).
  const bkFirst = await context.newPage();
  await bkFirst.goto("/boardkit/");
  const notNow = bkFirst.getByRole("button", { name: "Not now" });
  if (await notNow.isVisible({ timeout: 5_000 }).catch(() => false)) await notNow.click();
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();

  const before = await records(lk);
  expect(Object.keys(before).length, "the apps' own starter map and board").toBeGreaterThan(0);

  let bk: Page = bkFirst;
  shots.lk = lk;
  let ids: Record<string, string> = {};

  // ---- 1.1 / 2.1 Turn on automatic backup in both apps. The rest of
  // steps 1 and 2 waits for the edits in step 4: a first-visit Linkkit has
  // nothing to back up yet (its example map isn't saved until tidied).
  await check("1.1", "Linkkit: Automatic backup… with a folder: menu says backing up", async () => {
    await mapMenu(lk, "Automatic backup…");
    await expect.poll(() => linkkitMenu(lk)).toContain("Backing up to “e2e-linkkit-backup”");
  });

  await check("2.1", "Boardkit: Automatic backup… with a folder: menu says backing up", async () => {
    await bkFirst.bringToFront();
    await bkFirst.getByRole("button", { name: "Switch board" }).click();
    await bkFirst.getByRole("menuitem", { name: "Automatic backup…" }).click();
    await expect.poll(() => boardkitMenu(bkFirst)).toContain("Backing up to e2e-boardkit-backup");
  });
  // A hidden tab doesn't draw, and step 3 reads Linkkit's arrows.
  await lk.bringToFront();

  // ---- 3. Link a throwaway tree
  await check("3.1", "New tree ZZ bridge test with List A (A1, A2) and List B (B1, B2)", async () => {
    await mapMenu(lk, "+ New map with tree rules");
    await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
    await lk.keyboard.type(NAME);
    await lk.keyboard.press("Enter");
    ids = await boxIds(lk);
    await addChild(lk, ids[NAME], "List A");
    await addChild(lk, ids[NAME], "List B");
    ids = await boxIds(lk);
    await addChild(lk, ids["List A"], "A1");
    await addChild(lk, ids["List A"], "A2");
    await addChild(lk, ids["List B"], "B1");
    await addChild(lk, ids["List B"], "B2");
    ids = await boxIds(lk);
    expect(Object.keys(ids).sort()).toEqual(["A1", "A2", "B1", "B2", "List A", "List B", NAME].sort());
    expect(await childNames(lk, ids[NAME])).toEqual(["List A", "List B"]);
    expect(await childNames(lk, ids["List A"])).toEqual(["A1", "A2"]);
    expect(await childNames(lk, ids["List B"])).toEqual(["B1", "B2"]);
  });

  await check("3.2", "Link to Boardkit: says 2 lists and 4 cards; chip after Link", async () => {
    await mapMenu(lk, "Link to Boardkit…");
    const dialog = lk.getByRole("alertdialog");
    await expect(dialog).toContainText("It becomes a board in Boardkit with 2 lists and 4 cards");
    await dialog.getByRole("button", { name: "Link", exact: true }).click();
    await expect(lk.getByText("Linked to Boardkit")).toBeVisible();
  });

  await check("3.3", "Open in Boardkit shows the board, lists and cards in Linkkit's order", async () => {
    const popup = context.waitForEvent("page");
    await lk.getByRole("link", { name: "Open in Boardkit" }).click();
    bk = await popup;
    await bk.waitForLoadState();
    await bkFirst.close();
    shots.bk = bk;
    await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(NAME);
    expect(await boardShown(bk)).toEqual([
      { list: "List A", cards: await childNames(lk, ids["List A"]) },
      { list: "List B", cards: await childNames(lk, ids["List B"]) },
    ]);
  });

  await check("3.4", "Hovering card A1 in Linkkit shows no +", async () => {
    await box(lk, ids.A1).hover();
    await expect(box(lk, ids.A1).getByRole("button", { name: "Rename" })).toBeVisible();
    await expect(box(lk, ids.A1).getByRole("button", { name: "Add a child" })).toHaveCount(0);
  });

  // ---- 4. Edits cross over live
  await lk.bringToFront();

  await check("4.1", "Rename A1 in Boardkit: Linkkit shows it", async () => {
    await retitle(bk, cardTitle(bk, ids.A1), "A1 renamed");
    await expect.poll(() => boxName(lk, ids.A1), LIVE).toBe("A1 renamed");
  });

  await check("4.2", "Rename B1 in Linkkit: Boardkit shows it", async () => {
    await renameBox(lk, ids.B1, "B1 renamed");
    await expect(cardTitle(bk, ids.B1)).toHaveText("B1 renamed", LIVE);
  });

  await check("4.3", "Drag A2 above A1 in Boardkit: Linkkit shows A2 first", async () => {
    const a1 = (await card(bk, ids.A1).boundingBox())!;
    const a2 = (await card(bk, ids.A2).boundingBox())!;
    await drag(bk, { x: a2.x + 10, y: a2.y + a2.height / 2 }, { x: a1.x + 10, y: a1.y + 4 });
    expect((await boardShown(bk))[0].cards, "Boardkit itself").toEqual(["A2", "A1 renamed"]);
    await expect.poll(() => childNames(lk, ids["List A"]), LIVE).toEqual(["A2", "A1 renamed"]);
  });

  await check("4.4", "Drag B2 onto List A in Linkkit: Boardkit shows B2 in List A", async () => {
    await drag(lk, await centre(box(lk, ids.B2)), await centre(box(lk, ids["List A"])));
    await expect.poll(() => childNames(lk, ids["List A"]), { timeout: 2_000, message: "Linkkit itself" }).toContain("B2");
    await expect.poll(async () => (await boardShown(bk))[0].cards, LIVE).toContain("B2");
    expect((await boardShown(bk))[1].cards).not.toContain("B2");
  });

  await check("4.5", "Move B2 back to List B in Boardkit: Linkkit shows it under List B", async () => {
    const from = (await card(bk, ids.B2).boundingBox())!;
    const last = (await card(bk, ids.B1).boundingBox())!;
    await drag(bk, { x: from.x + 10, y: from.y + from.height / 2 }, { x: last.x + 10, y: last.y + last.height + 12 });
    expect((await boardShown(bk))[1].cards, "Boardkit itself").toEqual(["B1 renamed", "B2"]);
    await expect.poll(() => childNames(lk, ids["List B"]), LIVE).toEqual(["B1 renamed", "B2"]);
  });

  await check("4.6", "Set List B to cut in Linkkit: Boardkit shows a cut badge and faded cards", async () => {
    await (await toolbarButton(lk, ids["List B"], "Keep, maybe or cut")).click();
    await lk.getByRole("menuitem", { name: "Cut" }).click();
    await expect(box(lk, ids["List B"])).toHaveAttribute("data-cut", "true");
    await expect(list(bk, ids["List B"]).getByRole("img", { name: "Cut" }).first()).toBeVisible(LIVE);
    await expect(list(bk, ids["List B"])).toHaveAttribute("data-cut", "");
    await expect(card(bk, ids.B1)).toHaveAttribute("data-cut", "");
    await expect(card(bk, ids.B2)).toHaveAttribute("data-cut", "");
  });

  const thot = "Pregame line from the bridge test";
  await check("4.7", "Pregame thots on A1 renamed in Boardkit: Linkkit shows it as the box's note", async () => {
    await card(bk, ids.A1).hover();
    await card(bk, ids.A1).getByRole("button", { name: "Show pregame thots" }).click();
    await card(bk, ids.A1).getByRole("button", { name: "Pregame thots", exact: true }).click();
    await bk.keyboard.type(thot);
    // Multi-line field: Enter is a new line, leaving it keeps the text.
    await bk.getByRole("button", { name: "Board name" }).focus();
    await expect(box(lk, ids.A1).getByRole("img", { name: "Has notes" })).toBeVisible(LIVE);
    await expect(box(lk, ids.A1)).toContainText(thot);
  });

  // ---- 1.2-1.4 / 2.2-2.4 The edits in step 4 were backed up. (Boardkit
  // here is the tab "Open in Boardkit" opened, so this also checks that a
  // new tab picks the saved folder back up.)
  const duringStep4 = (await browserNow(lk)) - 15_000;

  await check("1.3", "Linkkit: a new linkkit-backup-YYYY-MM-DD-HHMM.json; menu says last just now", async () => {
    const file = await backupAfter(lk, "linkkit", duringStep4);
    expect(file.name).toMatch(/^linkkit-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(await linkkitMenu(lk)).toContain("Backing up to “e2e-linkkit-backup” · last just now");
  });

  await check("1.4", "Linkkit: the backup holds ZZ bridge test with step 4's edits", async () => {
    const file = await backupAfter(lk, "linkkit", duringStep4);
    expect(file.text).toContain(NAME);
    expect(file.text).toContain("B1 renamed");
  });

  await check("2.3", "Boardkit: a new boardkit-backup-YYYY-MM-DD-HHMM.json; menu says last just now", async () => {
    const file = await backupAfter(bk, "boardkit", duringStep4);
    expect(file.name).toMatch(/^boardkit-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
    expect(await boardkitMenu(bk)).toContain("Backing up to e2e-boardkit-backup · last saved just now");
  });

  await check("2.4", "Boardkit: the backup holds ZZ bridge test with step 4's edits", async () => {
    const file = await backupAfter(bk, "boardkit", duringStep4);
    expect(file.text).toContain(NAME);
    expect(file.text).toContain(thot);
  });
  await lk.bringToFront();

  // ---- 5. Deletes go to Boardkit's trash, and come back
  await check("5.1", "Delete B1 renamed in Linkkit: gone in Boardkit, in Boardkit's trash; Linkkit offers Boardkit's trash", async () => {
    await (await toolbarButton(lk, ids.B1, "Delete box")).click();
    await expect(box(lk, ids.B1)).toHaveCount(0);
    await expect(card(bk, ids.B1)).toHaveCount(0, LIVE);
    const trash = await openBoardkitTrash(bk);
    await expect(trash).toContainText("B1 renamed");
    await bk.keyboard.press("Escape");
    await lk.getByRole("button", { name: "Recently deleted" }).click();
    const lkTrash = lk.getByRole("dialog");
    await expect(lkTrash.getByRole("link", { name: "Open trash in Boardkit" })).toBeVisible();
    await expect(lkTrash).not.toContainText("From this map");
    await lk.keyboard.press("Escape");
  });

  await check("5.2", "Restore it from Boardkit's trash: back in Linkkit under List B, old place", async () => {
    const trash = await openBoardkitTrash(bk);
    await trash.locator("li").filter({ hasText: "B1 renamed" }).getByRole("button", { name: "Restore card" }).click();
    await bk.keyboard.press("Escape");
    await expect(card(bk, ids.B1)).toHaveCount(1);
    expect((await boardShown(bk))[1].cards, "Boardkit itself").toEqual(["B1 renamed", "B2"]);
    await expect.poll(() => childNames(lk, ids["List B"]), LIVE).toEqual(["B1 renamed", "B2"]);
  });

  await check("5.3", "Delete List B in Linkkit: Boardkit's trash holds it; restored, it and both cards come back", async () => {
    // Compared with the order just before, so a mismatch left by 5.2 isn't
    // counted twice.
    const cardsBefore = (await boardShown(bk)).find((l) => l.list === "List B")?.cards;
    const boxesBefore = await childNames(lk, ids["List B"]);
    await (await toolbarButton(lk, ids["List B"], "Delete box")).click();
    const ask = lk.getByRole("alertdialog");
    await expect(ask).toContainText("List B");
    await ask.getByRole("button", { name: /^Delete \d+ boxes$/ }).click();
    await expect(box(lk, ids["List B"])).toHaveCount(0);
    await expect(list(bk, ids["List B"])).toHaveCount(0, LIVE);
    const trash = await openBoardkitTrash(bk);
    const row = trash.locator("li").filter({ hasText: "List B" });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Restore list" }).click();
    await bk.keyboard.press("Escape");
    expect((await boardShown(bk)).find((l) => l.list === "List B")?.cards, "Boardkit itself").toEqual(cardsBefore);
    await expect.poll(() => childNames(lk, ids[NAME]), LIVE).toEqual(["List A", "List B"]);
    await expect.poll(() => childNames(lk, ids["List B"]), LIVE).toEqual(boxesBefore);
  });

  await check("5.4", "Delete A2 in Boardkit: gone in Linkkit", async () => {
    await card(bk, ids.A2).hover();
    await card(bk, ids.A2).getByRole("button", { name: "Delete card" }).click();
    await expect(card(bk, ids.A2)).toHaveCount(0);
    await expect(box(lk, ids.A2)).toHaveCount(0, LIVE);
  });

  // ---- 6. Undo respects the other app
  await check("6.1", "Rename List A to List A 2 in Linkkit, Ctrl+Z: List A in both", async () => {
    await renameBox(lk, ids["List A"], "List A 2");
    await expect(listTitle(bk, ids["List A"])).toHaveText("List A 2", LIVE);
    await lk.keyboard.press("Control+z");
    await expect.poll(() => boxName(lk, ids["List A"])).toBe("List A");
    await expect(listTitle(bk, ids["List A"])).toHaveText("List A", LIVE);
  });

  await check("6.2", "Linkkit List A 3, Boardkit List A 4, Linkkit Ctrl+Z: refused, both show List A 4", async () => {
    await renameBox(lk, ids["List A"], "List A 3");
    await expect(listTitle(bk, ids["List A"])).toHaveText("List A 3", LIVE);
    await retitle(bk, listTitle(bk, ids["List A"]), "List A 4");
    await expect.poll(() => boxName(lk, ids["List A"]), LIVE).toBe("List A 4");
    await lk.keyboard.press("Control+z");
    await expect(lk.getByRole("status")).toContainText(
      "Can't undo further: “List A 4” was changed in Boardkit or another tab",
    );
    await lk.waitForTimeout(1_000);
    expect(await boxName(lk, ids["List A"])).toBe("List A 4");
    await expect(listTitle(bk, ids["List A"])).toHaveText("List A 4");
  });

  // ---- 7. Backups after linked edits
  const afterStep6 = await browserNow(lk);

  await check("7.1", "A new file in each backup folder after the last edit", async () => {
    await backupAfter(lk, "linkkit", afterStep6 - 1_000);
    await backupAfter(bk, "boardkit", afterStep6 - 1_000);
  });

  await check("7.2", "Newest Linkkit backup: has ZZ bridge test, no linkedBoard", async () => {
    const [file] = await backupFiles(lk, "linkkit");
    expect(file.text).toContain(NAME);
    expect(file.text).toContain("List A 4");
    expect(file.text).not.toContain("linkedBoard");
  });

  await check("7.3", "Newest Boardkit backup: has ZZ bridge test", async () => {
    const [file] = await backupFiles(bk, "boardkit");
    expect(file.text).toContain(NAME);
    expect(file.text).toContain("List A 4");
  });

  // ---- 8. Unlink and clean up
  await check("8.1", "Delete this board… in Boardkit names the Linkkit map; Cancel", async () => {
    await bk.getByRole("button", { name: "Switch board" }).click();
    await bk.getByRole("menuitem", { name: "Delete this board…" }).click();
    const ask = bk.getByRole("alertdialog");
    await expect(ask).toContainText(`“${NAME}” is also a map in Linkkit`);
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toHaveCount(0);
    await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(NAME);
  });

  await check("8.2", "Unlink from Boardkit in Linkkit: chip gone, map still a tree, board still in Boardkit", async () => {
    await mapMenu(lk, "Unlink from Boardkit…");
    await lk.getByRole("alertdialog").getByRole("button", { name: "Unlink" }).click();
    await expect(lk.getByText("Linked to Boardkit")).toHaveCount(0);
    await expect(lk.getByRole("button", { name: NAME, exact: true })).toBeVisible();
    expect(await childNames(lk, ids[NAME])).toEqual(["List A 4", "List B"]);
    await expect(box(lk, ids[NAME]).getByRole("button", { name: "Add a child" })).toHaveCount(1);
    await bk.reload();
    await expect(bk.getByRole("button", { name: "Board name" })).toHaveText(NAME);
  });

  await check("8.3", "Delete the ZZ bridge test board in Boardkit", async () => {
    await bk.getByRole("button", { name: "Switch board" }).click();
    await bk.getByRole("menuitem", { name: "Delete this board…" }).click();
    const ask = bk.getByRole("alertdialog");
    await expect(ask).toContainText(`Delete “${NAME}”?`);
    await ask.getByRole("button", { name: "Delete board" }).click();
    await expect(bk.getByRole("button", { name: "Board name" })).not.toHaveText(NAME);
  });

  await check("8.4", "Delete the ZZ bridge test map in Linkkit, then Delete for good", async () => {
    await mapMenu(lk, "Delete this map");
    await expect(lk.getByRole("button", { name: NAME, exact: true })).toHaveCount(0);
    await lk.getByRole("button", { name: "Recently deleted" }).click();
    const lkTrash = lk.getByRole("dialog");
    const row = lkTrash.locator("li").filter({ hasText: NAME });
    await row.getByRole("button", { name: /for good$/ }).click();
    const sure = lk.getByRole("alertdialog");
    if (await sure.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await sure.getByRole("button", { name: /Delete/ }).click();
    }
    await expect(lkTrash.locator("li").filter({ hasText: NAME })).toHaveCount(0);
    await lk.keyboard.press("Escape");
  });

  await check("8.5", "Turn off automatic backup in both apps: still off after a reload", async () => {
    await mapMenu(lk, "Turn off automatic backup");
    await bk.bringToFront();
    await bk.getByRole("button", { name: "Switch board" }).click();
    await bk.getByRole("menuitem", { name: "Turn off automatic backup" }).click();
    // Off on screen first: turning off forgets the folder asynchronously, and
    // a reload straight after the click could cut that short.
    await expect.poll(() => linkkitMenu(lk)).not.toContain("Backing up to");
    await expect.poll(() => boardkitMenu(bk)).not.toContain("Backing up to");
    await lk.waitForTimeout(500);
    await Promise.all([lk.reload(), bk.reload()]);
    await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();
    await expect(bk.getByRole("button", { name: "Switch board" })).toBeVisible();
    for (const text of [await linkkitMenu(lk), await boardkitMenu(bk)]) {
      expect(text).not.toContain("Backing up to");
      expect(text).not.toContain("Turn off automatic backup");
    }
    // Then the test's folders go, like deleting a folder made for the test.
    await lk.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      for (const app of ["linkkit", "boardkit"]) await root.removeEntry(`e2e-${app}-backup`, { recursive: true });
    });
  });

  await check("8.6", "Every other map and board is exactly as before; no ZZ data left", async () => {
    const after = await records(lk);
    for (const [key, value] of Object.entries(before)) expect(after[key], key).toBe(value);
    const left = await lk.evaluate(
      (name) => Object.keys(localStorage).filter((k) => (localStorage.getItem(k) ?? "").includes(name)),
      NAME,
    );
    expect(left, "storage keys still mentioning the test name").toEqual([]);
  });

  expect(results.filter((r) => !r.ok).map((r) => r.id), "failed steps").toEqual([]);
});
