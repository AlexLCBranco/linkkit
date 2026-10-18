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
