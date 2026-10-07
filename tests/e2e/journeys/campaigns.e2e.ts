import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { createCampaign } from "@/tests/e2e/support/campaigns.ts";
import { createCharacter } from "@/tests/e2e/support/characters.ts";
import { apiResponse, filterList, openActionsMenu } from "@/tests/e2e/support/page.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

test.describe("Campaigns", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
  });

  test("creating one needs a ruleset", async ({ page }) => {
    await page.goto("/campaigns");
    await page.getByRole("button", { name: "Create New Campaign" }).click();
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await dialog.locator('input[name="name"]').fill(`Invalid Campaign ${Date.now()}`);
    await dialog.getByRole("button", { name: /^Create$/ }).click();
    await expect(dialog.getByText(/required|select.*ruleset/i)).toBeVisible();
    await expect(page).not.toHaveURL(/\/campaigns\/[a-f0-9-]+/);
  });

  test("a new campaign is listed, and can be renamed", async ({ page }) => {
    const name = `Campaign ${Date.now()}`;
    await createCampaign(page, name);
    await openActionsMenu(page, /^Edit$/);
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last();
    await dialog.locator('input[name="name"]').fill(`${name} renamed`);
    const renamed = apiResponse(page, "PUT", /\/api\/campaigns\/[a-f0-9-]+(?:\?|$)/);
    await dialog.getByRole("button", { name: /Save Changes/ }).click();
    await renamed;
    await expect(page.getByRole("heading", { name: `${name} renamed` })).toBeVisible({ timeout: 15_000 });

    await page.goto("/campaigns");
    await expect(page.locator(`text="${name} renamed"`).first()).toBeVisible();
  });

  test("an archived campaign is listed under Archived until unarchived", async ({ page }) => {
    const name = `Archive Campaign ${Date.now()}`;
    await createCampaign(page, name);
    await openActionsMenu(page, /^Archive$/);
    const archived = apiResponse(page, "DELETE", /\/api\/campaigns\/[a-f0-9-]+(?:\?|$)/);
    await page
      .getByRole("dialog", { name: "Archive Campaign" })
      .getByRole("button", { name: /Archive Campaign/ })
      .click();
    await archived;
    await expect(page).toHaveURL(/\/campaigns(\?|$)/, { timeout: 15_000 });
    await expect(page.locator(`text="${name}"`)).toHaveCount(0);

    await filterList(page, /^Archived$/);
    await expect(page).toHaveURL(/view=archived/);
    await page.locator(`text="${name}"`).first().click();
    const unarchived = apiResponse(page, "POST", /\/api\/campaigns\/[a-f0-9-]+\/unarchive/);
    await openActionsMenu(page, /^Unarchive$/);
    await unarchived;
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15_000 });
  });

  test("the owner links their character, publicly", async ({ page }) => {
    const campaignName = `Link Campaign ${Date.now()}`;
    const characterName = `Link Hero ${Date.now()}`;
    await createCampaign(page, campaignName);
    await createCharacter(page, characterName);

    await page.goto("/campaigns");
    await page.getByRole("heading", { name: campaignName }).first().click();
    await page.getByRole("tab", { name: "Characters", exact: true }).click();
    await page.getByRole("button", { name: "Link Character" }).click();
    const dialog = page.getByRole("dialog", { name: "Link Character to Campaign" });
    await dialog.getByRole("combobox", { name: "Character" }).click();
    await page.getByRole("option", { name: characterName }).click();
    await dialog.getByRole("combobox", { name: "Visibility" }).click();
    await page.getByRole("option", { name: /^Public/ }).click();
    const linked = apiResponse(page, "POST", /\/api\/campaigns\/[a-f0-9-]+\/characters(?:\?|$)/);
    await dialog.getByRole("button", { name: /^Link Character$/ }).click();
    await linked;
    await expect(page.locator(`h6:has-text("${characterName}")`).first()).toBeVisible({ timeout: 15_000 });
  });
});
