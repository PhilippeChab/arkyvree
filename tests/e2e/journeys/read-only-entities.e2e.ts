import { expect, type Locator, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { test } from "@/tests/e2e/fixtures.ts";
import { apiOf } from "@/tests/e2e/support/api.ts";
import { uniqueName } from "@/tests/e2e/support/page.ts";
import { coreRulesetId, forkCoreRuleset } from "@/tests/e2e/support/rulesets.ts";
import { signIn } from "@/tests/e2e/support/signIn.ts";

/**
 * An entity page of the core rules: the entity, by its list and its name, where its page is, its card's title, one of
 * its declared fields, which shows once its ruleset's declarations load, and what it shows of its fields.
 */
interface EntityPage {
  field: string;
  list: "classes" | "items" | "powers" | "skills";
  name: string;
  path: (rulesetId: string, entityId: string) => string;
  shows: (card: Locator) => Promise<void>;
  title: string;
}

const ENTITY_PAGES: EntityPage[] = [
  {
    list: "powers",
    name: "Fireball",
    title: "Spell Details",
    field: "School",
    path: (rulesetId, id) => `/rulesets/${rulesetId}/powers/${id}/customization`,
    shows: async (card) => {
      await expect(card.getByRole("combobox", { name: "School", exact: true })).toHaveText("Evocation");
      await expect(card.getByRole("combobox", { name: "Range", exact: true })).toHaveText("Long");
    },
  },
  {
    list: "items",
    name: "Longsword",
    title: "Item Details",
    field: "Proficiency",
    path: (rulesetId, id) => `/rulesets/${rulesetId}/items/${id}/customization`,
    shows: async (card) => {
      await expect(card.getByRole("combobox", { name: "Proficiency", exact: true })).toHaveText("Martial");
      await expect(card.getByRole("textbox", { name: "Damage", exact: true })).toHaveValue("1d8");
    },
  },
  {
    list: "classes",
    name: "Wizard",
    title: "Class Details",
    field: "Caster Type",
    path: (rulesetId, id) => `/rulesets/${rulesetId}/classes/${id}/levels`,
    shows: async (card) => {
      await expect(card.getByRole("combobox", { name: "Caster Type", exact: true })).toHaveText("Arcane");
      await expect(card.getByRole("combobox", { name: "Bonus Spell Ability", exact: true })).toHaveText(
        "Intelligence",
        { timeout: 10_000 },
      );
    },
  },
  {
    list: "skills",
    name: "Swim",
    title: "Skill Details",
    field: "Usable Without Training",
    path: (rulesetId, id) => `/rulesets/${rulesetId}/skills/${id}`,
    shows: async (card) => {
      await expect(card.getByRole("spinbutton", { name: "Armor Check Penalty Multiplier" })).toHaveValue("2");
      // A switch keeps its state, clicked
      const weighted = card.getByLabel("Impacted by Weight", { exact: true });
      await expect(weighted).toBeChecked();
      await weighted.click({ force: true });
      await expect(weighted).toBeChecked();
    },
  },
];

/** The arrows that open a card's selects and pickers, which a read-only field shows none of. */
function arrowsOf(card: Locator) {
  return card.locator(".MuiSelect-icon, .MuiAutocomplete-popupIndicator");
}

/** The outline of a card's Name field, its box, which a read-only field shows none of. */
function nameOutlineOf(card: Locator) {
  return card.getByRole("textbox", { name: "Name", exact: true }).locator("..").locator("fieldset");
}

/** The id of the entity of the ruleset's list named `name`. */
async function entityId(page: Page, rulesetId: string, list: EntityPage["list"], name: string) {
  const response = await apiOf(page).api.rulesets[":id"][list].$get({
    param: { id: rulesetId },
    query: { search: name },
  });
  const { items } = await parseResponse(response);
  const entity = items.find((item) => item.name === name);
  if (!entity) throw new Error(`The ruleset has no ${name}`);
  return entity.id;
}

/** The card of the entity page open on `page`, once its declared fields have loaded, and its fields' labels in order. */
async function openCard(page: Page, { field, title }: EntityPage) {
  const card = page.getByRole("heading", { name: title, exact: true }).locator("..");
  await expect(card.getByText(field, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  return { card, labels: await card.locator("label").allTextContents() };
}

// A page the viewer can't edit, the core rules', shows the same form as its editor's page, its fields read-only
test.describe("A page the viewer can't edit", () => {
  test.setTimeout(90_000);

  for (const entityPage of ENTITY_PAGES) {
    test(`of ${entityPage.name} shows its editor's form, its fields read-only, with no Save`, async ({
      page,
      ownerUser,
    }) => {
      await signIn(page, ownerUser.email, ownerUser.password);
      const forkId = await forkCoreRuleset(page, uniqueName("Read-Only Fork"));
      const coreId = await coreRulesetId(page);
      // A fork's entities are its source's until it changes them: the same id
      const id = await entityId(page, coreId, entityPage.list, entityPage.name);

      await page.goto(entityPage.path(forkId, id));
      const editable = await openCard(page, entityPage);
      await expect(editable.card.getByRole("button", { name: /^Save$/ })).toBeVisible();
      await expect(nameOutlineOf(editable.card)).toHaveCSS("border-top-style", "solid");
      await expect(arrowsOf(editable.card).first()).toBeVisible();

      await page.goto(entityPage.path(coreId, id));
      const { card, labels } = await openCard(page, entityPage);
      expect(labels).toEqual(editable.labels);
      await entityPage.shows(card);
      await expect(card.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
      await expect(card.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(entityPage.name);
      // Values on display, not inputs: no box, no arrow
      await expect(nameOutlineOf(card)).toHaveCSS("border-top-style", "none");
      for (const arrow of await arrowsOf(card).all()) await expect(arrow).toBeHidden();
      for (const role of ["textbox", "spinbutton", "combobox"] as const)
        for (const input of await card.getByRole(role).all()) await expect(input).not.toBeEditable();
    });
  }

  test("of a ruleset's Settings shows them read-only, with no Save", async ({ page, ownerUser }) => {
    await signIn(page, ownerUser.email, ownerUser.password);
    const forkId = await forkCoreRuleset(page, uniqueName("Read-Only Settings Fork"));
    const ability = page.getByRole("combobox", { name: "Skill Point Ability" });
    await page.goto(`/rulesets/${forkId}/settings`);
    await expect(ability).toHaveText("Intelligence", { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeVisible();

    await page.goto(`/rulesets/${await coreRulesetId(page)}/settings`);
    await expect(ability).toHaveText("Intelligence", { timeout: 10_000 });
    await expect(ability).not.toBeEditable();
    await ability.click();
    await expect(page.getByRole("option", { name: "Wisdom", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Save$/ })).toHaveCount(0);
  });
});
