import { statSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { createCharacter } from "@/tests/e2e/support/characters.ts";
import { apiResponse, filterList, openActionsMenu, selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { fillStrengthModifier } from "@/tests/e2e/support/rulesets.ts";
import { openContext, signedInPage, signIn } from "@/tests/e2e/support/signIn.ts";

/** Renames the character whose sheet is open, in place: clicking its name edits it. */
async function renameInPlace(page: Page, name: string, newName: string) {
  await page.locator(`h5:has-text("${name}")`).first().click();
  const field = page.locator("input:focus");
  await field.fill(newName);
  const renamed = apiResponse(page, "PUT", /\/api\/characters\/[a-f0-9-]+(?:\?|$)/);
  await field.press("Enter");
  await renamed;
  await expect(page.locator(`h5:has-text("${newName}")`)).toBeVisible({ timeout: 15_000 });
}

test.describe("Characters", () => {
  test.setTimeout(90_000);

  test("creating one needs a name, a ruleset and a race", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
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
    await dialog.getByRole("button", { name: /Roll all ability scores/i }).click();
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
    await page.getByRole("button", { name: "More actions" }).first().click({ timeout: 5_000 });
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(wizard).toBeHidden();
    await page.keyboard.press("Escape");
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
    await decrease.getByRole("button", { name: "Decrease" }).click();
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
    await expect(page.locator(`h5:has-text("${name} renamed")`)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "More actions" }).first().click();
    await expect(page.getByRole("menu").getByRole("menuitem", { name: /^Archive$/ })).toBeVisible();
  });

  test("identity edits, a language added and removed, outlast a reload", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const name = `IdentityHero ${Date.now()}`;
    await createCharacter(page, name);
    const save = page.getByRole("button", { name: /^Save$/ }).first();
    const saveIdentity = async () => {
      const saved = apiResponse(page, "PUT", /\/api\/characters\/[a-f0-9-]+(?:\?|$)/);
      await save.click();
      await saved;
      // A saved form is clean again.
      await expect(save).toBeDisabled({ timeout: 10_000 });
      await page.reload();
      await expect(page.locator(`h5:has-text("${name}")`)).toBeVisible({ timeout: 10_000 });
    };

    await selectOption(page, "Alignment", "Chaotic Good");
    await page.locator('input[name="deity"]').fill("Olidammara");
    await page.locator('input[name="age"]').fill("27");
    // Aquan: an exotic language no race knows from the start.
    await page.getByRole("combobox", { name: "Languages" }).click();
    await page.getByRole("option", { name: "Aquan" }).click();
    await page.keyboard.press("Escape");
    await saveIdentity();
    await expect(page.locator('text="Alignment"').first().locator("..").getByRole("combobox")).toHaveText(
      "Chaotic Good",
    );
    await expect(page.locator('input[name="deity"]')).toHaveValue("Olidammara");
    await expect(page.locator('input[name="age"]')).toHaveValue("27");
    const aquan = page.locator(".MuiChip-root").filter({ hasText: "Aquan" });

    await aquan.first().locator(".MuiChip-deleteIcon").click();
    await saveIdentity();
    await expect(aquan).toHaveCount(0);
  });

  test("a share link shows the sheet and its PDF to anyone, until revoked", async ({ browser, ownerUser }) => {
    const name = `Sharable ${Date.now()}`;
    const owner = await signedInPage(browser, ownerUser);
    await createCharacter(owner, name);
    await openActionsMenu(owner, /^Share$/);
    const dialog = owner.getByRole("dialog", { name: "Share Character Sheet" });
    const shared = apiResponse(owner, "POST", /\/api\/characters\/[a-f0-9-]+\/share$/);
    await dialog.getByRole("button", { name: /Generate Link/i }).click();
    await shared;
    const shareUrl = await dialog.locator("input[readonly]").inputValue();
    expect(shareUrl).toMatch(/\/share\/[A-Za-z0-9_-]+$/);

    const anyone = await (await openContext(browser, { acceptDownloads: true })).newPage();
    await anyone.goto(shareUrl);
    await expect(
      anyone.locator(`h5:has-text("${name}"), h4:has-text("${name}"), h3:has-text("${name}")`).first(),
    ).toBeVisible({ timeout: 10_000 });
    const pdf = anyone.waitForResponse((r) => /\/api\/shared\/characters\/[^/]+\/pdf$/.test(r.url()), {
      timeout: 60_000,
    });
    const download = anyone.waitForEvent("download", { timeout: 60_000 });
    await anyone.getByRole("button", { name: "Download PDF" }).first().click();
    expect((await pdf).headers()["content-type"]).toContain("application/pdf");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
    expect(statSync((await file.path())!).size).toBeGreaterThan(0);

    await dialog.getByRole("button", { name: /Revoke Link/i }).click();
    await dialog.getByRole("button", { name: /^Revoke$/ }).click();
    await expect(dialog.getByRole("button", { name: /Generate Link/i })).toBeVisible({ timeout: 5000 });
    const revoked = anyone.waitForResponse((r) => /\/api\/shared\/characters\/[A-Za-z0-9_-]+$/.test(r.url()));
    await anyone.goto(shareUrl);
    expect((await revoked).status()).toBe(404);
    await expect(
      anyone.getByRole("alert").filter({ hasText: /not available or the link has been revoked/i }),
    ).toBeVisible();
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
    await expect(page.locator("text=/Your PDF is being generated/i")).toBeVisible({ timeout: 10_000 });
  });

  test("a modifier added at runtime can be removed", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    await createCharacter(page, `Modifier Hero ${Date.now()}`);
    await openActionsMenu(page, /^Manage Modifiers$/);
    // The manager's title isn't a dialog title: find it by its text.
    const manager = page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: "Manage Modifiers" });
    await expect(manager.getByText("No modifiers")).toBeVisible();

    await manager.getByRole("button", { name: /^Add$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add Modifier" });
    await fillStrengthModifier(dialog, 1);
    const added = apiResponse(page, "POST", /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers(?:\?|$)/);
    await dialog.getByRole("button", { name: /^Create$/ }).click();
    await added;
    const row = manager.locator("table tbody tr").filter({ hasText: /Abilities.*Strength.*Misc/ });
    await expect(row.locator('text="1"').first()).toBeVisible({ timeout: 15_000 });

    await row.getByRole("button", { name: "Delete modifier" }).click();
    const removed = apiResponse(page, "DELETE", /\/api\/characters\/modifiers\/[a-f0-9-]+\/modifiers\/[a-f0-9-]+/);
    await page
      .getByRole("dialog", { name: "Delete Modifier" })
      .getByRole("button", { name: /^Delete$/ })
      .click();
    await removed;
    await expect(manager.getByText("No modifiers")).toBeVisible({ timeout: 15_000 });
  });
});
