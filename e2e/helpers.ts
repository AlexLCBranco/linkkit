import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared by the e2e tests written after the bridge test (which keeps its own
 * copies). Each runs in a fresh, empty browser profile, so the owner's own
 * maps are never in reach.
 */

export const box = (lk: Page, id: string): Locator => lk.locator(`[data-box-id="${id}"]`);

/** The ids of every box, by name (names are unique in these tests). */
export const boxIds = (lk: Page): Promise<Record<string, string>> =>
  lk.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-box-id]")].map((el) => [
        el.innerText.split("\n")[0].trim(),
        el.getAttribute("data-box-id")!,
      ]),
    ),
  );

/** Add a next step with the toolbar's "+", and type its name. */
export async function addChild(lk: Page, parent: string, name: string) {
  await box(lk, parent).hover();
  await box(lk, parent).getByRole("button", { name: "Add a child", exact: true }).click();
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
}

export async function renameBox(lk: Page, id: string, name: string) {
  await box(lk, id).dblclick();
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.press("Control+a");
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
}

/** Clicks through the map menu: each item but the last opens a submenu. */
export async function mapMenu(lk: Page, ...path: string[]) {
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  for (const item of path) {
    const start = new RegExp(`^${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    await lk.getByRole("menuitem", { name: start }).click();
  }
}

/** A new tree map whose start box is `name`. */
export async function newTree(lk: Page, name: string) {
  await mapMenu(lk, "+ New", "Map with tree rules");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await lk.keyboard.type(name);
  await lk.keyboard.press("Enter");
  await expect(lk.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
}

/** The text of the map menu's Backup submenu. */
export async function backupMenuText(lk: Page) {
  await lk.bringToFront();
  await mapMenu(lk, "Backup");
  const text = (await lk.getByRole("menu").allInnerTexts()).join("\n");
  await lk.keyboard.press("Escape");
  await lk.keyboard.press("Escape");
  await expect(lk.getByRole("menu")).toHaveCount(0);
  return text;
}

/** Stands in for the folder picker: `showDirectoryPicker({ id })` returns
    the OPFS folder `e2e-<id>`. Pass to `context.addInitScript`. */
export function fakeFolderPicker() {
  (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = async ({ id }: { id: string }) =>
    (await navigator.storage.getDirectory()).getDirectoryHandle(`e2e-${id}`, { create: true });
}

export type BackupFile = { name: string; modified: number; text: string };

/** The files in Linkkit's backup folder, newest first. */
export const backupFiles = (page: Page): Promise<BackupFile[]> =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle("e2e-linkkit-backup", { create: true });
    const files: { name: string; modified: number; text: string }[] = [];
    for await (const entry of (folder as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      // Only finished backups: a write in progress shows as a temporary
      // file that is gone a moment later.
      if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        const text = await file.text();
        // The app creates the file, then writes it: skip one not written yet.
        JSON.parse(text);
        files.push({ name: entry.name, modified: file.lastModified, text });
      } catch {
        // Replaced while being read: the next poll sees the new one.
      }
    }
    return files.sort((a, b) => b.modified - a.modified);
  });

export const browserNow = (page: Page) => page.evaluate(() => Date.now());

/** The newest backup written after `since`. Backups wait for 10 s of
    quiet, so this allows 25 s. */
export async function backupAfter(page: Page, since: number): Promise<BackupFile> {
  let newest: BackupFile | undefined;
  await expect
    .poll(async () => ((newest = (await backupFiles(page))[0])?.modified ?? 0) > since, {
      timeout: 25_000,
      message: "a Linkkit backup written after the last edit",
    })
    .toBe(true);
  return newest!;
}

/** The map named `name` in a backup file, as stored, or undefined. */
export function mapInBackup(file: BackupFile, name: string): { map: { name: string; nodes: Record<string, { name: string }> } } | undefined {
  const data = JSON.parse(file.text) as { maps: { map: { name: string; nodes: Record<string, { name: string }> } }[] };
  return data.maps.find((m) => m.map.name === name);
}

/** Box names of a stored map. */
export const namesIn = (stored: { map: { nodes: Record<string, { name: string }> } } | undefined) =>
  stored ? Object.values(stored.map.nodes).map((n) => n.name).sort() : [];
