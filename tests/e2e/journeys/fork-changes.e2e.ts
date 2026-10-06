import type { Page } from "@playwright/test";

import { expect, test } from "@/tests/e2e/fixtures.ts";
import { apiResponse, openActionsMenu, uniqueName } from "@/tests/e2e/support/page.ts";
import {
  forkCoreRuleset,
  openFeat,
  openRace,
  renameEntity,
  visitCoreRulesetList,
} from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

/** Opens the fork's Local Changes, from its page. */
async function openLocalChanges(page: Page, forkId: string) {
  await page.goto(`/rulesets/${forkId}`);
  await openActionsMenu(page, /^Local Changes/);
  const dialog = page.getByRole("dialog").filter({ hasText: "Local Changes" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Restores the renamed entity listed in the Local Changes dialog, under `group`, which leaves the fork with no changes. */
async function restore(page: Page, dialog: ReturnType<Page["getByRole"]>, group: string, renamed: string) {
  await expect(dialog.getByText(group, { exact: true })).toBeVisible();
  const row = dialog.getByRole("listitem").filter({ hasText: renamed });
  await expect(row.locator(".MuiChip-root", { hasText: "modified" })).toBeVisible();
  const restored = apiResponse(page, "POST", /\/api\/rulesets\/[a-f0-9-]+\/entities\/[^/]+\/[^/]+\/restore/);
  await row.getByRole("button", { name: "Revert to parent version" }).click();
  await restored;
  await expect(dialog.getByText("No local changes")).toBeVisible({ timeout: 15_000 });
}

test.describe("Changes to a fork", () => {
  test.setTimeout(90_000);

  test("a renamed race is the fork's alone, its only local change, until restored", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkName = uniqueName("COW Fork");
    const renamed = `Wandering Folk ${Date.now()}`;
    const forkId = await forkCoreRuleset(page, forkName);
    await openRace(page, "Human");
    await renameEntity(page, renamed);

    // The fork lists every race, and only the renamed one under Local Changes.
    await page.goto(`/rulesets/${forkId}/races`);
    const rows = page.locator("table tbody tr");
    await expect(page.locator(`text="${renamed}"`).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("table tbody").getByText("Dwarf", { exact: true })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Local Changes" });
    await toggle.click();
    await expect(page).toHaveURL(/childOnly=true/);
    await expect(rows).toHaveCount(1, { timeout: 10_000 });
    await expect(rows.first()).toContainText(renamed);
    await toggle.click();
    await expect(page).toHaveURL(/childOnly=false/);
    // Wait for an inherited race before counting: the renamed row alone is visible at once.
    await expect(page.locator("table tbody").getByText("Dwarf", { exact: true })).toBeVisible({ timeout: 10_000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(5);

    // The core rules keep their Human.
    await visitCoreRulesetList(page);
    await page.getByRole("heading", { name: "Core SRD 3.5", level: 2 }).first().click();
    await page.getByRole("tab", { name: "Races" }).click();
    await expect(page.getByRole("cell", { name: "Human", exact: true }).first()).toBeVisible();
    await expect(page.locator(`text="${renamed}"`)).toHaveCount(0);

    await restore(page, await openLocalChanges(page, forkId), "Races", renamed);
  });

  test("a renamed feat is listed under Feats in Local Changes, until restored", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const renamed = `Feat Override Test ${Date.now()}`;
    const forkId = await forkCoreRuleset(page, uniqueName("Feat Override Fork"));
    await openFeat(page, "Toughness");
    await renameEntity(page, renamed);
    await restore(page, await openLocalChanges(page, forkId), "Feats", renamed);
  });

  test("a new feat is listed with the inherited ones, and under Local Changes", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const featName = `Custom Feat ${Date.now()}`;
    const forkId = await forkCoreRuleset(page, uniqueName("Add-Feat Fork"));
    await page.getByRole("tab", { name: "Feats" }).click();
    await page.getByRole("button", { name: "Add Feat" }).click();
    const dialog = page.getByRole("dialog", { name: "Create New Feat" });
    await dialog.getByLabel("Name", { exact: true }).fill(featName);
    // A feat needs an aptitude, and not a spell list's: General is for feats only.
    const aptitudes = dialog.getByRole("combobox", { name: "Aptitudes" });
    await aptitudes.click();
    await aptitudes.fill("General");
    await page
      .getByRole("option", { name: /^General$/ })
      .first()
      .click();
    await page.keyboard.press("Escape");
    const created = apiResponse(page, "POST", /\/api\/rulesets\/[a-f0-9-]+\/feats(?:\?|$)/);
    await dialog.getByRole("button", { name: /^Create$/ }).click();
    await created;
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await page.goto(`/rulesets/${forkId}/feats`);
    await page.getByPlaceholder("Search feats...").fill(featName);
    const row = page.locator("table tbody").getByText(featName, { exact: true }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Local Changes" }).click();
    await expect(page).toHaveURL(/childOnly=true/);
    await expect(row).toBeVisible({ timeout: 10_000 });
  });
});
