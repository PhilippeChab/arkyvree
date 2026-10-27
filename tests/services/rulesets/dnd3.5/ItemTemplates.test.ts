import { describe, expect, test } from "bun:test";

import { type EntityRecord } from "@/engine/index.ts";
import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Activities, Entities, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { findFormValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  createSeededTestRuleset,
  type Described,
  describedAs,
  invalidateSeededRuleset,
  ownerSessionOf,
} from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_MADE_OF,
  ITEM_SLOT,
  ITEM_SPELL_FAILURE,
  ITEM_TYPE,
  ITEM_WEIGHT,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_PROFICIENCY,
  WEAPON_SIZE,
  WEAPON_TYPE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * An item as its record holds it (`EntityRecord`), off its own columns and fields (`item`) and its template
 * (`madeFrom`): its own columns, its fields by stored field, and its template its `madeFrom` link (null for none).
 */
function recordFrom(
  item: Pick<EntityRecord, "description" | "name"> & { fields: Readonly<Record<string, unknown>> },
  madeFrom: string | undefined,
) {
  return { name: item.name, description: item.description, fields: item.fields, links: { madeFrom: madeFrom ?? null } };
}

/** An item as a save or a read describes it (`answer`), as its record holds it: its template its `madeFrom` link's. */
function recordOf(answer: Pick<Described<"items">, "description" | "fields" | "links" | "name">) {
  return recordFrom(answer, answer.links.find((link) => link.role === "madeFrom")?.toId);
}

/** An item's record as stored (none for none), its template null for none. */
function storedRecordOf(record: Item | undefined) {
  if (!record) return record;
  return recordFrom(record, record.links.madeFrom);
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
    fields: { [ITEM_TYPE]: "Weapon" },
    links: { madeFrom: templateId },
  });
  if (extensionIds.length > 0) await RulesetExtensionsService.subscribeExtension(session, ruleset.id, extensionIds);
}

/** A new user's fork of the seeded base (private, unless `values` says otherwise), and its templates and instances. */
async function setup(values: { private?: boolean } = {}) {
  const { user, session } = await createTestUser();
  const ruleset = await createSeededTestRuleset(user.id, values);
  const template = async (name: string) => {
    const found = (await EntitiesService.getTemplates(await ownerSessionOf(ruleset.id), ruleset.id, "items")).find(
      (item) => item.name === name,
    );
    if (!found) throw new Error(`Seed template ${name} not found`);
    return found;
  };
  /** A regular item made from a template. */
  const instance = async (name: string) => {
    const { id, fields } = await template(name);
    return EntitiesService.createEntity(session, ruleset.id, "items", {
      name: `My ${name}`,
      fields: { [ITEM_TYPE]: fields[ITEM_TYPE] as string },
      links: { madeFrom: id },
    });
  };
  return { session, ruleset, template, instance };
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
          [ARMOR_AC_BONUS]: 5,
          [ARMOR_MAX_DEX]: 2,
          [ARMOR_CHECK_PENALTY]: -5,
          [ITEM_SPELL_FAILURE]: 30,
        },
      ],
      [
        "Heavy Steel Shield",
        {
          [SHIELD_PROFICIENCY]: "Heavy",
          [SHIELD_TYPE]: "Heavy Steel Shield",
          [SHIELD_AC_BONUS]: 2,
          [ARMOR_CHECK_PENALTY]: -2,
          [ITEM_SPELL_FAILURE]: 15,
        },
      ],
    ])("%s fields", async (name, expected) => {
      const { ruleset, instance } = await setup();
      const { fields } = await EntitiesService.getEntity(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "items",
        (await instance(name)).id,
      );
      expect(fields).toMatchObject(expected);
    });

    test("weight and cost, which they hold none of, as its page and its list read them", async () => {
      const { ruleset, template, instance } = await setup();
      const longsword = await template("Longsword");
      const sword = await instance("Longsword");
      // Its record, as stored, holds none of its own
      const record = await Entities.findOne<Item>(db, { entityType: "items", id: sword.id });
      expect(record!.fields).not.toHaveProperty(ITEM_WEIGHT);
      expect(record!.fields).not.toHaveProperty(ITEM_COST_GP);
      const inherited = {
        [ITEM_WEIGHT]: longsword.fields[ITEM_WEIGHT],
        [ITEM_COST_GP]: longsword.fields[ITEM_COST_GP],
      };
      expect(inherited).toEqual({ [ITEM_WEIGHT]: 4, [ITEM_COST_GP]: 15 });
      expect(
        (await EntitiesService.getEntity(await ownerSessionOf(ruleset.id), ruleset.id, "items", sword.id)).fields,
      ).toMatchObject(inherited);
      const { items } = await EntitiesService.getEntities(
        await ownerSessionOf(ruleset.id),
        ruleset.id,
        "items",
        { search: sword.name },
        { limit: 10, page: 1 },
      );
      expect(items.find((item) => item.id === sword.id)?.fields).toMatchObject(inherited);
    });

    test("weight and cost of their own only where their form gives another than the template's", async () => {
      const { session, ruleset, instance } = await setup();
      const sword = await instance("Longsword");
      const stored = async () => (await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))!.fields;
      // Its form shows the template's, which a save sends back as they are: still none of its own
      await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
        name: sword.name,
        fields: { [ITEM_WEIGHT]: 4, [ITEM_COST_GP]: 15 },
      });
      expect(await stored()).not.toHaveProperty(ITEM_WEIGHT);
      expect(await stored()).not.toHaveProperty(ITEM_COST_GP);
      const saved = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
        name: sword.name,
        fields: { [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 15 },
      });
      expect(saved.fields).toMatchObject({ [ITEM_WEIGHT]: 5, [ITEM_COST_GP]: 15 });
      expect(await stored()).toMatchObject({ [ITEM_WEIGHT]: 5 });
      expect(await stored()).not.toHaveProperty(ITEM_COST_GP);
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
      const { requirements } = describedAs(
        "items",
        await EntitiesService.getEntity(
          await ownerSessionOf(ruleset.id),
          ruleset.id,
          "items",
          (await instance(name)).id,
        ),
      );
      expect(requirements.map((r) => r.chainingOperator ?? r.target)).toEqual(expected);
    });

    test("current fields, next to their own", async () => {
      const { ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      await writeFieldValues("items", sword.id, [[ITEM_MADE_OF, "Adamantine"]]);
      await writeFieldValues("items", (await template("Longsword")).id, [[WEAPON_BASE_DAMAGE, "2d6"]]);
      invalidateSeededRuleset(ruleset.rulesetId!);
      // The instance's own value, written past the services, after its create read the fork's view
      RulesetViews.invalidate(ruleset.id);

      expect(
        (await EntitiesService.getEntity(await ownerSessionOf(ruleset.id), ruleset.id, "items", sword.id)).fields,
      ).toMatchObject({
        [WEAPON_BASE_DAMAGE]: "2d6",
        [ITEM_MADE_OF]: "Adamantine",
      });
    });
  });

  test("list their instances with the template's name, their link's", async () => {
    const { ruleset, instance } = await setup();
    const sword = await instance("Longsword");
    const { items } = await EntitiesService.getEntities(
      await ownerSessionOf(ruleset.id),
      ruleset.id,
      "items",
      { search: sword.name },
      { limit: 10, page: 1 },
    );
    const listed = items.find((item) => item.id === sword.id);
    expect(listed?.links).toContainEqual(expect.objectContaining({ role: "madeFrom", toName: "Longsword" }));
    expect(listed).not.toHaveProperty("templateName");
  });

  test("an item without a template has no fields its form shows or requirements of its own", async () => {
    const { session, ruleset } = await setup();
    const item = await EntitiesService.createEntity(session, ruleset.id, "items", {
      name: "Custom Item",
      fields: { [ITEM_TYPE]: "Weapon" },
    });
    expect(
      await EntitiesService.getEntity(await ownerSessionOf(ruleset.id), ruleset.id, "items", item.id),
    ).toMatchObject({
      requirements: [],
    });
    expect(await findFormValues("items", item.id)).toEqual({ fields: {}, links: {} });
  });

  test("an instance can switch templates", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const copy = await EntitiesService.duplicateEntity(session, ruleset.id, "items", mace.id, {
      name: "Custom weapon",
      fields: { [ITEM_TYPE]: "Weapon" },
    });
    expect(recordOf(copy)).toMatchObject({ fields: { [ITEM_IS_TEMPLATE]: false }, links: { madeFrom: mace.id } });

    const sword = await template("Longsword");
    expect(
      recordOf(
        await EntitiesService.updateEntity(session, ruleset.id, "items", copy.id, {
          name: copy.name,
          links: { madeFrom: sword.id },
        }),
      ),
    ).toMatchObject({ fields: { [ITEM_IS_TEMPLATE]: false }, links: { madeFrom: sword.id } });
    expect(
      (await EntitiesService.getEntity(await ownerSessionOf(ruleset.id), ruleset.id, "items", copy.id)).fields,
    ).toMatchObject({
      [WEAPON_TYPE]: "Longsword",
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
    const instance = { name: "My Longsword", fields: { [ITEM_TYPE]: "Weapon" }, links: { madeFrom: sword.id } };
    expect(recordOf(await EntitiesService.createEntity(session, ruleset.id, "items", instance))).toMatchObject({
      links: { madeFrom: copy.id },
    });

    const lacking = { ...instance, name: "No Longsword", links: { madeFrom: NIL_UUID } };
    expect(EntitiesService.createEntity(session, ruleset.id, "items", lacking)).rejects.toMatchObject({
      message: `Item ${NIL_UUID} does not belong to this ruleset`,
      refusal: "invalid",
    });
  });

  test("an instance's edit answers the template its fork copied after it was made as the copy, as its page does", async () => {
    const { session, ruleset, template, instance } = await setup();
    const sword = await template("Longsword");
    const mine = await instance("Longsword");
    const copy = await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, { name: "Our Longsword" });
    // Its stored template is the original, which its view reads as the fork's copy
    const edited = await EntitiesService.updateEntity(session, ruleset.id, "items", mine.id, { name: "My Blade" });
    const page = await EntitiesService.getEntity(session, ruleset.id, "items", mine.id);
    const madeFrom = (answer: { links: { role: string }[] }) => answer.links.filter((link) => link.role === "madeFrom");
    expect(madeFrom(edited)).toEqual([expect.objectContaining({ toId: copy.id, toName: "Our Longsword" })]);
    expect(madeFrom(edited)).toEqual(madeFrom(page));
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
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_WEIGHT]: 5 },
    });
    const { items } = await Activities.findPage(
      db,
      { userId: session.userId, targetType: "items" },
      { limit: 10, page: 1 },
    );
    const edit = items.find((activity) => activity.targetId === mine.id && activity.type === "updateItem");
    expect(edit?.data).toMatchObject({ changedFields: [{ field: ITEM_WEIGHT, to: "5" }] });
  });

  describe("have no template of their own", () => {
    test("when created", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Invalid template",
          fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
          links: { madeFrom: mace.id },
        }),
        422,
      );
      expect(
        await Entities.findOne<Item>(db, { entityType: "items", rulesetId: ruleset.id, name: "Invalid template" }),
      ).toBeUndefined();

      expect(
        recordOf(
          await EntitiesService.createEntity(session, ruleset.id, "items", {
            name: "Custom weapon template",
            fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_IS_TEMPLATE]: true }, links: { madeFrom: null } });
    });

    test("when an inherited one is edited, before any copy is made", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      expect(
        EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, {
          name: mace.name,
          links: { madeFrom: mace.id },
        }),
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
          fields: { [ITEM_IS_TEMPLATE]: false },
          links: { madeFrom: sword.id },
        }),
        422,
      );
      expect(storedRecordOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        fields: { [ITEM_IS_TEMPLATE]: true },
        links: { madeFrom: null },
      });
    });

    test("and an old self-reference is cleared on save", async () => {
      const { session, ruleset, template } = await setup();
      const mace = await template("Heavy Mace");
      const local = await EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, { name: mace.name });
      await Entities.update<Item>(db, "items", { links: { madeFrom: local.id } }, { id: local.id });
      RulesetViews.invalidate(ruleset.id);

      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
            name: local.name,
            description: "Updated template",
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_IS_TEMPLATE]: true }, links: { madeFrom: null } });
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
          fields: { [ITEM_TYPE]: type },
          links: { madeFrom: sword.id },
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
          fields: { [ITEM_TYPE]: "Weapon" },
          links: { madeFrom: sword.id },
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
          fields: { [ITEM_TYPE]: "Wondrous Item" },
        }),
        422,
      );
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          fields: { [ITEM_TYPE]: "Wondrous Item" },
          links: { madeFrom: recordOf(sword).links.madeFrom },
        }),
        422,
      );
      expect(storedRecordOf(await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))).toMatchObject({
        fields: { [ITEM_TYPE]: "Weapon" },
      });
    });

    test("refused when an edit gives a template of another type", async () => {
      const { session, ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      const mail = await template("Chain Mail");
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          links: { madeFrom: mail.id },
        }),
        422,
      );
      expect(storedRecordOf(await Entities.findOne<Item>(db, { entityType: "items", id: sword.id }))).toMatchObject({
        links: { madeFrom: recordOf(sword).links.madeFrom },
      });
    });

    test("kept when an edit changes the type with a template of it, or none", async () => {
      const { session, ruleset, template, instance } = await setup();
      const sword = await instance("Longsword");
      const mail = await template("Chain Mail");
      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
            name: sword.name,
            fields: { [ITEM_TYPE]: "Armor" },
            links: { madeFrom: mail.id },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_TYPE]: "Armor" }, links: { madeFrom: mail.id } });
      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
            name: sword.name,
            fields: { [ITEM_TYPE]: "Ring" },
            links: { madeFrom: null },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_TYPE]: "Ring" }, links: { madeFrom: null } });
    });
  });

  describe("keep their type while items are made from them", () => {
    test("refused before any copy is made, naming an item made from it", async () => {
      const { session, ruleset, template, instance } = await setup();
      await instance("Club");
      const club = await template("Club");
      const edit = { name: club.name, fields: { [ITEM_TYPE]: "Armor" } };
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
        EntitiesService.updateEntity(session, ruleset.id, "items", sword.id, {
          name: sword.name,
          fields: { [ITEM_TYPE]: "Shield" },
        }),
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
        EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
          name: local.name,
          fields: { [ITEM_TYPE]: "Armor" },
        }),
        422,
      );
      expect(storedRecordOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        fields: { [ITEM_TYPE]: "Weapon" },
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
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", local.id, {
            name: local.name,
            fields: { [ITEM_TYPE]: "Armor" },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_TYPE]: "Armor" } });
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
      const edit = { name: local.name, fields: { [ITEM_TYPE]: "Armor" } };
      const refusal = `Can't change the Weapon template "Bastard Sword" to Armor while items are made from it`;
      expect(EntitiesService.updateEntity(session, ruleset.id, "items", local.id, edit)).rejects.toMatchObject({
        message: `${refusal}: 1 in rulesets built on this one`,
        refusal: "unprocessable",
      });

      const blade = { name: "Public Blade", fields: { [ITEM_TYPE]: "Weapon" }, links: { madeFrom: local.id } };
      await EntitiesService.createEntity(session, ruleset.id, "items", blade);
      expect(EntitiesService.updateEntity(session, ruleset.id, "items", local.id, edit)).rejects.toMatchObject({
        message: `${refusal}: "Public Blade", and 1 in rulesets built on this one`,
      });
      expect(storedRecordOf(await Entities.findOne<Item>(db, { entityType: "items", id: local.id }))).toMatchObject({
        fields: { [ITEM_TYPE]: "Weapon" },
      });
    });

    test("changed when no item is made from it", async () => {
      const { session, ruleset, template } = await setup();
      const club = await template("Club");
      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
            name: club.name,
            fields: { [ITEM_TYPE]: "Shield" },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_IS_TEMPLATE]: true, [ITEM_TYPE]: "Shield", [ITEM_SLOT]: "Off Hand" } });
    });

    test("changed to the type the items made from it already are", async () => {
      const { session, ruleset } = await setup();
      const old = await EntitiesService.createEntity(session, ruleset.id, "items", {
        name: "Old",
        fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
      });
      await Entities.create<Item>(db, "items", {
        rulesetId: ruleset.id,
        name: "Old Mail",
        fields: { [ITEM_TYPE]: "Armor" },
        links: { madeFrom: old.id },
      });
      RulesetViews.invalidate(ruleset.id);
      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", old.id, {
            name: old.name,
            fields: { [ITEM_TYPE]: "Armor" },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_TYPE]: "Armor" } });
    });
  });

  describe("are of a type an item can be based on a template of", () => {
    test.each([
      ["a Ring", "Ring"],
      ["an item without a type", null],
    ])("refused as %s when created", async (_what, type) => {
      const { session, ruleset } = await setup();
      expect(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Odd Template",
          fields: { [ITEM_TYPE]: type, [ITEM_IS_TEMPLATE]: true },
        }),
      ).rejects.toThrow(`Item type ${type ?? "None"} can't be a template: only Weapon, Armor, Shield can`);
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "items", {
          name: "Odd Template",
          fields: { [ITEM_TYPE]: type, [ITEM_IS_TEMPLATE]: true },
        }),
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
        EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
          name: club.name,
          fields: { [ITEM_TYPE]: "Wondrous Item" },
        }),
        422,
      );
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "items", club.id, {
          name: club.name,
          fields: { [ITEM_TYPE]: null },
        }),
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
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", ring.id, {
            name: ring.name,
            fields: { [ITEM_TYPE]: "Ring" },
            description: "Still a ring",
          }),
        ),
      ).toMatchObject({ description: "Still a ring", fields: { [ITEM_TYPE]: "Ring" } });
      expect(
        recordOf(
          await EntitiesService.updateEntity(session, ruleset.id, "items", ring.id, {
            name: ring.name,
            fields: { [ITEM_TYPE]: "Weapon" },
          }),
        ),
      ).toMatchObject({ fields: { [ITEM_TYPE]: "Weapon" } });
    });
  });

  test("an inherited one is edited into a local copy, leaving the original", async () => {
    const { session, ruleset, template } = await setup();
    const mace = await template("Heavy Mace");
    const edited = await EntitiesService.updateEntity(session, ruleset.id, "items", mace.id, {
      name: mace.name,
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_WEIGHT]: 10 },
      description: "Heavier homebrew mace",
    });

    expect(edited.id).not.toBe(mace.id);
    expect(recordOf(edited)).toMatchObject({
      description: "Heavier homebrew mace",
      fields: { [ITEM_IS_TEMPLATE]: true, [ITEM_WEIGHT]: 10 },
      links: { madeFrom: null },
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
      fields: { [ITEM_TYPE]: "Armor", [ITEM_IS_TEMPLATE]: true },
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
    expect(
      (await EntitiesService.getTemplates(await ownerSessionOf(ruleset.id), ruleset.id, "items", "Weapon")).map(
        (item) => item.id,
      ),
    ).toContain(local.id);
  });
});
