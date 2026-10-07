import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

/** Waits for a successful `method` request to a URL matching `url`. Start it before the action that sends it. */
export function apiResponse(page: Page, method: string, url: RegExp) {
  return page.waitForResponse((r) => url.test(r.url()) && r.request().method() === method && r.ok(), {
    timeout: 15_000,
  });
}

/** A name no other test uses: ruleset names are unique across users, and parallel tests can start in the same millisecond. */
export function uniqueName(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

/** Shows the list page's items under the Filter menu's `item`, such as Archived or Shared. */
export async function filterList(page: Page, item: RegExp) {
  await page.getByRole("button", { name: "Filter" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: item }).click();
}

/** Picks `item` in the actions menu of the ruleset, character or campaign on the page. */
export async function openActionsMenu(page: Page, item: string | RegExp) {
  await page.getByRole("button", { name: "More actions" }).first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: item }).click();
}

export async function selectOption(page: Page, label: string, optionText?: string) {
  // Scope to the open MUI dialog (aria-modal="true") when one is showing
  const modalDialog = page.locator('[role="dialog"][aria-modal="true"]');
  const scope = (await modalDialog
    .first()
    .isVisible()
    .catch(() => false))
    ? modalDialog
    : page;
  await scope.locator(`text="${label}"`).first().locator("..").locator('[role="combobox"]').click();
  await page.locator('[role="listbox"]').waitFor({ state: "visible" });
  if (optionText) await page.locator(`[role="option"]:has-text("${optionText}")`).click();
  else await page.locator('[role="option"]').first().click();
}
