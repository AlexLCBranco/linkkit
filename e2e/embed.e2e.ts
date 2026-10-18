import { expect, test, type Frame, type Page } from "@playwright/test";

import { addChild, backupAfter, boxIds, browserNow, fakeFolderPicker, mapInBackup, mapMenu, namesIn, newTree } from "./helpers";

/**
 * Embed mode (gauntlet canvas, phase 3): `/linkkit/?embed=1&id=<map id>` in
 * a frame shows that one map with no app chrome, editing works, it never
 * changes which map the app opens next, banners still show inside it, only
 * one copy of the app writes backups, and a missing or deleted map says so.
 *
 * Fresh profile: the only maps are the ones this test makes. The "canvas"
 * is the gauntlet home page with frames added by the test.
 */
const A = "ZZ embed A";
const B = "ZZ embed B";

/** Every backup file write, from any tab or frame, in order. */
function countBackupWrites() {
  const proto = FileSystemFileHandle.prototype;
  const original = proto.createWritable;
  proto.createWritable = function (this: FileSystemFileHandle, ...args: Parameters<typeof original>) {
    const key = "e2e:backup-writes";
    const writes = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    localStorage.setItem(key, JSON.stringify([...writes, this.name]));
    return original.apply(this, args);
  };
}
const backupWrites = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("e2e:backup-writes") ?? "[]") as string[]);

/** Adds a frame to the canvas page, collecting what every frame posts. */
async function addFrame(canvas: Page, name: string, src: string): Promise<Frame> {
  await canvas.evaluate(
    ([name, src]) => {
      const w = window as unknown as { posted?: unknown[] };
      if (!w.posted) {
        w.posted = [];
        window.addEventListener("message", (e) => w.posted!.push(e.data));
      }
      const frame = document.createElement("iframe");
      frame.id = name;
      frame.src = src;
      frame.style.cssText = "width:900px;height:600px;border:0;display:block";
      document.body.append(frame);
    },
    [name, src],
  );
  const frame = await (await canvas.locator(`#${name}`).elementHandle())!.contentFrame();
  return frame!;
}

const posted = (canvas: Page) => canvas.evaluate(() => (window as unknown as { posted: Record<string, unknown>[] }).posted);
const send = (canvas: Page, name: string, message: object) =>
  canvas.evaluate(([name, message]) => (document.getElementById(name as string) as HTMLIFrameElement).contentWindow!.postMessage(message, location.origin), [name, message] as const);

const storedNow = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("linkkit:"))
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );

test("Linkkit in a frame: one map, no chrome, editing works, nothing else changes", async ({ context }) => {
  await context.addInitScript(fakeFolderPicker);
  await context.addInitScript(countBackupWrites);
  const lk = await context.newPage();
  await lk.goto("/linkkit/");
  await expect(lk.getByRole("button", { name: /^Switch map/ })).toBeVisible();

  // Two maps; B is open last, so it is the app's "active" one.
  await newTree(lk, A);
  await addChild(lk, (await boxIds(lk))[A], "A child");
  await newTree(lk, B);
  const registryIds = () =>
    lk.evaluate(() => {
      const registry = JSON.parse(localStorage.getItem("linkkit:registry") ?? '{"maps":[]}') as { maps: { id: string; name: string }[] };
      return Object.fromEntries(registry.maps.map((m) => [m.name, m.id]));
    });
  // Saves wait for a short quiet moment.
  await expect.poll(async () => Object.keys(await registryIds())).toEqual(expect.arrayContaining([A, B]));
  const ids = await registryIds();
  const active = await lk.evaluate(() => localStorage.getItem("linkkit:active"));
  expect(active).toBe(ids[B]);
  // Automatic backup on, in the full app (the first copy: it holds the
  // writer's lock).
  let since = await browserNow(lk);
  await mapMenu(lk, "Backup", "Automatic backup…");
  await backupAfter(lk, since);

  // The canvas: two frames of map A.
  const canvas = await context.newPage();
  await canvas.goto("/");
  const one = await addFrame(canvas, "one", `/linkkit/?embed=1&id=${ids[A]}`);
  const two = await addFrame(canvas, "two", `/linkkit/?embed=1&id=${ids[A]}`);
  for (const f of [one, two]) {
    await expect(f.locator(`[data-box-id]`).filter({ hasText: "A child" })).toBeVisible();
    // No header, map menu or version badge; the editing tools are there.
    await expect(f.getByRole("button", { name: /^Switch map/ })).toHaveCount(0);
    await expect(f.getByRole("toolbar", { name: "Map tools" })).toBeVisible();
    await expect(f.getByRole("button", { name: "Undo" })).toBeVisible();
  }
  await expect.poll(() => posted(canvas)).toContainEqual({ app: "linkkit", id: ids[A], type: "stone:ready", status: "ok" });

  // Edit in frame one: frame two shows it, the app's active map is still B.
  const childId = await one.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-box-id]")].find((el) => el.innerText.startsWith("A child"))!.getAttribute("data-box-id")!,
  );
  const writesBefore = (await backupWrites(lk)).length;
  since = await browserNow(lk);
  await one.locator(`[data-box-id="${childId}"]`).dblclick();
  await expect(one.getByRole("textbox", { name: "Box name" })).toBeFocused();
  await canvas.keyboard.press("Control+a");
  await canvas.keyboard.type("A renamed");

  // Mid-typing, a flush says busy (the canvas must not unload the frame).
  await send(canvas, "one", { type: "stone:flush" });
  await expect.poll(async () => (await posted(canvas)).filter((m) => m.type === "stone:flushed").at(-1)).toEqual({ app: "linkkit", id: ids[A], type: "stone:flushed", busy: true });
  await canvas.keyboard.press("Enter");
  await expect(one.getByRole("textbox", { name: "Box name" })).toHaveCount(0);
  await one.locator("body").click({ position: { x: 5, y: 590 } });
  await send(canvas, "one", { type: "stone:flush" });
  await expect.poll(async () => (await posted(canvas)).filter((m) => m.type === "stone:flushed").at(-1)).toEqual({ app: "linkkit", id: ids[A], type: "stone:flushed", busy: false });

  await expect(two.locator("[data-box-id]").filter({ hasText: "A renamed" })).toBeVisible();
  expect(await lk.evaluate(() => localStorage.getItem("linkkit:active"))).toBe(active);

  // One backup for the change, though three copies of Linkkit are open (and
  // the one writing doesn't have map A open).
  const file = await backupAfter(lk, since);
  expect(namesIn(mapInBackup(file, A))).toEqual([A, "A renamed"].sort());
  await canvas.waitForTimeout(12_000);
  expect((await backupWrites(lk)).slice(writesBefore), "backup writes after one edit, with three copies open").toHaveLength(1);

  // A map that isn't here: the frame says so and writes nothing.
  const before = await storedNow(lk);
  const missing = await addFrame(canvas, "missing", "/linkkit/?embed=1&id=no-such-map");
  await expect(missing.getByTestId("embed-gone")).toContainText("This map isn't here");
  await expect.poll(() => posted(canvas)).toContainEqual({ app: "linkkit", id: "no-such-map", type: "stone:ready", status: "missing" });
  await canvas.waitForTimeout(1_000);
  expect(await storedNow(lk)).toBe(before);

  // The damaged-map warning shows inside a frame. Frame two goes first, so
  // nothing open saves map A over the damage.
  await canvas.evaluate(() => document.getElementById("two")!.remove());
  await one.evaluate((id) => {
    const stored = JSON.parse(localStorage.getItem(`linkkit:map:${id}`)!);
    stored.map.name = 42;
    localStorage.setItem(`linkkit:map:${id}`, JSON.stringify(stored));
  }, ids[A]);
  await canvas.evaluate(() => (document.getElementById("one") as HTMLIFrameElement).contentWindow!.location.reload());
  const reloaded = await (await canvas.locator("#one").elementHandle())!.contentFrame();
  await expect(reloaded!.getByTestId("backup-hold")).toContainText("This map was damaged and has been repaired");
  await expect(reloaded!.getByRole("button", { name: "Open it" })).toHaveCount(0);
  await reloaded!.getByTestId("backup-hold").getByRole("button", { name: "Keep repaired version" }).click();
  await expect(reloaded!.getByTestId("backup-hold")).toHaveCount(0);

  // Deleted in the app while framed: the frame says so, opens nothing else.
  await lk.bringToFront();
  await switchTo(lk, ids[A]);
  await mapMenu(lk, "This map", "Delete");
  await expect(reloaded!.getByTestId("embed-gone")).toContainText("This map was deleted");
  await expect.poll(() => posted(canvas)).toContainEqual({ app: "linkkit", id: ids[A], type: "stone:status", status: "deleted" });
});

/** Opens a map in the full app by id, through the address of its record. */
async function switchTo(lk: Page, id: string) {
  const name = await lk.evaluate((id) => {
    const registry = JSON.parse(localStorage.getItem("linkkit:registry")!) as { maps: { id: string; name: string }[] };
    return registry.maps.find((m) => m.id === id)!.name;
  }, id);
  await lk.getByRole("button", { name: /^Switch map/ }).click();
  await lk.getByRole("menuitem", { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  await expect(lk.getByRole("button", { name: new RegExp(`^Switch map.*`) })).toBeVisible();
}
