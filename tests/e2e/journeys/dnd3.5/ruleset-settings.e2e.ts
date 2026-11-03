import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiResponse, uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

// A fork's Settings: its own rules, which it starts with its source's.
test.describe("A fork's Settings", () => {
  test("changes the ability its characters' skill points come from", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await forkCoreRuleset(page, uniqueName("Settings Fork"));

    await page.getByRole("tab", { name: "Settings" }).click();
    const ability = page.getByRole("combobox", { name: "Skill Point Ability" });
    await expect(ability).toHaveText("Intelligence", { timeout: 10_000 });
    await ability.click();
    await page.getByRole("option", { name: "Wisdom", exact: true }).click();
    const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/settings/);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await saved;

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Skill Point Ability" })).toHaveText("Wisdom", { timeout: 10_000 });
  });

  test("gives its characters a feat more at levels 3 and 5, whatever their classes", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await forkCoreRuleset(page, uniqueName("Progression Fork"));

    await page.getByRole("tab", { name: "Settings" }).click();
    const feats = page.getByRole("group", { name: "Feat Advancement" });
    const levels = feats.getByRole("spinbutton", { name: "Level", exact: true });
    // The core rules': a feat every 3 levels, and one more at the first
    await expect(feats.getByRole("spinbutton", { name: "Every N Levels" })).toHaveValue("3", { timeout: 10_000 });
    await expect(levels).toHaveCount(1);
    await expect(levels.first()).toHaveValue("1");
    // A level added takes the first free one, which its input changes
    await feats.getByRole("button", { name: "Add Level" }).click();
    await levels.nth(1).fill("3");
    await feats.getByRole("button", { name: "Add Level" }).click();
    await levels.nth(2).fill("5");
    const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/settings/);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await saved;

    await page.reload();
    await expect(levels).toHaveCount(3, { timeout: 10_000 });
    for (const [index, level] of ["1", "3", "5"].entries()) await expect(levels.nth(index)).toHaveValue(level);
    const increases = page.getByRole("group", { name: "Ability Score Increases" });
    await expect(increases.getByRole("spinbutton", { name: "Every N Levels" })).toHaveValue("4");
  });
});
