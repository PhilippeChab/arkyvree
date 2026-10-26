import { describe, expect, test } from "bun:test";

import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Activities, CharacterInventory, Entities, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { findCustomizations } from "@/tests/support/customizations.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { customize } from "@/tests/support/dnd3.5/customizations.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import {
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_MADE_OF,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The field `customize` gives an item: what it's made of. */
const COLD_IRON = { fields: { [ITEM_MADE_OF]: ["Cold Iron"] }, links: {} };

const copiedCustomizations = {
  modifiers: [{ target: "abilities.strength.misc", requirements: ["combat.bab"] }],
  values: ["Cold Iron"],
  requirements: ["combat.bab"],
};
const noCustomizations = { modifiers: [], values: [], requirements: [] };

/**
 * A weapon template with a field and a requirement, which its instances read, and a modifier, which they don't; and
 * the weight and cost `columns` give it, by their stored fields.
 */
async function createTemplate(session: Session, rulesetId: string, columns: Record<string, number> = {}) {
  const template = await EntitiesService.createEntity(session, rulesetId, "items", {
    name: "Sword Template",
    fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true, ...columns },
  });
  await customize("items", template.id, { values: COLD_IRON });
  return template;
}

/** The customizations an item owns, by their targets and values, with each modifier's own requirements. */
async function customizationsOf(itemId: string) {
  const { modifiers, modifierRequirements, values, requirements } = await findCustomizations("items", itemId);
  return {
    modifiers: modifiers.map(({ id, target }) => ({
      id,
      target,
      requirements: modifierRequirements.filter((r) => r.entityId === id).map((r) => r.target),
    })),
    values: Object.values(values.fields).flat(),
    requirements: requirements.map((r) => r.target),
  };
}

async function expectTemplateInstance(rulesetId: string, itemId: string, templateId: string) {
  expect(await customizationsOf(itemId)).toEqual(noCustomizations);
  const view = await EntitiesService.getEntity(rulesetId, "items", itemId);
  expect(view).toMatchObject({
    fields: { [ITEM_IS_TEMPLATE]: false, [ITEM_MADE_OF]: "Cold Iron" },
    links: [{ role: "madeFrom", toId: templateId }],
    requirements: [{ target: "combat.bab" }],
    modifiers: [],
  });
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts,
// and templates' own rules in ItemTemplates.test.ts.
describe("EntitiesService: items", () => {
  test("stores weight and cost to the hundredth, and none when they're left out", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const scroll = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Scroll",
      fields: { [ITEM_WEIGHT]: 0.5, [ITEM_COST_GP]: 2.25 },
    });
    expect(scroll.fields).toMatchObject({ [ITEM_WEIGHT]: 0.5, [ITEM_COST_GP]: 2.25 });
    expect(
      (
        await EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Feather",
          fields: { [ITEM_WEIGHT]: 0, [ITEM_COST_GP]: 0 },
        })
      ).fields,
    ).toMatchObject({ [ITEM_WEIGHT]: 0, [ITEM_COST_GP]: 0 });
    const { fields: rock } = await EntitiesService.createEntity(session, ruleset.id, "items", { name: "Rock" });
    expect([rock[ITEM_WEIGHT], rock[ITEM_COST_GP]]).toEqual([null, null]);

    expect(
      await EntitiesService.updateEntity(session, ruleset.id, "items", scroll.id, {
        name: "Scroll",
        fields: { [ITEM_WEIGHT]: 10, [ITEM_COST_GP]: 100 },
      }),
    ).toMatchObject({ fields: { [ITEM_WEIGHT]: 10, [ITEM_COST_GP]: 100 } });
  });

  test("clears its slot, weight and cost when an edit gives none, and keeps them when it leaves them out", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const hat = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Hat",
      fields: { [ITEM_SLOT]: "Head", [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 10 },
    });

    const kept = await EntitiesService.updateEntity(session, ruleset.id, "items", hat.id, {
      name: "Hat",
      description: "Floppy",
    });
    expect(kept.fields).toMatchObject({ [ITEM_SLOT]: "Head", [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 10 });

    // A slot's none is "Other", the slot of an item worn nowhere in particular
    const cleared = await EntitiesService.updateEntity(session, ruleset.id, "items", hat.id, {
      name: "Hat",
      fields: { [ITEM_SLOT]: null, [ITEM_WEIGHT]: null, [ITEM_COST_GP]: null },
    });
    const none = { [ITEM_IS_TEMPLATE]: false, [ITEM_SLOT]: "Other", [ITEM_WEIGHT]: null, [ITEM_COST_GP]: null };
    expect(cleared.fields).toMatchObject(none);
    expect((await EntitiesService.getEntity(ruleset.id, "items", hat.id)).fields).toMatchObject(none);
    // Its record holds no weight nor cost, and its slot's default
    expect((await Entities.findOne<Item>(db, { entityType: "items", id: hat.id }))!.fields).toEqual({
      [ITEM_IS_TEMPLATE]: false,
      [ITEM_SLOT]: "Other",
    });
  });

  test("clears its template when an edit gives none, and keeps it when it leaves it out", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const template = await createTemplate(session, ruleset.id);
    const sword = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Sword",
      fields: { [ITEM_TYPE]: "Weapon" },
      links: { madeFrom: template.id },
    });

    expect(
      (
        await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: "Sword",
          fields: { [ITEM_TYPE]: "Weapon" },
        })
      ).links,
    ).toMatchObject([{ role: "madeFrom", toId: template.id, toName: template.name }]);
    expect(
      (
        await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: "Sword",
          fields: { [ITEM_TYPE]: "Weapon" },
          links: { madeFrom: null },
        })
      ).links,
    ).toEqual([]);
    // Its template's fields went with it
    expect(await EntitiesService.getEntity(ruleset.id, "items", sword.id)).toMatchObject({
      links: [],
      fields: { [ITEM_MADE_OF]: null },
    });
  });

  test("describes where a character carrying it can place it", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const sword = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Sword",
      fields: { [ITEM_TYPE]: "Weapon" },
    });
    const ring = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Ring",
      fields: { [ITEM_SLOT]: "Finger" },
    });
    expect((await EntitiesService.getEntity(ruleset.id, "items", sword.id)).placement).toMatchObject({
      hand: true,
      slot: null,
    });
    expect((await EntitiesService.getEntity(ruleset.id, "items", ring.id)).placement).toMatchObject({
      charges: null,
      hand: false,
      slot: "Finger",
    });
  });

  test("puts armor on the torso and shields in the off hand, whatever slot is asked for", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    expect(
      await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Chainmail",
        fields: { [ITEM_TYPE]: "Armor", [ITEM_SLOT]: "Other" },
      }),
    ).toMatchObject({ fields: { [ITEM_SLOT]: "Torso" } });
    expect(
      await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Ring",
        fields: { [ITEM_SLOT]: "Finger" },
      }),
    ).toMatchObject({ fields: { [ITEM_SLOT]: "Finger" } });

    const buckler = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Buckler",
      fields: { [ITEM_SLOT]: "Other" },
    });
    expect(
      await EntitiesService.updateEntity(session, ruleset.id, "items", buckler.id, {
        name: "Buckler",
        fields: { [ITEM_TYPE]: "Shield", [ITEM_SLOT]: "Other" },
      }),
    ).toMatchObject({ fields: { [ITEM_SLOT]: "Off Hand" } });
  });

  describe("duplicating", () => {
    test("copies the item's customizations, each modifier with its own requirements", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await EntitiesService.createEntity(session, ruleset.id, "items", { name: "Cloak" });
      const modifier = await customize("items", source.id, { values: COLD_IRON });

      const copy = await EntitiesService.duplicateEntity(session, ruleset.id, "items", source.id, {
        name: "Cloak Copy",
      });
      const copied = await customizationsOf(copy.id);
      expect(copied).toMatchObject(copiedCustomizations);
      expect(copied.modifiers[0].id).not.toBe(modifier.id);
      expect(await customizationsOf(source.id)).toMatchObject(copiedCustomizations);
    });

    test("makes a template's copy an instance of it, with no customizations of its own", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id);
      const copy = await EntitiesService.duplicateEntity(session, ruleset.id, "items", template.id, {
        name: "Sword",
        fields: { [ITEM_TYPE]: "Weapon" },
      });
      await expectTemplateInstance(ruleset.id, copy.id, template.id);
    });

    test("of an instance, keeps every field it holds of its own, its weight and cost over its template's", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id, { [ITEM_WEIGHT]: 4, [ITEM_COST_GP]: 15 });
      const instance = await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Heavy Sword",
        fields: { [ITEM_TYPE]: "Weapon", [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 20 },
        links: { madeFrom: template.id },
      });

      const copy = await EntitiesService.duplicateEntity(session, ruleset.id, "items", instance.id, {
        name: "Heavy Sword Copy",
        fields: { [ITEM_TYPE]: "Weapon" },
      });
      const own = { [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 20 };
      expect(copy.fields).toMatchObject(own);
      expect((await Entities.findOne<Item>(db, { entityType: "items", id: copy.id }))!.fields).toMatchObject(own);
    });

    test("doesn't find a source outside the ruleset", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      await expectRefusedWith(
        EntitiesService.duplicateEntity(session, ruleset.id, "items", NIL_UUID, { name: "No Source" }),
        404,
      );
    });
  });

  describe("variants", () => {
    test("copy the source's type, slot, weight, cost and customizations, and take their own names and descriptions", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Scroll",
        description: "Blank",
        fields: { [ITEM_TYPE]: "Other", [ITEM_SLOT]: "Other", [ITEM_WEIGHT]: 0.1, [ITEM_COST_GP]: 25 },
      });
      await customize("items", source.id, { values: COLD_IRON });

      const variants = await EntitiesService.createVariants(session, ruleset.id, "items", source.id, [
        { name: "Scroll of Healing", description: "Heals 1d8" },
        { name: "Scroll of Light" },
      ]);
      expect(variants).toMatchObject([
        {
          name: "Scroll of Healing",
          description: "Heals 1d8",
          fields: {
            [ITEM_TYPE]: "Other",
            [ITEM_SLOT]: "Other",
            [ITEM_WEIGHT]: 0.1,
            [ITEM_COST_GP]: 25,
            [ITEM_IS_TEMPLATE]: false,
          },
          links: {},
          rulesetId: ruleset.id,
        },
        // A blank description stays blank rather than falling back to the source's.
        { name: "Scroll of Light", description: null, fields: { [ITEM_WEIGHT]: 0.1, [ITEM_COST_GP]: 25 } },
      ]);
      expect(variants[0].links).toEqual({});
      const first = await customizationsOf(variants[0].id);
      const second = await customizationsOf(variants[1].id);
      expect(first).toMatchObject(copiedCustomizations);
      expect(second).toMatchObject(copiedCustomizations);
      expect(first.modifiers[0].id).not.toBe(second.modifiers[0].id);
      // Each a new item's activity
      const { items } = await Activities.findPage(
        db,
        { userId: session.userId, targetType: "items" },
        { limit: 10, page: 1 },
      );
      expect(variants.map((variant) => items.find((activity) => activity.targetId === variant.id))).toMatchObject([
        { type: "createItem", data: { entityName: "Scroll of Healing" } },
        { type: "createItem", data: { entityName: "Scroll of Light" } },
      ]);
    });

    test("of a template, or of an instance of one, are instances of that template", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id);
      const instance = await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Longsword",
        fields: { [ITEM_TYPE]: "Weapon" },
        links: { madeFrom: template.id },
      });

      const [ofTemplate] = await EntitiesService.createVariants(session, ruleset.id, "items", template.id, [
        { name: "Sword +1" },
      ]);
      const [ofInstance] = await EntitiesService.createVariants(session, ruleset.id, "items", instance.id, [
        { name: "Longsword +1" },
      ]);
      await expectTemplateInstance(ruleset.id, ofTemplate.id, template.id);
      await expectTemplateInstance(ruleset.id, ofInstance.id, template.id);
    });

    test("of a template hold none of its weight or cost, and read them as it changes them", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const template = await createTemplate(session, ruleset.id, { [ITEM_WEIGHT]: 4, [ITEM_COST_GP]: 15 });
      const [variant] = await EntitiesService.createVariants(session, ruleset.id, "items", template.id, [
        { name: "Sword +1" },
      ]);
      // Its record holds neither: it reads its template's
      expect(Object.keys(variant.fields)).not.toContainValues([ITEM_WEIGHT, ITEM_COST_GP]);
      expect((await EntitiesService.getEntity(ruleset.id, "items", variant.id)).fields).toMatchObject({
        [ITEM_WEIGHT]: 4,
        [ITEM_COST_GP]: 15,
      });

      await EntitiesService.updateEntity(session, ruleset.id, "items", template.id, {
        name: "Sword Template",
        fields: { [ITEM_WEIGHT]: 6, [ITEM_COST_GP]: 30 },
      });
      expect((await EntitiesService.getEntity(ruleset.id, "items", variant.id)).fields).toMatchObject({
        [ITEM_WEIGHT]: 6,
        [ITEM_COST_GP]: 30,
      });
    });

    test("can come from an item the ruleset inherits", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const source = await EntitiesService.createEntity(session, parent.id, "items", {
        name: "Parent Scroll",
        fields: { [ITEM_WEIGHT]: 0.1 },
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

      const variants = await EntitiesService.createVariants(session, fork.id, "items", source.id, [
        { name: "Forked Scroll" },
      ]);
      expect(variants).toMatchObject([{ name: "Forked Scroll", rulesetId: fork.id, fields: { [ITEM_WEIGHT]: 0.1 } }]);
    });

    test("are refused to anyone but the owner", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await EntitiesService.createEntity(session, ruleset.id, "items", { name: "Scroll" });
      const { session: other } = await createTestUserAndRuleset();
      expect(
        EntitiesService.createVariants(other, ruleset.id, "items", source.id, [{ name: "Stolen Scroll" }]),
      ).rejects.toThrow(ForbiddenError);
    });

    test("are refused all together when a name repeats or is taken", async () => {
      const { session, ruleset } = await createTestUserAndRuleset();
      const source = await EntitiesService.createEntity(session, ruleset.id, "items", { name: "Scroll" });
      await EntitiesService.createEntity(session, ruleset.id, "items", { name: "Taken Name" });
      const create = (names: string[]) =>
        EntitiesService.createVariants(
          session,
          ruleset.id,
          "items",
          source.id,
          names.map((name) => ({ name })),
        );

      await expectRefusedWith(create(["Probe", "Probe"]), 409);
      await expectRefusedWith(create(["Probe Alpha", "Taken Name", "Probe Beta"]), 409);
      await expectRefusedWith(
        EntitiesService.createVariants(session, ruleset.id, "items", NIL_UUID, [{ name: "Orphan" }]),
        404,
      );

      const { items } = await EntitiesService.getEntities(
        ruleset.id,
        "items",
        { search: "Probe" },
        { limit: 10, page: 1 },
      );
      expect(items).toEqual([]);
    });

    test("point the fork's tombstone at a variant named after a deleted copy", async () => {
      const { user, session, ruleset: parent } = await createTestUserAndRuleset();
      const inherited = await EntitiesService.createEntity(session, parent.id, "items", { name: "Ghostly Scroll" });
      const source = await EntitiesService.createEntity(session, parent.id, "items", { name: "Bulk Source" });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

      const copy = await EntitiesService.updateEntity(session, fork.id, "items", inherited.id, {
        name: "Ghostly Scroll",
        description: "Edited in fork",
      });
      await EntitiesService.deleteEntity(session, fork.id, "items", copy.id);
      const [variant] = await EntitiesService.createVariants(session, fork.id, "items", source.id, [
        { name: "Ghostly Scroll" },
      ]);

      const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id, entityType: "items" });
      expect(snapshots).toMatchObject([{ sourceEntityId: inherited.id, forkedEntityId: variant.id }]);
    });
  });

  test("refuses to delete an item in a character's inventory, even through a ruleset using it as an extension", async () => {
    const { user, session, ruleset: extension } = await createTestUserAndRuleset();
    const item = await EntitiesService.createEntity(session, extension.id, "items", { name: "Extension Item" });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    await CharacterInventory.create(db, { characterId: character.id, itemId: item.id, quantity: 1 });

    await expectRefusedWith(EntitiesService.deleteEntity(session, extension.id, "items", item.id), 409);
  });
});
