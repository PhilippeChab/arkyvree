import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiResponse, uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

// What a kind's section does past listing, as its rules describe it, through the routes by kind: the feats' families
// grouped and expanded, then ungrouped; an item duplicated from its row, then its variants made
test.describe("A fork's sections", () => {
  test.setTimeout(90_000);

  test("group the feats' variants by family, which expands and ungroups", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Families Fork"));
    const grouped = apiResponse(page, "GET", new RegExp(`/api/rulesets/${forkId}/entities/feats/grouped\\?`));
    await page.goto(`/rulesets/${forkId}/feats?search=Weapon%20Focus`);
    await grouped;

    // A family's row counts its variants, and lists them as it expands
    const family = page.getByRole("row", { name: /^Greater Weapon Focus\b.*\d+ variants$/ });
    await expect(family).toBeVisible();
    const variants = apiResponse(page, "GET", new RegExp(`/api/rulesets/${forkId}/entities/feats\\?.*family=`));
    await family.click();
    await variants;
    await expect(page.getByRole("row", { name: /Greater Weapon Focus: Longsword/ })).toBeVisible();

    // Ungrouped, each feat is its own row, ten to a page, its pools beside it: no family's row is left
    const flat = apiResponse(page, "GET", new RegExp(`/api/rulesets/${forkId}/entities/feats\\?(?!.*family=)`));
    await page.getByRole("button", { name: "Group Families" }).click();
    await flat;
    await expect(page).toHaveURL(/[?&]grouped=false/);
    await expect(family).toBeHidden();
    await expect(page.getByRole("columnheader", { name: "Aptitudes" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Greater Weapon Focus: Bastard Sword", exact: true })).toBeVisible();
  });

  test("duplicate an item from its row, then make its variants", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Copies Fork"));
    await page.goto(`/rulesets/${forkId}/items?search=Longsword`);
    const longsword = page.getByRole("row", { name: /^Longsword\b/ }).first();
    await expect(longsword).toBeVisible();

    // Its duplicate's form is named a copy; created, it opens the copy's page
    await longsword.hover();
    await longsword.getByRole("button", { name: "Duplicate" }).click();
    const dialog = page.getByRole("dialog", { name: "Create New Item" });
    await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Longsword (Copy)");
    const duplicated = apiResponse(
      page,
      "POST",
      new RegExp(`/api/rulesets/${forkId}/entities/items/[a-f0-9-]+/duplicate`),
    );
    await dialog.getByRole("button", { name: /^Create$/ }).click();
    await duplicated;
    await expect(page).toHaveURL(new RegExp(`/rulesets/${forkId}/items/[a-f0-9-]+/customization`));
    await expect(page.locator('input[name="name"]')).toHaveValue("Longsword (Copy)");

    // Two variants of the template, listed under their names
    await page.goto(`/rulesets/${forkId}/items?search=Longsword`);
    await longsword.hover();
    await longsword.getByRole("button", { name: "Create Variants" }).click();
    const variantsDialog = page.getByRole("dialog", { name: "Create Variants of Longsword" });
    await variantsDialog.getByRole("button", { name: "Add Variant" }).click();
    const made = apiResponse(page, "POST", new RegExp(`/api/rulesets/${forkId}/entities/items/[a-f0-9-]+/variants`));
    await variantsDialog.getByRole("button", { name: "Create 2 Variants" }).click();
    await made;
    await expect(page.getByText("2 variants created")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Longsword (Copy 1)", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Longsword (Copy 2)", exact: true })).toBeVisible();
  });
});
