import { expect, test } from "@playwright/test";

/**
 * "Copy image" (Boardkit's copy-board-as-image): the whole map lands on
 * the system clipboard as a PNG at 4x the pixels, so it can be pasted into
 * Excalidraw and resized there. Uses only the starter example in
 * Playwright's fresh, throwaway profile; makes no maps.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("Copy image puts a 4x PNG of the whole map on the clipboard", async ({ page }) => {
  await page.goto("/linkkit/");
  const button = page.getByRole("button", { name: "Copy image" });
  await button.click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    return { types: item.types, width: bitmap.width, height: bitmap.height };
  });
  expect(copied.types).toContain("image/png");

  // The picture of the whole map, at 4x its drawn size: wider than the
  // screen it was copied from, and a whole multiple of 4 CSS pixels.
  const paper = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".react-flow__node")].map((n) => n.getBoundingClientRect());
    return Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
  });
  expect(copied.width).toBeGreaterThan(paper * 4);
  expect(copied.width % 4).toBe(0);
  expect(copied.height % 4).toBe(0);

  // After a moment the button goes back to its normal word.
  await expect(button).toBeVisible({ timeout: 3_000 });
});

test("Copy as image on a picked group copies just those boxes, at 4x", async ({ page }) => {
  await page.goto("/linkkit/");
  const readPng = () =>
    page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const bitmap = await createImageBitmap(await item.getType("image/png"));
      return { width: bitmap.width, height: bitmap.height };
    });

  // The whole map first, to compare with.
  await page.getByRole("button", { name: "Copy image" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const whole = await readPng();

  // Pick two boxes (click, then Shift+click), right-click one of them.
  const boxes = page.locator(".react-flow__node");
  await boxes.nth(0).click();
  await boxes.nth(1).click({ modifiers: ["Shift"] });
  await boxes.nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Copy as image" }).click();
  await expect(page.getByText("Copied 2 boxes as an image.")).toBeVisible();
  const picked = await readPng();

  // Smaller than the whole map, yet holding both boxes at 4x, in whole
  // CSS pixels.
  const span = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll(".react-flow__node")].map((n) => n.getBoundingClientRect());
    return { width: Math.max(a.right, b.right) - Math.min(a.left, b.left), height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) };
  });
  expect(picked.width * picked.height).toBeLessThan(whole.width * whole.height);
  expect(picked.width).toBeGreaterThanOrEqual(span.width * 4);
  expect(picked.height).toBeGreaterThanOrEqual(span.height * 4);
  expect(picked.width % 4).toBe(0);
  expect(picked.height % 4).toBe(0);
});

/** The PNG on the clipboard: its size. */
const clipboardPng = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item.getType("image/png"));
    return { width: bitmap.width, height: bitmap.height };
  });

test("the selection bar's Copy image copies just the picked boxes", async ({ page }) => {
  await page.goto("/linkkit/");
  await page.getByRole("button", { name: "Copy image" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const whole = await clipboardPng(page);

  const boxes = page.locator(".react-flow__node");
  await boxes.nth(0).click();
  await boxes.nth(1).click({ modifiers: ["Shift"] });
  const bar = page.getByRole("toolbar", { name: "Selected boxes" });
  await bar.getByRole("button", { name: "Copy image" }).click();
  await expect(bar.getByRole("button", { name: "Copied" })).toBeVisible();
  const picked = await clipboardPng(page);
  expect(picked.width * picked.height).toBeLessThan(whole.width * whole.height);
  expect(picked.width % 4).toBe(0);
  // Back to its word after a moment.
  await expect(bar.getByRole("button", { name: "Copy image" })).toBeVisible({ timeout: 3_000 });
});

test("in a bracket, the selection bar copies just the picked matches", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/linkkit/");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "+ New" }).click();
  await page.getByRole("menuitem", { name: "Bracket" }).click();
  await page.getByRole("menuitem", { name: "8 players", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Player name" })).toBeFocused();
  await page.keyboard.press("Escape");
  const rows = page.locator("[data-player-row]");
  await expect(rows).toHaveCount(14);
  await page.mouse.move(5, 400);

  // The whole bracket first, to compare with.
  await page.getByRole("button", { name: "Copy image" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const whole = await clipboardPng(page);

  // A marquee down the semifinals' column picks both semifinals.
  const semiTop = (await rows.nth(8).boundingBox())!;
  const semiBottom = (await rows.nth(11).boundingBox())!;
  const x = semiTop.x + semiTop.width / 2;
  await page.mouse.move(x, semiTop.y - 20);
  await page.mouse.down();
  await page.mouse.move(x + 10, semiBottom.y + semiBottom.height + 20, { steps: 8 });
  await page.mouse.up();
  const bar = page.getByRole("toolbar", { name: "Selected boxes" });
  await expect(bar.getByText("2 selected")).toBeVisible();
  await bar.getByRole("button", { name: "Copy image" }).click();
  await expect(bar.getByRole("button", { name: "Copied" })).toBeVisible();
  const picked = await clipboardPng(page);

  // One column of two matches: narrower and smaller than the bracket.
  expect(picked.width).toBeLessThan(whole.width);
  expect(picked.width * picked.height).toBeLessThan(whole.width * whole.height);
  expect(picked.height % 4).toBe(0);

  // Clean up: the bracket goes (to the trash of this throwaway profile).
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Switch map/ }).click();
  await page.getByRole("menuitem", { name: "This map" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(rows).toHaveCount(0);
});
