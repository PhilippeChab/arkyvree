import { describe, expect, test } from "bun:test";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { EntitySnapshots } from "@/server/repositories/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { customize, findCustomizations } from "@/tests/support/customizations.ts";
import { createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

/** The property `customize` gives an item. */
const COLD_RESISTANCE = { type: "resistance", value: "Cold" };

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
  await customize("items", template.id, { property: COLD_RESISTANCE });
  return template;
}

/** The customizations an item owns, by their targets and values, with each modifier's own requirements. */
async function customizationsOf(itemId: string) {
  const { modifiers, modifierRequirements, properties, requirements } = await findCustomizations("items", itemId);
  return {
    modifiers: modifiers.map(({ id, target }) => ({
      id,
      target,
      requirements: modifierRequirements.filter((r) => r.entityId === id).map((r) => r.target),
    })),
    properties: properties.map((p) => p.value),
    requirements: requirements.map((r) => r.target),
  };
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

  test("describes where a character carrying it can place it", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const sword = await ItemsService.createItem(session, ruleset.id, { name: "Sword", type: "Weapon" });
    const ring = await ItemsService.createItem(session, ruleset.id, { name: "Ring", slot: "Finger" });
    expect((await ItemsService.getItem(ruleset.id, sword.id)).placement).toMatchObject({ hand: true, slot: null });
    expect((await ItemsService.getItem(ruleset.id, ring.id)).placement).toMatchObject({
      charges: null,
      hand: false,
      slot: "Finger",
    });
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
      const modifier = await customize("items", source.id, { property: COLD_RESISTANCE });

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

    test("doesn't find a source outside the ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      await expectRefusedWith(ItemsService.duplicateItem(session, ruleset.id, NIL_UUID, { name: "No Source" }), 404);
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
      await customize("items", source.id, { property: COLD_RESISTANCE });

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
      expect(ItemsService.createVariants(other, ruleset.id, source.id, [{ name: "Stolen Scroll" }])).rejects.toThrow(
        ForbiddenError,
      );
    });

    test("are refused all together when a name repeats or is taken", async () => {
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

      await expectRefusedWith(create(["Probe", "Probe"]), 409);
      await expectRefusedWith(create(["Probe Alpha", "Taken Name", "Probe Beta"]), 409);
      await expectRefusedWith(ItemsService.createVariants(session, ruleset.id, NIL_UUID, [{ name: "Orphan" }]), 404);

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

    await expectRefusedWith(ItemsService.deleteItem(session, extension.id, item.id), 409);
  });
});
