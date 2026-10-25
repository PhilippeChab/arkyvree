import { describe, expect, test } from "bun:test";

import { type EntityRecord } from "@/engine/index.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Entities, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createSeededTestRuleset, type Described, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { findStoredValues, writeStoredValues } from "@/tests/support/storedValues.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  ITEM_IS_TEMPLATE,
  ITEM_MADE_OF,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  WEAPON_BASE_DAMAGE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * An item's record (none for none) as its form's columns read it: its own columns, whether it's a template, the
 * template it's made from (null for none), its type, its slot and its weight.
 */
function columnsOf(record: object | undefined) {
  if (!record) return record;
  const item = record as Pick<EntityRecord, "description" | "fields" | "links" | "name">;
  return {
    name: item.name,
    description: item.description,
    isTemplate: item.fields[ITEM_IS_TEMPLATE],
    sourceItemId: item.links.madeFrom ?? null,
    type: item.fields[ITEM_TYPE] ?? null,
    slot: item.fields[ITEM_SLOT] ?? null,
    weight: item.fields[ITEM_WEIGHT] ?? null,
  };
}

/**
 * Another user's private fork of the seeded base, with an item made from `templateId` there ("Secret Homebrew Blade"),
 * and which then takes `extensionIds`: an item the session can't read.
 */
async function createSecretBlade(templateId: string, extensionIds: string[] = []) {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id);
  await EntitiesService.createEntity(session, ruleset.id, "items", {
    name: "Secret Homebrew Blade",
    type: "Weapon",
    sourceItemId: templateId,
  });
  if (extensionIds.length > 0) await RulesetExtensionsService.subscribeExtension(session, ruleset.id, extensionIds);
}

/** A new user's fork of the seeded base (private, unless `values` says otherwise), and its templates and instances. */
async function setup(values: { private?: boolean } = {}) {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id, values);
  const template = async (name: string) => {
    const found = (await EntitiesService.getTemplates(ruleset.id, "items")).find((item) => item.name === name);
    if (!found) throw new Error(`Seed template ${name} not found`);
    return found;
  };
  /** A regular item made from a template. */
  const instance = async (name: string) => {
    const { id, fields } = await template(name);
    return EntitiesService.createEntity(session, ruleset.id, "items", {
      name: `My ${name}`,
      type: fields[ITEM_TYPE],
      sourceItemId: id,
    });
  };
  return { session, ruleset, template, instance };
}

describe("Item templates", () => {
  describe("their instances read the template's", () => {
    test.each([
      [
        "Longsword",
        { weapon: { proficiency: "Martial", family: "Sword", baseDamage: "1d8", size: "Medium", type: "Longsword" } },
      ],
      [
        "Chain Mail",
        {
          armor: { proficiency: "Medium", type: "Chain Mail", acBonus: 5 },
          maxDex: 2,
          checkPenalty: -5,
          spellFailure: 30,
        },
      ],
      [
        "Heavy Steel Shield",
        {
          shield: { proficiency: "Heavy", type: "Heavy Steel Shield", acBonus: 2 },
          checkPenalty: -2,
          spellFailure: 15,
        },
      ],
    ])("%s fields", async (name, expected) => {
      const { ruleset, instance } = await setup();
      expect(
        await EntitiesService.getEntity<Described<"items">>(ruleset.id, "items", (await instance(name)).id),
      ).toMatchObject(expected);
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
      const { requirements } = await EntitiesService.getEntity<Described<"items">>(
        ruleset.id,
        "items",
        (await instance(name)).id,
      );
      expect(requirements.map((r) => r.chainingOperator ?? r.target)).toEqual(expected);
    });

    test("current fields, next to their own", async () => {
      const { ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      await writeStoredValues("items", sword.id, [[ITEM_MADE_OF, "Adamantine"]]);
      await writeStoredValues("items", (await template("Longsword")).id, [[WEAPON_BASE_DAMAGE, "2d6"]]);
      invalidateSeededRuleset(ruleset.rulesetId!);

      expect(await EntitiesService.getEntity<Described<"items">>(ruleset.id, "items", sword.id)).toMatchObject({
        weapon: { baseDamage: "2d6" },
        madeOf: "Adamantine",
      });
    });
  });

  test("list their instances with the template's name", async () => {
    const { ruleset, instance } = await setup();
    const sword = await instance("Longsword");
    const { items } = await EntitiesService.getEntities(
      ruleset.id,
      "items",
      { search: sword.name },
      { limit: 10, page: 1 },
    );
    expect(items.find((item) => item.id === sword.id)?.templateName).toBe("Longsword");
  });

  test("an item without a template has no stored values or requirements of its own", async () => {
    const { session, ruleset } = await setup();
    const item = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Custom Item",
      type: "Weapon",
    });
    expect(await EntitiesService.getEntity<Described<"items">>(ruleset.id, "items", item.id)).toMatchObject({
      requirements: [],
    });
    expect(await findStoredValues("items", item.id)).toEqual({ fields: {}, links: {} });
  });

  test("an instance can switch templates", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const copy = await EntitiesService.duplicateEntity(session, ruleset.id, "items", mace.id, {
      name: "Custom weapon",
      type: "Weapon",
    });
    expect(columnsOf(copy)).toMatchObject({ isTemplate: false, sourceItemId: mace.id });

    const sword = await template("Longsword");
    expect(
      columnsOf(
        await EntitiesService.updateEntity(session, ruleset.id, "items", copy.id, {
          name: copy.name,
          sourceItemId: sword.id,
        }),
      ),
    ).toMatchObject({ isTemplate: false, sourceItemId: sword.id });
    expect(await EntitiesService.getEntity<Described<"items">>(ruleset.id, "items", copy.id)).toMatchObject({
      weapon: { type: "Longsword" },
    });
  });

  test("an instance names the template its fork copied as the copy, sent by its source's id, and not one it lacks", async () => {
    const { session, ruleset, template } = await setup();
    const sword = await template("Longsword");
    // The fork copies the template, as a first edit of it does
    const copy = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
      name: sword.name,
      description: "Ours",
    });
    const instance = { name: "My Longsword", type: "Weapon", sourceItemId: sword.id };
    expect(columnsOf(await EntitiesService.createEntity(session, ruleset.id, "items", instance))).toMatchObject({
      sourceItemId: copy.id,
    });

    const lacking = { ...instance, name: "No Longsword", sourceItemId: NIL_UUID };
    expect(EntitiesService.createEntity(session, ruleset.id, "items", lacking)).rejects.toMatchObject({
      message: `Item ${NIL_UUID} does not belong to this ruleset`,
      refusal: "invalid",
    });
  });

  test("an instance's edit records no template change when its fork copies the template it was made from", async () => {
    const { session, ruleset, template, instance } = await setup();
    const sword = await template("Longsword");
    const mine = await instance("Longsword");
    await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
      name: sword.name,
      description: "Ours",
    });
    // Its stored template is the original, which its view reads as the fork's copy: neither its edit's
    await EntitiesService.updateEntity(session, ruleset.id, "items", mine.id, {
      name: mine.name,
      type: "Weapon",
      weight: 5,
    });
    const { items } = await Activities.findPage(
      db,
      { userId: session.userId, targetTable: "items" },
      { limit: 10, page: 1 },
    );
    const edit = items.find((activity) => activity.targetId === mine.id && activity.type === "updateItem");
    expect(edit?.data).toMatchObject({ changedFields: [{ field: "weight", to: "5" }] });
  });

  describe("have no template of their own", () => {
    test("when created", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Invalid template",
          type: "Weapon",
          isTemplate: true,
          sourceItemId: mace.id,
        }),
        422,
      );
      expect(
        await Entities.findOne<Item>(db, { entityType: "items", rulesetId: ruleset.id, name: "Invalid template" }),
      ).toBeUndefined();

      expect(
        columnsOf(
          await EntitiesService.createEntity(session, ruleset.id, "items", {
            name: "Custom weapon template",
            type: "Weapon",
            isTemplate: true,
          }),
        ),
      ).toMatchObject({ isTemplate: true, sourceItemId: null });
    });

    test("when an inherited one is edited, before any copy is made", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      expect(
        EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, { name: mace.name, sourceItemId: mace.id }),
      ).rejects.toThrow("Template items cannot have a source item");
      expect(await EntitySnapshots.findOne(db, { rulesetId: ruleset.id, sourceEntityId: mace.id })).toBeUndefined();
    });

    test("even when an edit claims it's a regular item", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, {
        name: mace.name,
        description: "Local template",
      });
      const sword = await template("Longsword");
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
          name: local.name,
          isTemplate: false,
          sourceItemId: sword.id,
        }),
        422,
      );
      expect(columnsOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        isTemplate: true,
        sourceItemId: null,
      });
    });

    test("and an old self-reference is cleared on save", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, { name: mace.name });
      await Entities.update<Item>(db, "items", { links: { madeFrom: local.id } }, { id: local.id });

      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
            name: local.name,
            description: "Updated template",
          }),
        ),
      ).toMatchObject({ isTemplate: true, sourceItemId: null });
    });
  });

  describe("are templates of their instances' type", () => {
    test.each([
      ["a Ring", "Ring"],
      ["an Armor", "Armor"],
      ["an item without a type", null],
    ])("refused as %s's when created", async (_what, type) => {
      const { session, ruleset, template } = await setup();
      const sword = await template("Longsword");
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Mismatched",
          type,
          sourceItemId: sword.id,
        }),
        422,
      );
      expect(
        await Entities.findOne<Item>(db, { entityType: "items", rulesetId: ruleset.id, name: "Mismatched" }),
      ).toBeUndefined();
    });

    test("refused when the source isn't a template", async () => {
      const { session, ruleset, instance } = await setup();
      const sword = await instance("Longsword");
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "From a copy",
          type: "Weapon",
          sourceItemId: sword.id,
        }),
        422,
      );
    });

    test("refused when an edit changes the type and keeps the template", async () => {
      const { session, ruleset, instance } = await setup();
      const sword = await instance("Longsword");
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          type: "Wondrous Item",
        }),
        422,
      );
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          type: "Wondrous Item",
          sourceItemId: columnsOf(sword)!.sourceItemId,
        }),
        422,
      );
      expect(columnsOf(await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))).toMatchObject({
        type: "Weapon",
      });
    });

    test("refused when an edit gives a template of another type", async () => {
      const { session, ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      const mail = await template("Chain Mail");
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          sourceItemId: mail.id,
        }),
        422,
      );
      expect(columnsOf(await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))).toMatchObject({
        sourceItemId: columnsOf(sword)!.sourceItemId,
      });
    });

    test("kept when an edit changes the type with a template of it, or none", async () => {
      const { session, ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      const mail = await template("Chain Mail");
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
            name: sword.name,
            type: "Armor",
            sourceItemId: mail.id,
          }),
        ),
      ).toMatchObject({ type: "Armor", sourceItemId: mail.id });
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
            name: sword.name,
            type: "Ring",
            sourceItemId: null,
          }),
        ),
      ).toMatchObject({ type: "Ring", sourceItemId: null });
    });
  });

  describe("keep their type while items are made from them", () => {
    test("refused before any copy is made, naming an item made from it", async () => {
      const { session, ruleset, template, instance } = await setup();
      await instance("Club");
      const club = await template("Club");
      const edit = { name: club.name, type: "Armor" };
      expect(EntitiesService.updateEntity(session, ruleset.id, "items", club.id, edit)).rejects.toThrow(
        `Can't change the Weapon template "Club" to Armor while items are made from it: "My Club"`,
      );
      await expectRefusedWith(EntitiesService.updateEntity(session, ruleset.id, "items", club.id, edit), 422);
      expect(await EntitySnapshots.findOne(db, { rulesetId: ruleset.id, sourceEntityId: club.id })).toBeUndefined();
    });

    test("refused for the items its source chain makes from it, counting them", async () => {
      const { session, ruleset, template } = await setup();
      const sword = await template("Longsword");
      expect(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, { name: sword.name, type: "Shield" }),
      ).rejects.toThrow(
        /^Can't change the Weapon template "Longsword" to Shield while items are made from it: ".+" and \d+ more$/,
      );
    });

    test("refused for an item made from the original its copy stands for", async () => {
      const { session, ruleset, template, instance } = await setup();
      await instance("Club");
      const club = await template("Club");
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
        name: club.name,
        description: "Local",
      });
      expect(local.id).not.toBe(club.id);
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", local.id, { name: local.name, type: "Armor" }),
        422,
      );
      expect(columnsOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        type: "Weapon",
      });
    });

    test("changed while another user's fork makes items from the original its copy stands for", async () => {
      const { session, ruleset, template } = await setup();
      const sword = await template("Bastard Sword");
      await createSecretBlade(sword.id);
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
        name: sword.name,
        description: "Local",
      });
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
            name: local.name,
            type: "Armor",
          }),
        ),
      ).toMatchObject({ type: "Armor" });
    });

    test("refused for the items of the rulesets built on it, counting those its view doesn't show", async () => {
      const { session, ruleset, template } = await setup({ private: false });
      const sword = await template("Bastard Sword");
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
        name: sword.name,
        description: "Local",
      });
      await RulesetsService.publishRuleset(session, ruleset.id, { kind: "extension" });
      // Made from the original, which the subscriber's view reads as the extension's copy
      await createSecretBlade(sword.id, [ruleset.id]);
      const edit = { name: local.name, type: "Armor" };
      const refusal = `Can't change the Weapon template "Bastard Sword" to Armor while items are made from it`;
      expect(EntitiesService.updateEntity(session, ruleset.id, "items", local.id, edit)).rejects.toMatchObject({
        message: `${refusal}: 1 in rulesets built on this one`,
        refusal: "unprocessable",
      });

      const blade = { name: "Public Blade", type: "Weapon", sourceItemId: local.id };
      await EntitiesService.createEntity(session, ruleset.id, "items", blade);
      expect(EntitiesService.updateEntity(session, ruleset.id, "items", local.id, edit)).rejects.toMatchObject({
        message: `${refusal}: "Public Blade", and 1 in rulesets built on this one`,
      });
      expect(columnsOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        type: "Weapon",
      });
    });

    test("changed when no item is made from it", async () => {
      const { session, ruleset, template } = await setup();
      const club = await template("Club");
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
            name: club.name,
            type: "Shield",
          }),
        ),
      ).toMatchObject({ isTemplate: true, type: "Shield", slot: "Off Hand" });
    });

    test("changed to the type the items made from it already are", async () => {
      const { session, ruleset } = await setup();
      const old = await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Old",
        type: "Weapon",
        isTemplate: true,
      });
      await Entities.create<Item>(db, "items", {
        rulesetId: ruleset.id,
        name: "Old Mail",
        fields: { [ITEM_TYPE]: "Armor" },
        links: { madeFrom: old.id },
      });
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", old.id, { name: old.name, type: "Armor" }),
        ),
      ).toMatchObject({ type: "Armor" });
    });
  });

  describe("are of a type an item can be based on a template of", () => {
    test.each([
      ["a Ring", "Ring"],
      ["an item without a type", null],
    ])("refused as %s when created", async (_what, type) => {
      const { session, ruleset } = await setup();
      expect(
        EntitiesService.createEntity(session, ruleset.id, "items", { name: "Odd Template", type, isTemplate: true }),
      ).rejects.toThrow(`Item type ${type ?? "None"} can't be a template: only Weapon, Armor, Shield can`);
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", { name: "Odd Template", type, isTemplate: true }),
        422,
      );
      expect(
        await Entities.findOne<Item>(db, { entityType: "items", rulesetId: ruleset.id, name: "Odd Template" }),
      ).toBeUndefined();
    });

    test("refused when an edit changes one to another", async () => {
      const { session, ruleset, template } = await setup();
      const club = await template("Club");
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", club.id, { name: club.name, type: "Wondrous Item" }),
        422,
      );
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", club.id, { name: club.name, type: null }),
        422,
      );
    });

    test("kept by an edit of one stored with another, which can change it to one", async () => {
      const { session, ruleset } = await setup();
      const [ring] = await Entities.create<Item>(db, "items", {
        rulesetId: ruleset.id,
        name: "Old Ring",
        fields: { [ITEM_TYPE]: "Ring", [ITEM_IS_TEMPLATE]: true },
      });
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", ring.id, {
            name: ring.name,
            type: "Ring",
            description: "Still a ring",
          }),
        ),
      ).toMatchObject({ type: "Ring", description: "Still a ring" });
      expect(
        columnsOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", ring.id, {
            name: ring.name,
            type: "Weapon",
          }),
        ),
      ).toMatchObject({ type: "Weapon" });
    });
  });

  test("an inherited one is edited into a local copy, leaving the original", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const edited = await EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, {
      name: mace.name,
      type: "Weapon",
      weight: 10,
      description: "Heavier homebrew mace",
    });

    expect(edited.id).not.toBe(mace.id);
    expect(columnsOf(edited)).toMatchObject({
      isTemplate: true,
      sourceItemId: null,
      weight: 10,
      description: "Heavier homebrew mace",
    });
    const original = await Entities.findOne(db, { entityType: "items", id: mace.id });
    expect(original?.fields[ITEM_WEIGHT]).toBe(mace.fields[ITEM_WEIGHT]);
  });

  test("can't be deleted while an item is made from them", async () => {
    const { session, ruleset, template, instance } = await setup();
    await instance("Chain Mail");
    await expectRefusedWith(
      EntitiesService.deleteEntity(session, ruleset.id, "items", (await template("Chain Mail")).id),
      409,
    );

    const unused = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Custom Template",
      type: "Armor",
      isTemplate: true,
    });
    expect((await EntitiesService.deleteEntity(session, ruleset.id, "items", unused.id)).id).toBe(unused.id);
  });

  test("are deleted while another user's fork makes items from the original their copy stands for", async () => {
    const { session, ruleset, template } = await setup();
    const sword = await template("Bastard Sword");
    await createSecretBlade(sword.id);
    const local = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
      name: sword.name,
      description: "Local",
    });
    expect((await EntitiesService.deleteEntity(session, ruleset.id, "items", local.id)).id).toBe(local.id);
  });

  test("can't be deleted while a ruleset built on theirs makes items from them", async () => {
    const { session, ruleset, template } = await setup({ private: false });
    const sword = await template("Bastard Sword");
    const local = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
      name: sword.name,
      description: "Local",
    });
    await RulesetsService.publishRuleset(session, ruleset.id, { kind: "extension" });
    await createSecretBlade(sword.id, [ruleset.id]);
    await expectRefusedWith(EntitiesService.deleteEntity(session, ruleset.id, "items", local.id), 409);
  });

  test("can't be deleted while an item is made from the original their copy stands for", async () => {
    const { session, ruleset, template, instance } = await setup();
    await instance("Club");
    const club = await template("Club");
    const local = await EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
      name: club.name,
      description: "Local",
    });
    await expectRefusedWith(EntitiesService.deleteEntity(session, ruleset.id, "items", local.id), 409);
    expect((await EntitiesService.getTemplates(ruleset.id, "items", "Weapon")).map((item) => item.id)).toContain(
      local.id,
    );
  });
});
