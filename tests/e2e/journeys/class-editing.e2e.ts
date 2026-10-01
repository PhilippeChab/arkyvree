import { expect, test } from "@/tests/e2e/fixtures.ts";
import { apiResponse, forkCoreRuleset, selectOption, signIn, uniqueName } from "@/tests/e2e/helpers.ts";

/*
 * Writing a class of one's own in a fork: its hit die, a level (its base attack bonus, a save and skill points), and
 * its class skills. A class of its own, not an inherited one: the copy-on-write of inherited entities has tests of its
 * own (fork-changes, cow-*).
 */
test.describe("A class created in a fork", () => {
  test("gets a level and a class skill, which it can lose again", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Class Fork"));
    const name = uniqueName("Test Class");

    // Created, it opens on its levels, none yet
    await page.goto(`/rulesets/${forkId}/classes`);
    await page.getByRole("button", { name: "Add Class" }).click();
    const create = page.getByRole("dialog", { name: "Add New Class" });
    await create.getByLabel("Name", { exact: true }).fill(name);
    await selectOption(page, "Hit Die", "d10");
    await expect(create.getByRole("combobox", { name: "Hit Die" })).toHaveText("d10");
    await create.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(new RegExp(`/rulesets/${forkId}/classes/[a-f0-9-]+/levels`), { timeout: 10_000 });
    // Its editor's overview edits it in place
    await expect(page.getByRole("combobox", { name: "Hit Die" })).toHaveText("d10");
    await expect(page.getByText("No levels", { exact: true })).toBeVisible();

    // A level: the table shows what it was given, after a reload too
    await page.getByRole("button", { name: "Add Level" }).click();
    const level = page.getByRole("dialog", { name: "Create New Level" });
    await level.getByLabel("Level", { exact: true }).fill("1");
    await level.getByLabel("Base Attack Bonus").fill("1");
    await level.getByLabel("Fortitude Save").fill("2");
    await level.getByLabel("Skill Points").fill("4");
    const created = apiResponse(page, "POST", /\/classes\/[a-f0-9-]+\/levels$/);
    await level.getByRole("button", { name: "Create" }).click();
    await created;
    await page.reload();
    const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "+1", exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row.getByRole("cell", { name: "+2", exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: "4", exact: true })).toBeVisible();

    // A class skill, found by search, kept after a reload, then removed
    await page.getByRole("tab", { name: "Skills" }).click();
    await expect(page.getByText("No class skills assigned", { exact: true })).toBeVisible();
    await page.getByLabel("Add Skill").fill("Climb");
    const added = apiResponse(page, "POST", /\/classes\/[a-f0-9-]+\/skills$/);
    // An option's name is the skill's, then its description
    await page.getByRole("option", { name: /^Climb\b/ }).click();
    await added;
    await page.reload();
    const skill = page.locator(".MuiChip-root").filter({ hasText: /^Climb$/ });
    await expect(skill).toBeVisible({ timeout: 10_000 });

    await skill.locator(".MuiChip-deleteIcon").click();
    const removed = apiResponse(page, "DELETE", /\/classes\/[a-f0-9-]+\/skills\//);
    await page.getByRole("dialog", { name: "Remove Skill" }).getByRole("button", { name: "Remove" }).click();
    await removed;
    await expect(skill).toHaveCount(0);
    await expect(page.getByText("No class skills assigned", { exact: true })).toBeVisible();
  });
});
