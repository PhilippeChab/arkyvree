import { expect, type Page } from "@playwright/test";

import { filterList } from "./page.ts";

/** Opens a character shared with the user, from the Shared view of their characters. */
export async function openSharedCharacter(page: Page, name: string) {
  await page.goto("/characters");
  await filterList(page, /^Shared$/);
  await page.locator(`text="${name}"`).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 10_000 });
}
