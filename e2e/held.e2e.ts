import { expect, test } from "@playwright/test";

import {
  addChild,
  backupAfter,
  backupMenuText,
  boxIds,
  browserNow,
  fakeFolderPicker,
  mapInBackup,
  namesIn,
  newTree,
  renameBox,
} from "./helpers";

/**
 * A damaged map is held back from automatic backups (owner's decision,
 * 2026-10-18): backups keep going, carry its last good copy forward, and the
 * app warns on screen, in every tab. Restoring brings the good copy back as
 * a map of its own.
 *
 * Fresh profile: the only maps are the ones this test makes. The damage is
 * made by hand, the way storage corruption would leave it: the stored map's
 * name replaced by a number, which Linkkit repairs on open.
 */
const HELD = "ZZ held test";
const OTHER = "ZZ other map";

test("a damaged map is held back, warned about on screen, and restorable", async ({ context }) => {
  await context.addInitScript(fakeFolderPicker);
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();

  // Two throwaway maps, and a backup holding both as they are.
  await newTree(lk, OTHER);
  await newTree(lk, HELD);
  let ids = await boxIds(lk);
  await addChild(lk, ids[HELD], "Good child");
  let since = await browserNow(lk);
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: /^Backup/ }).click();
  await lk.getByRole("menuitem", { name: /^Automatic backup/ }).click();
  const first = await backupAfter(lk, since);
  expect(namesIn(mapInBackup(first, HELD))).toEqual(["Good child", HELD].sort());

  // Damage the held map's stored text, then reopen.
  await lk.evaluate((name) => {
    const registry = JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { id: string; name: string }[] };
    const id = registry.maps.find((m) => m.name === name)!.id;
    const stored = JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!);
    stored.map.name = 42;
    localStorage.setItem(`linkkit:map:${id}`, JSON.stringify(stored));
  }, HELD);
  await lk.reload();

  // The warning is on screen, here and in another tab.
  const banner = lk.getByTestId("backup-hold");
  await expect(banner).toContainText("This map was damaged and has been repaired");
  const second = await context.newPage();
  await second.goto("/linkkit/");
  await expect(second.getByTestId("backup-hold")).toContainText("was damaged and has been repaired");
  await second.close();

  // Edits to the held map stay out of backups; the other map's edits go in.
  ids = await boxIds(lk);
  since = await browserNow(lk);
  await renameBox(lk, ids["Good child"], "Edited child");
  const afterEdit = await backupAfter(lk, since);
  expect(namesIn(mapInBackup(afterEdit, HELD)), "the last good copy, carried forward").toEqual(["Good child", HELD].sort());
  expect(await backupMenuText(lk)).toContain(`“${HELD}” was damaged, so new backups keep its last backed-up version.`);

  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: new RegExp(`^${OTHER}`) }).click();
  // Another map open: the warning still names the held one.
  await expect(banner).toContainText(`“${HELD}” was damaged and has been repaired`);
  ids = await boxIds(lk);
  since = await browserNow(lk);
  await addChild(lk, ids[OTHER], "Other edit");
  const otherEdit = await backupAfter(lk, since);
  expect(namesIn(mapInBackup(otherEdit, OTHER))).toEqual(["Other edit", OTHER].sort());
  expect(namesIn(mapInBackup(otherEdit, HELD))).toEqual(["Good child", HELD].sort());

  // Restore: the good copy comes back as its own map, the hold ends.
  since = await browserNow(lk);
  await banner.getByRole("button", { name: "Restore last good version" }).click();
  await expect(banner).toHaveCount(0);
  await expect(lk.getByRole("button", { name: `${HELD} (last good version)`, exact: true })).toBeVisible();
  expect(Object.keys(await boxIds(lk)).sort()).toEqual(["Good child", HELD].sort());
  const restored = await backupAfter(lk, since);
  expect(namesIn(mapInBackup(restored, `${HELD} (last good version)`))).toEqual(["Good child", HELD].sort());
  // The repaired map, released, is backed up as it is now.
  expect(namesIn(mapInBackup(restored, "Untitled map"))).toEqual(["Edited child", HELD].sort());
  expect(await backupMenuText(lk)).not.toContain("was damaged");
});
