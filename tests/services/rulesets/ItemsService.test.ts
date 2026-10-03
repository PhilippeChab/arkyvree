import { describe, expect, test } from "bun:test";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { EntitySnapshots, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { createTestCharacter, createTestRuleset, createTestUserAndRuleset, NIL_UUID } from "@/tests/helpers.ts";

const requirement = {
  level: "1",
  target: "combat.bab",
  value: "5",
  valueType: "number",
  operator: "greater_than_or_equal",
} as const;

/** Gives an item a modifier (with a requirement of its own), a property and a requirement. */
async function customize(itemId: string) {
  const [modifier] = await Modifiers.create(db, {
    sourceId: itemId,
    sourceType: "items",
    target: "abilities.strength.misc",
    value: "2",
    valueType: "number",
    operator: "add",
  });
  await Requirements.create(db, { ...requirement, entityId: modifier.id, entityType: "modifiers" });
  await Properties.create(db, { entityId: itemId, entityType: "items", type: "resistance", value: "Cold" });
  await Requirements.create(db, { ...requirement, entityId: itemId, entityType: "items" });
  return modifier;
}

/** The customizations an item owns, with each modifier's own requirements. */
async function customizationsOf(itemId: string) {
  const modifiers = await Modifiers.findMany(db, { sourceIds: [itemId], sourceType: "items" });
  return {
    modifiers: await Promise.all(
      modifiers.map(async ({ id, target }) => ({
        id,
        target,
        requirements: (await Requirements.findMany(db, { entityIds: [id], entityType: "modifiers" })).map(
          (r) => r.target,
        ),
      })),
    ),
    properties: (await Properties.findMany(db, { entityIds: [itemId], entityType: "items" })).map((p) => p.value),
    requirements: (await Requirements.findMany(db, { entityIds: [itemId], entityType: "items" })).map((r) => r.target),
  };
}

const copiedCustomizations = {
  modifiers: [{ target: "abilities.strength.misc", requirements: ["combat.bab"] }],
  properties: ["Cold"],
  requirements: ["combat.bab"],
};
const noCustomizations = { modifiers: [], properties: [], requirements: [] };

/** A template with a property and a requirement, which its instances read, and a modifier, which they don't. */
async function createTemplate(session: Parameters<typeof ItemsService.createItem>[0], rulesetId: string) {
  const template = await ItemsService.createItem(session, rulesetId, {
    name: "Sword Template",
    isTemplate: true,
  });
  await customize(template.id);
  return template;
}

async function expectTemplateInstance(rulesetId: string, itemId: string, templateId: string) {
  expect(await customizationsOf(itemId)).toEqual(noCustomizations);
  const view = await ItemsService.getItem(rulesetId, itemId);
  expect(view).toMatchObject({
    sourceItemId: templateId,
    isTemplate: false,
    properties: [{ value: "Cold" }],
    requirements: [{ target: "combat.bab" }],
    modifiers: [],
  });
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts,
// and templates' own rules in ItemTemplates.test.ts.
describe("ItemsService", () => {
  test("stores weight and cost to the hundredth, and nothing when they're left out", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const scroll = await ItemsService.createItem(session, ruleset.id, {
      name: "Scroll",
      weight: 0.5,
      costGp: 2.25,
    });
    expect(scroll).toMatchObject({ weight: "0.50", costGp: "2.25" });
    expect(await ItemsService.createItem(session, ruleset.id, { name: "Feather", weight: 0, costGp: 0 })).toMatchObject(
      { weight: "0.00", costGp: "0.00" },
    );
    expect(await ItemsService.createItem(session, ruleset.id, { name: "Rock" })).toMatchObject({
      weight: null,
      costGp: null,
    });

    expect(
      await ItemsService.updateItem(session, ruleset.id, scroll.id, { name: "Scroll", weight: 10, costGp: 100 }),
    ).toMatchObject({ weight: "10.00", costGp: "100.00" });
  });

  test("puts armor on the torso and shields in the off hand, whatever slot is asked for", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    expect(
      await ItemsService.createItem(session, ruleset.id, { name: "Chainmail", type: "Armor", slot: "Other" }),
    ).toMatchObject({ slot: "Torso" });
    expect(await ItemsService.createItem(session, ruleset.id, { name: "Ring", slot: "Finger" })).toMatchObject({
      slot: "Finger",
    });

    const buckler = await ItemsService.createItem(session, ruleset.id, { name: "Buckler", slot: "Other" });
    expect(
      await ItemsService.updateItem(session, ruleset.id, buckler.id, {
        name: "Buckler",
        type: "Shield",
        slot: "Other",
      }),
    ).toMatchObject({ slot: "Off Hand" });
  });

  describe("duplicating", () => {
    test("copies the item's customizations, each modifier with its own requirements", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await ItemsService.createItem(session, ruleset.id, { name: "Cloak" });
      const modifier = await customize(source.id);

      const copy = await ItemsService.duplicateItem(session, ruleset.id, source.id, { name: "Cloak Copy" });
      const copied = await customizationsOf(copy.id);
      expect(copied).toMatchObject(copiedCustomizations);
      expect(copied.modifiers[0].id).not.toBe(modifier.id);
      expect(await customizationsOf(source.id)).toMatchObject(copiedCustomizations);
    });

    test("makes a template's copy an instance of it, with no customizations of its own", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id);
      const copy = await ItemsService.duplicateItem(session, ruleset.id, template.id, { name: "Sword" });
      await expectTemplateInstance(ruleset.id, copy.id, template.id);
    });

    test("throws NotFoundError for a source outside the ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      await expect(ItemsService.duplicateItem(session, ruleset.id, NIL_UUID, { name: "No Source" })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("variants", () => {
    test("copy the source's type, slot, weight, cost and customizations, and take their own names and descriptions", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await ItemsService.createItem(session, ruleset.id, {
        name: "Scroll",
        description: "Blank",
        type: "Other",
        slot: "Other",
        weight: 0.1,
        costGp: 25,
      });
      await customize(source.id);

      const variants = await ItemsService.createVariants(session, ruleset.id, source.id, [
        { name: "Scroll of Healing", description: "Heals 1d8" },
        { name: "Scroll of Light" },
      ]);
      expect(variants).toMatchObject([
        {
          name: "Scroll of Healing",
          description: "Heals 1d8",
          type: "Other",
          slot: "Other",
          weight: "0.10",
          costGp: "25.00",
          sourceItemId: null,
          isTemplate: false,
          rulesetId: ruleset.id,
        },
        // A blank description stays blank rather than falling back to the source's.
        { name: "Scroll of Light", description: null, weight: "0.10", costGp: "25.00" },
      ]);
      const [first, second] = await Promise.all(variants.map((v) => customizationsOf(v.id)));
      expect(first).toMatchObject(copiedCustomizations);
      expect(second).toMatchObject(copiedCustomizations);
      expect(first.modifiers[0].id).not.toBe(second.modifiers[0].id);
    });

    test("of a template, or of an instance of one, are instances of that template", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id);
      const instance = await ItemsService.createItem(session, ruleset.id, {
        name: "Longsword",
        sourceItemId: template.id,
      });

      const [ofTemplate] = await ItemsService.createVariants(session, ruleset.id, template.id, [{ name: "Sword +1" }]);
      const [ofInstance] = await ItemsService.createVariants(session, ruleset.id, instance.id, [
        { name: "Longsword +1" },
      ]);
      await expectTemplateInstance(ruleset.id, ofTemplate.id, template.id);
      await expectTemplateInstance(ruleset.id, ofInstance.id, template.id);
    });

    test("can come from an item the ruleset inherits", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const source = await ItemsService.createItem(session, parent.id, { name: "Parent Scroll", weight: 0.1 });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

      const variants = await ItemsService.createVariants(session, fork.id, source.id, [{ name: "Forked Scroll" }]);
      expect(variants).toMatchObject([{ name: "Forked Scroll", rulesetId: fork.id, weight: "0.10" }]);
    });

    test("are refused to anyone but the owner", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await ItemsService.createItem(session, ruleset.id, { name: "Scroll" });
      const { session: other } = await createTestUserAndRuleset();
      await expect(
        ItemsService.createVariants(other, ruleset.id, source.id, [{ name: "Stolen Scroll" }]),
      ).rejects.toThrow(ForbiddenError);
    });

    test("are refused all together when there are none, more than 50, a repeated name or a taken one", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await ItemsService.createItem(session, ruleset.id, { name: "Scroll" });
      await ItemsService.createItem(session, ruleset.id, { name: "Taken Name" });
      const create = (names: string[]) =>
        ItemsService.createVariants(
          session,
          ruleset.id,
          source.id,
          names.map((name) => ({ name })),
        );

      await expect(create([])).rejects.toThrow(UnprocessableEntityError);
      await expect(create(Array.from({ length: 51 }, (_, i) => `Variant ${i}`))).rejects.toThrow(
        UnprocessableEntityError,
      );
      await expect(create(["Probe", "Probe"])).rejects.toThrow(ConflictError);
      await expect(create(["Probe Alpha", "Taken Name", "Probe Beta"])).rejects.toThrow(ConflictError);
      await expect(ItemsService.createVariants(session, ruleset.id, NIL_UUID, [{ name: "Orphan" }])).rejects.toThrow(
        NotFoundError,
      );

      const { items } = await ItemsService.getItems(ruleset.id, { search: "Probe" }, { limit: 10, page: 1 });
      expect(items).toEqual([]);
    });

    test("point the fork's tombstone at a variant named after a deleted copy", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const inherited = await ItemsService.createItem(session, parent.id, { name: "Ghostly Scroll" });
      const source = await ItemsService.createItem(session, parent.id, { name: "Bulk Source" });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

      const copy = await ItemsService.updateItem(session, fork.id, inherited.id, {
        name: "Ghostly Scroll",
        description: "Edited in fork",
      });
      await ItemsService.deleteItem(session, fork.id, copy.id);
      const [variant] = await ItemsService.createVariants(session, fork.id, source.id, [{ name: "Ghostly Scroll" }]);

      const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id, entityType: "items" });
      expect(snapshots).toMatchObject([{ sourceEntityId: inherited.id, forkedEntityId: variant.id }]);
    });
  });

  test("refuses to delete an item in a character's inventory, even through a ruleset using it as an extension", async () => {
    const { user, session, ruleset: extension } = await createTestUserAndRuleset();
    const item = await ItemsService.createItem(session, extension.id, { name: "Extension Item" });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    await db.insert(inventoryInCharacter).values({ characterId: character.id, itemId: item.id, quantity: 1 });

    await expect(ItemsService.deleteItem(session, extension.id, item.id)).rejects.toThrow(ConflictError);
  });
});
