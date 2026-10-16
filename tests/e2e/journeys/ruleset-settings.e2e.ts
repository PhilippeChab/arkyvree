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

  test("gives its characters a feat more at a level, whatever their classes", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await forkCoreRuleset(page, uniqueName("Progression Fork"));

    await page.getByRole("tab", { name: "Settings" }).click();
    const featsAt = (level: number) =>
      page.getByRole("group", { name: "Feat Advancement" }).getByRole("spinbutton", { name: `Level ${level}` });
    // The core rules': one at the third level, none at the fifth
    await expect(featsAt(3)).toHaveValue("1", { timeout: 10_000 });
    await expect(featsAt(5)).toHaveValue("0");
    await featsAt(3).fill("2");
    await featsAt(5).fill("1");
    const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/settings/);
    await page.getByRole("button", { name: /^Save$/ }).click();
    await saved;

    await page.reload();
    await expect(featsAt(3)).toHaveValue("2", { timeout: 10_000 });
    await expect(featsAt(5)).toHaveValue("1");
    const increasesAt = (level: number) =>
      page.getByRole("group", { name: "Ability Score Increases" }).getByRole("spinbutton", { name: `Level ${level}` });
    await expect(increasesAt(4)).toHaveValue("1");
  });
});
