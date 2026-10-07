import { expect, type Page } from "@playwright/test";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiResponse, openActionsMenu, selectOption, uniqueName } from "@/tests/e2e/support/page.ts";
import { forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

/**
 * A fork's own entities of each kind with a page of its own: created from its section, renamed on its page (surviving a
 * reload), and deleted from there.
 */
const KINDS: { fill?: (page: Page) => Promise<void>; label: string; section: string }[] = [
  { section: "languages", label: "Language" },
  { section: "mechanics", label: "Mechanic" },
  { section: "aptitudes", label: "Aptitude" },
  { section: "saves", label: "Save", fill: (page) => selectOption(page, "Linked Ability", "Wisdom") },
  { section: "skills", label: "Skill", fill: (page) => selectOption(page, "Primary Ability", "Wisdom") },
];

test.describe("A fork's entities", () => {
  test.setTimeout(90_000);

  for (const { section, label, fill } of KINDS) {
    test(`a ${label.toLowerCase()} is created, renamed and deleted`, async ({ page, ownerUser }) => {
      await signIn(page, ownerUser.email, ownerUser.password);
      const forkId = await forkCoreRuleset(page, uniqueName(`${label} Fork`));
      const name = `Test ${label} ${Date.now()}`;
      const detailPage = new RegExp(`/rulesets/${forkId}/${section}/[a-f0-9-]+`);

      await page.goto(`/rulesets/${forkId}/${section}`);
      await page.getByRole("button", { name: `Add ${label}` }).click();
      const dialog = page.getByRole("dialog", { name: `Create New ${label}` });
      await dialog.getByLabel("Name", { exact: true }).fill(name);
      await fill?.(page);
      const created = apiResponse(page, "POST", new RegExp(`/api/rulesets/${forkId}/${section}$`));
      await dialog.getByRole("button", { name: /^Create$/ }).click();
      await created;
      // Creating it opens its page, whose form fills in once the entity has loaded (the closing dialog's has the name too)
      await expect(page).toHaveURL(detailPage);
      await expect(page.getByText(`${label} Details`)).toBeVisible();
      const nameField = page.getByLabel("Name", { exact: true });
      await expect(nameField).toHaveValue(name);

      await nameField.fill(`${name} renamed`);
      const saved = apiResponse(page, "PUT", new RegExp(`/api/rulesets/${forkId}/${section}/[a-f0-9-]+`));
      await page.getByRole("button", { name: /^Save$/ }).click();
      await saved;
      await page.reload();
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(`${name} renamed`, { timeout: 10_000 });

      // The section lists it under its new name, and opens it
      await page.getByRole("link", { name: "Back", exact: true }).click();
      await page.getByPlaceholder(/^Search /).fill(name);
      // The search applied (the header and its one row), so the list doesn't re-render under the click
      await expect(page).toHaveURL(/[?&]search=/);
      await expect(page.getByRole("row")).toHaveCount(2);
      await page.getByRole("cell", { name: `${name} renamed`, exact: true }).click();
      await expect(page).toHaveURL(detailPage);
      // The address changes before the page does: its actions menu is the ruleset's until then
      await expect(page.getByText(`${label} Details`)).toBeVisible();

      await openActionsMenu(page, /^Delete$/);
      const deleted = apiResponse(page, "DELETE", new RegExp(`/api/rulesets/${forkId}/${section}/[a-f0-9-]+`));
      await page
        .getByRole("dialog", { name: `Delete ${label}` })
        .getByRole("button", { name: /^Delete$/ })
        .click();
      await deleted;
      await expect(page).not.toHaveURL(detailPage);
      await page.getByPlaceholder(/^Search /).fill(name);
      // The search ran: the list is empty, not loading
      await expect(page.getByText("No matches", { exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: `${name} renamed`, exact: true })).toHaveCount(0);
    });
  }
});
