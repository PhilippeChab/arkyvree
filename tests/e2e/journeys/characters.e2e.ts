import { statSync } from "node:fs";

import { expect, type Page } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { addFirstLevel, createCharacter } from "@/tests/e2e/support/characters.ts";
import { apiResponse, filterList, openActionsMenu, selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { fillStrengthModifier, forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { openContext, signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

/** Renames the character whose sheet is open, in place: clicking its name edits it. */
async function renameInPlace(page: Page, name: string, newName: string) {
  await page.getByRole("heading", { level: 1 }).getByRole("button", { name }).click();
  const field = page.locator("input:focus");
  await field.fill(newName);
  const renamed = apiResponse(page, "PUT", /\/api\/characters\/[a-f0-9-]+(?:\?|$)/);
  await field.press("Enter");
  await renamed;
  await expect(page.getByRole("heading", { level: 1, name: newName })).toBeVisible({ timeout: 15_000 });
}

test.describe("Characters", () => {
  test.setTimeout(90_000);

  // The test's own user, who owns no ruleset: the dialog starts on none, which it asks for
  test("creating one needs a name, a ruleset and a race", async ({ page, user }) => {
    await signIn(page, user.email, user.password);
    await page.goto("/characters");
    await page.getByRole("button", { name: "Create Character" }).click();
    const dialog = page.getByRole("dialog", { name: "Create New Character" });
    const submit = dialog.getByRole("button", { name: /^Create$/ });

    await submit.click();
    await expect(dialog.getByText(/Name is required/i)).toBeVisible();
    await expect(dialog.getByText(/Ruleset is required/i)).toBeVisible();
    const name = `Validation Hero ${Date.now()}`;
    await dialog.locator('input[name="name"]').fill(name);
    await submit.click();
    await expect(dialog.getByText(/Ruleset is required/i)).toBeVisible();
    await expect(dialog.getByText(/Name is required/i)).toHaveCount(0);

    // The race select shows its error by its style only: the dialog must stay open.
    const races = page.waitForResponse((r) => r.url().includes("/api/characters/available-races") && r.ok());
    await selectOption(page, "Ruleset", "Core SRD 3.5");
    await races;
    await submit.click();
    await expect(dialog).toBeVisible();
    await expect(page).not.toHaveURL(/\/characters\/[a-f0-9-]+/);

    await selectOption(page, "Race");
    await dialog.locator('input[name="height"]').fill("5 feet 8 inches");
    await dialog.locator('input[name="weight"]').fill("150 lbs");
    await dialog.getByRole("button", { name: /^Roll All$/ }).click();
    await selectOption(page, "Alignment");
    await selectOption(page, "Gender");
    await submit.click();
    await expect(page).toHaveURL(/\/characters\/[a-f0-9-]+/, { timeout: 15_000 });

    // The new character opens the Add Level wizard once: closed, it stays closed when the character changes.
    const wizard = page.getByRole("dialog", { name: "Add Level" });
    await expect(wizard).toBeVisible({ timeout: 10_000 });
    await wizard.getByRole("button", { name: "Cancel" }).click();
    await expect(wizard).toBeHidden();
    await renameInPlace(page, name, `${name} renamed`);
    // A reopened wizard would cover the page: its actions menu still opens, the wizard closed
    await page.getByRole("button", { name: "More Actions" }).first().click({ timeout: 5_000 });
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(wizard).toBeHidden();
    await page.keyboard.press("Escape");
  });

  test("a new character starts on the user's own ruleset, its age empty", async ({ page, user }) => {
    await signIn(page, user.email, user.password);
    const rulesetName = uniqueName("Own Rules");
    await forkCoreRuleset(page, rulesetName);
    await page.goto("/characters");
    await page.getByRole("button", { name: "Create Character" }).click();
    const dialog = page.getByRole("dialog", { name: "Create New Character" });

    await expect(dialog.getByRole("combobox", { name: "Ruleset" })).toHaveValue(rulesetName, { timeout: 10_000 });
    await expect(dialog.locator('input[name="age"]')).toHaveValue("");
  });

  test("a ruleset picked before the user's own is known stays picked", async ({ page, user }) => {
    await signIn(page, user.email, user.password);
    await forkCoreRuleset(page, uniqueName("Own Rules"));
    // The user's own rulesets answer only once a ruleset is picked
    const ownRulesets = /\/api\/rulesets\?.*scope=forked/;
    let answer = () => {};
    const picked = new Promise<void>((resolve) => (answer = resolve));
    await page.route(ownRulesets, async (route) => {
      await picked;
      await route.continue();
    });
    await page.goto("/characters");
    await page.getByRole("button", { name: "Create Character" }).click();
    const dialog = page.getByRole("dialog", { name: "Create New Character" });
    await selectOption(page, "Ruleset", "Core SRD 3.5");

    const answered = page.waitForResponse(ownRulesets);
    answer();
    await answered;
    // Two frames: the answer is in the form, or would be
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(dialog.getByRole("combobox", { name: "Ruleset" })).toHaveValue("Core SRD 3.5");
  });

  test("ability scores raise and lower from the sheet, lowering asking once, each kept after a reload", async ({
    page,
    ownerUser,
  }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, uniqueName("Abilities Hero"));
    const raise = page.getByRole("button", { name: "Raise base Strength" });
    const lower = page.getByRole("button", { name: "Lower base Strength" });
    const base = raise.locator("..").getByText(/^Base: \d+$/);
    // The ability's card: its name's block, the one with its buttons
    const strength = page
      .getByText(/^strength$/i)
      .locator("..")
      .filter({ has: raise });
    const decrease = page.getByRole("dialog", { name: "Decrease Ability Score" });
    const saved = () => apiResponse(page, "PUT", /\/api\/characters\/[a-f0-9-]+\/abilities$/);

    await expect(base).toHaveText("Base: 10", { timeout: 10_000 });
    for (const _ of [1, 2]) {
      const save = saved();
      await raise.click();
      await save;
    }
    await page.reload();
    await expect(base).toHaveText("Base: 12", { timeout: 10_000 });
    await expect(strength).toContainText("+1");

    // Lowering a score may break prerequisites: it asks first, then not again this session
    const confirmed = saved();
    await lower.click();
    await decrease.getByRole("button", { name: "Decrease Ability Score" }).click();
    await confirmed;
    await expect(base).toHaveText("Base: 11");
    const again = saved();
    await lower.click();
    await again;
    await expect(decrease).toHaveCount(0);
    await page.reload();
    await expect(base).toHaveText("Base: 10", { timeout: 10_000 });
    await expect(strength).toContainText("+0");
  });

  test("one renamed in place and archived is listed under Archived until unarchived", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `Archive Hero ${Date.now()}`;
    await createCharacter(page, name);

    await renameInPlace(page, name, `${name} renamed`);

    await openActionsMenu(page, /^Archive$/);
    const archived = apiResponse(page, "DELETE", /\/api\/characters\/[a-f0-9-]+$/);
    await page
      .getByRole("dialog", { name: "Archive Character" })
      .getByRole("button", { name: /^Archive Character$/ })
      .click();
    await archived;
    await expect(page).toHaveURL(/\/characters(\?|$)/, { timeout: 10_000 });
    await expect(page.locator(`text="${name} renamed"`)).toHaveCount(0, { timeout: 15_000 });

    await filterList(page, /^Archived$/);
    await expect(page).toHaveURL(/view=archived/);
    await page.locator(`text="${name} renamed"`).first().click();
    await openActionsMenu(page, /^Unarchive$/);
    await expect(page.getByRole("heading", { level: 1, name: `${name} renamed` })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "More Actions" }).first().click();
    await expect(page.getByRole("menu").getByRole("menuitem", { name: /^Archive$/ })).toBeVisible();
  });

  test("identity edits, private notes, a language added and removed, outlast a reload", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `IdentityHero ${Date.now()}`;
    // Intelligence 12: one language to pick, of any kind but a secret one
    await createCharacter(page, name, { Intelligence: 12 });
    const save = page.getByRole("button", { name: /^Save$/ }).first();
    const saveIdentity = async () => {
      const saved = apiResponse(page, "PUT", /\/api\/characters\/[a-f0-9-]+(?:\?|$)/);
      await save.click();
      await saved;
      // A saved form is clean again.
      await expect(save).toBeDisabled({ timeout: 10_000 });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 10_000 });
    };

    await selectOption(page, "Alignment", "Chaotic Good");
    await page.locator('input[name="deity"]').fill("Olidammara");
    await page.locator('input[name="age"]').fill("27");
    const privateNotes = page.getByRole("textbox", { name: "Private Notes" });
    await privateNotes.fill("Owes the thieves' guild");
    // Aquan: an exotic language no race knows from the start. Druidic, a secret one, isn't offered: once the rules'
    // options are there, it isn't among them
    await page.getByRole("combobox", { name: "Languages" }).click();
    const aquanOption = page.getByRole("option", { name: "Aquan" });
    await expect(aquanOption).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("option", { name: "Druidic" })).toHaveCount(0);
    await aquanOption.click();
    await page.keyboard.press("Escape");
    // The Common its race grants stays, without a control to remove it, and its one pick is spent
    const common = page.locator(".MuiChip-root").filter({ hasText: "Common" });
    await expect(common).toHaveCount(1);
    await expect(common.locator(".MuiChip-deleteIcon")).toHaveCount(0);
    await expect(page.locator(".MuiChip-root").filter({ hasText: "Aquan" }).locator(".MuiChip-deleteIcon")).toHaveCount(
      1,
    );
    // Its Intelligence of 12 gives it that one pick: the picker offers no other
    await page.getByRole("combobox", { name: "Languages" }).click();
    await expect(page.getByText("No language left to pick")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await saveIdentity();
    await expect(page.locator('text="Alignment"').first().locator("..").getByRole("combobox")).toHaveText(
      "Chaotic Good",
    );
    await expect(page.locator('input[name="deity"]')).toHaveValue("Olidammara");
    await expect(page.locator('input[name="age"]')).toHaveValue("27");
    await expect(privateNotes).toHaveValue("Owes the thieves' guild");
    const aquan = page.locator(".MuiChip-root").filter({ hasText: "Aquan" });

    await aquan.first().locator(".MuiChip-deleteIcon").click();
    await saveIdentity();
    await expect(aquan).toHaveCount(0);
  });

  test("a share link shows the sheet and its PDF to anyone, until revoked", async ({ browser, ownerUser }) => {
    const name = `Sharable ${Date.now()}`;
    const owner = await signedInPage(browser, ownerUser);
    const characterId = await createCharacter(owner, name);
    await addFirstLevel(owner, characterId, "Fighter");
    await openActionsMenu(owner, /^Share$/);
    const dialog = owner.getByRole("dialog", { name: "Share Character Sheet" });
    const shared = apiResponse(owner, "POST", /\/api\/characters\/[a-f0-9-]+\/share$/);
    await dialog.getByRole("button", { name: /Generate Link/i }).click();
    await shared;
    const shareUrl = await dialog.locator("input[readonly]").inputValue();
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);

    const anyone = await (await openContext(browser, { acceptDownloads: true })).newPage();
    await anyone.goto(shareUrl);
    await expect(anyone.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 10_000 });
    // A viewer reads the sheet: a class's levels, without a level to add or edit
    await anyone.getByRole("button", { name: "Fighter 1 Levels" }).click();
    const levels = anyone.getByRole("dialog", { name: "Fighter Levels" });
    await expect(levels.getByText("Level 1", { exact: true })).toBeVisible();
    await expect(levels.getByRole("button")).toHaveCount(0);
    await anyone.keyboard.press("Escape");
    await expect(levels).toBeHidden();
    const pdf = anyone.waitForResponse((r) => /\/api\/shared\/characters\/[^/]+\/pdf$/.test(r.url()), {
      timeout: 60_000,
    });
    const download = anyone.waitForEvent("download", { timeout: 60_000 });
    await openActionsMenu(anyone, /^Download PDF$/);
    expect((await pdf).headers()["content-type"]).toContain("application/pdf");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(statSync((await file.path())!).size).toBeGreaterThan(0);

    await dialog.getByRole("button", { name: /Revoke Link/i }).click();
    await owner.getByRole("dialog", { name: "Revoke Link" }).getByRole("button", { name: "Revoke Link" }).click();
    await expect(dialog.getByRole("button", { name: /Generate Link/i })).toBeVisible({ timeout: 5000 });
    const revoked = anyone.waitForResponse((r) => /\/api\/shared\/characters\/[A-Za-z0-9_-]+$/.test(r.url()));
    await anyone.goto(shareUrl);
    expect((await revoked).status()).toBe(404);
    await expect(anyone.getByRole("alert").filter({ hasText: /Character sheet not found/i })).toBeVisible();
    await expect(anyone.locator(`text="${name}"`)).toHaveCount(0);

    await owner.context().close();
    await anyone.context().close();
  });

  // A worker makes the PDF later: tests/jobs/generatePdf.test.ts runs that job.
  test("the owner's PDF is queued", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `OwnerPdf ${Date.now()}`);
    const queued = page.waitForResponse(
      (r) => /\/api\/characters\/[^/]+\/pdf$/.test(r.url()) && r.request().method() === "POST",
    );
    await openActionsMenu(page, /^Download PDF$/);
    expect((await queued).status()).toBe(202);
    await expect(page.locator("text=/Generating your PDF/i")).toBeVisible({ timeout: 10_000 });
  });

  test("a modifier added at runtime can be removed", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `Modifier Hero ${Date.now()}`);
    await openActionsMenu(page, /^Manage Modifiers$/);
    const manager = page.getByRole("dialog", { name: "Manage Modifiers" });
    await expect(manager.getByText("No modifiers")).toBeVisible();

    await manager.getByRole("button", { name: "Add Modifier" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Modifier" });
    await fillStrengthModifier(dialog, 1);
    const added = apiResponse(page, "POST", /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers(?:\?|$)/);
    await dialog.getByRole("button", { name: /^Add Modifier$/ }).click();
    await added;
    const row = manager.locator("table tbody tr").filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(row.locator('text="1"').first()).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: "Delete" }).click();
    const removed = apiResponse(page, "DELETE", /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers\/[a-f0-9-]+/);
    await page
      .getByRole("dialog", { name: "Delete Modifier" })
      .getByRole("button", { name: /^Delete$/ })
      .click();
    await removed;
    await expect(manager.getByText("No modifiers")).toBeVisible({ timeout: 15_000 });
  });
});
