import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { EntitySnapshots, Items, Properties } from "@/server/repositories/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  ITEM_MADE_OF,
  ITEM_SPELL_FAILURE,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_PROFICIENCY,
  WEAPON_SIZE,
  WEAPON_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";
import { createSeededTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

async function setup() {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id);
  const template = async (name: string) => {
    const found = (await ItemsService.getTemplates(ruleset.id)).find((item) => item.name === name);
    if (!found) throw new Error(`Seed template ${name} not found`);
    return found;
  };
  /** A regular item made from a template. */
  const instance = async (name: string) => {
    const { id, type } = await template(name);
    return ItemsService.createItem(session, ruleset.id, { name: `My ${name}`, type, sourceItemId: id });
  };
  return { session, ruleset, template, instance };
}

/** An item's properties as read through the service, by type. */
async function propertiesOf(rulesetId: string, itemId: string) {
  return Object.fromEntries((await ItemsService.getItem(rulesetId, itemId)).properties.map((p) => [p.type, p.value]));
}

describe("Item templates", () => {
  describe("their instances read the template's", () => {
    test.each([
      [
        "Longsword",
        {
          [WEAPON_PROFICIENCY]: "Martial",
          [WEAPON_FAMILY]: "Sword",
          [WEAPON_BASE_DAMAGE]: "1d8",
          [WEAPON_SIZE]: "Medium",
          [WEAPON_TYPE]: "Longsword",
        },
      ],
      [
        "Chain Mail",
        {
          [ARMOR_PROFICIENCY]: "Medium",
          [ARMOR_TYPE]: "Chain Mail",
          [ARMOR_AC_BONUS]: "5",
          [ARMOR_MAX_DEX]: "2",
          [ARMOR_CHECK_PENALTY]: "-5",
          [ITEM_SPELL_FAILURE]: "30",
        },
      ],
      [
        "Heavy Steel Shield",
        {
          [SHIELD_PROFICIENCY]: "Heavy",
          [SHIELD_TYPE]: "Heavy Steel Shield",
          [SHIELD_AC_BONUS]: "2",
          [ARMOR_CHECK_PENALTY]: "-2",
          [ITEM_SPELL_FAILURE]: "15",
        },
      ],
    ])("%s properties", async (name, expected) => {
      const { ruleset, instance } = await setup();
      expect(await propertiesOf(ruleset.id, (await instance(name)).id)).toMatchObject(expected);
    });

    test.each([
      // A martial weapon takes the general proficiency or the one for that weapon.
      [
        "Longsword",
        ["or", "feats.martialweaponproficiency.possessed", "feats.martialweaponproficiencylongsword.possessed"],
      ],
      ["Chain Mail", ["feats.armorproficiencymedium.possessed"]],
      ["Tower Shield", ["feats.towershieldproficiency.possessed"]],
    ])("%s requirements", async (name, expected) => {
      const { ruleset, instance } = await setup();
      const { requirements } = await ItemsService.getItem(ruleset.id, (await instance(name)).id);
      expect(requirements.map((r) => r.chainingOperator ?? r.target)).toEqual(expected);
    });

    test("current properties, next to their own", async () => {
      const { ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      await Properties.create(db, {
        entityId: sword.id,
        entityType: "items",
        type: ITEM_MADE_OF,
        value: "Adamantine",
      });
      const damage = (
        await Properties.findMany(db, { entityIds: [(await template("Longsword")).id], entityType: "items" })
      ).find((p) => p.type === WEAPON_BASE_DAMAGE);
      await Properties.update(db, { value: "2d6" }, { id: damage!.id });
      invalidateSeededRuleset(ruleset.rulesetId!);

      expect(await propertiesOf(ruleset.id, sword.id)).toMatchObject({
        [WEAPON_BASE_DAMAGE]: "2d6",
        [ITEM_MADE_OF]: "Adamantine",
      });
    });
  });

  test("list their instances with the template's name", async () => {
    const { ruleset, instance } = await setup();
    const sword = await instance("Longsword");
    const { items } = await ItemsService.getItems(ruleset.id, { search: sword.name }, { limit: 10, page: 1 });
    expect(items.find((item) => item.id === sword.id)?.templateName).toBe("Longsword");
  });

  test("an item without a template has no properties or requirements of its own", async () => {
    const { session, ruleset } = await setup();
    const item = await ItemsService.createItem(session, ruleset.id, { name: "Custom Item", type: "Weapon" });
    expect(await ItemsService.getItem(ruleset.id, item.id)).toMatchObject({ properties: [], requirements: [] });
  });

  test("an instance can switch templates", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const copy = await ItemsService.duplicateItem(session, ruleset.id, mace.id, {
      name: "Custom weapon",
      type: "Weapon",
    });
    expect(copy).toMatchObject({ isTemplate: false, sourceItemId: mace.id });

    const sword = await template("Longsword");
    expect(
      await ItemsService.updateItem(session, ruleset.id, copy.id, { name: copy.name, sourceItemId: sword.id }),
    ).toMatchObject({ isTemplate: false, sourceItemId: sword.id });
    expect(await propertiesOf(ruleset.id, copy.id)).toMatchObject({ [WEAPON_TYPE]: "Longsword" });
  });

  describe("have no template of their own", () => {
    test("when created", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      await expect(
        ItemsService.createItem(session, ruleset.id, {
          name: "Invalid template",
          type: "Weapon",
          isTemplate: true,
          sourceItemId: mace.id,
        }),
      ).rejects.toThrow(UnprocessableEntityError);
      expect(await Items.findOne(db, { rulesetId: ruleset.id, name: "Invalid template" })).toBeUndefined();

      expect(
        await ItemsService.createItem(session, ruleset.id, {
          name: "Custom weapon template",
          type: "Weapon",
          isTemplate: true,
        }),
      ).toMatchObject({ isTemplate: true, sourceItemId: null });
    });

    test("when an inherited one is edited, before any copy is made", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      await expect(
        ItemsService.updateItem(session, ruleset.id, mace.id, { name: mace.name, sourceItemId: mace.id }),
      ).rejects.toThrow("Template items cannot have a source item");
      expect(await EntitySnapshots.findOne(db, { rulesetId: ruleset.id, sourceEntityId: mace.id })).toBeUndefined();
    });

    test("even when an edit claims it's a regular item", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      const local = await ItemsService.updateItem(session, ruleset.id, mace.id, {
        name: mace.name,
        description: "Local template",
      });
      const sword = await template("Longsword");
      await expect(
        ItemsService.updateItem(session, ruleset.id, local.id, {
          name: local.name,
          isTemplate: false,
          sourceItemId: sword.id,
        }),
      ).rejects.toThrow(UnprocessableEntityError);
      expect(await Items.findOne(db, { id: local.id })).toMatchObject({ isTemplate: true, sourceItemId: null });
    });

    test("and an old self-reference is cleared on save", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      const local = await ItemsService.updateItem(session, ruleset.id, mace.id, { name: mace.name });
      await Items.update(db, { sourceItemId: local.id }, { id: local.id });

      expect(
        await ItemsService.updateItem(session, ruleset.id, local.id, {
          name: local.name,
          description: "Updated template",
        }),
      ).toMatchObject({ isTemplate: true, sourceItemId: null });
    });
  });

  test("an inherited one is edited into a local copy, leaving the original", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const edited = await ItemsService.updateItem(session, ruleset.id, mace.id, {
      name: mace.name,
      type: "Weapon",
      weight: 10,
      description: "Heavier homebrew mace",
    });

    expect(edited.id).not.toBe(mace.id);
    expect(edited).toMatchObject({
      isTemplate: true,
      sourceItemId: null,
      weight: "10.00",
      description: "Heavier homebrew mace",
    });
    expect((await Items.findOne(db, { id: mace.id }))?.weight).toBe(mace.weight);
  });

  test("can't be deleted while an item is made from them", async () => {
    const { session, ruleset, template, instance } = await setup();
    await instance("Chain Mail");
    await expect(ItemsService.deleteItem(session, ruleset.id, (await template("Chain Mail")).id)).rejects.toThrow(
      ConflictError,
    );

    const unused = await ItemsService.createItem(session, ruleset.id, {
      name: "Custom Template",
      type: "Armor",
      isTemplate: true,
    });
    expect((await ItemsService.deleteItem(session, ruleset.id, unused.id)).id).toBe(unused.id);
  });
});
