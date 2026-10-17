import { expect, test, type Page } from "@playwright/test";

/**
 * The map menu (2026-10-17 regroup): the 8 newest maps, the rest under
 * "All maps ▸", a search box past 8 maps, and "+ New ▸" / "This map ▸" /
 * "Backup ▸". Runs in Playwright's fresh, throwaway profile, so the maps
 * it makes vanish with it; it still deletes them, like a user tidying up.
 */

const mapName = (page: Page) => page.getByTitle("Rename map");
const switcher = (page: Page) => page.getByRole("button", { name: /^Switch map/ });

async function newMap(page: Page, name: string) {
  await switcher(page).click();
  await page.getByRole("menuitem", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Map", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Map name" });
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press("Enter");
  await expect(mapName(page)).toHaveText(name);
}

test("map menu: recent 8, All maps, search, This map ▸ Rename and Delete", async ({ page }) => {
  await page.goto("/linkkit/");
  const names = Array.from({ length: 9 }, (_, i) => `ZZ menu ${i + 1}`);
  for (const name of names) await newMap(page, name);

  // 10 maps (the starter example + 9): 8 listed, the oldest two under All maps.
  await switcher(page).click();
  const search = page.getByRole("searchbox", { name: "Find a map" });
  await expect(search).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "All maps (10)" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /ZZ menu 1$/ })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "All maps (10)" }).click();
  await expect(page.getByRole("menuitem", { name: /ZZ menu 1$/ })).toBeVisible();

  // Typing searches every map; Enter opens the first match.
  await search.click();
  await search.fill("menu 1");
  await expect(page.getByRole("menuitem", { name: /ZZ menu \d/ })).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: /^All maps/ })).toHaveCount(0);
  await search.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(mapName(page)).toHaveText("ZZ menu 1");

  // A search nobody matches says so.
  await switcher(page).click();
  await page.getByRole("searchbox", { name: "Find a map" }).fill("no such map");
  await expect(page.getByText("No map called that")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  // This map ▸ Rename opens the name for typing.
  await switcher(page).click();
  await page.getByRole("menuitem", { name: "This map", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const field = page.getByRole("textbox", { name: "Map name" });
  await expect(field).toBeFocused();
  await field.fill("ZZ menu renamed");
  await field.press("Enter");
  await expect(mapName(page)).toHaveText("ZZ menu renamed");

  // Clean up: This map ▸ Delete, for every map the test made.
  for (let i = 0; i < names.length; i++) {
    await switcher(page).click();
    await page.getByRole("menuitem", { name: "This map", exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  }
  await switcher(page).click();
  await expect(page.getByRole("searchbox", { name: "Find a map" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /ZZ menu/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
});
