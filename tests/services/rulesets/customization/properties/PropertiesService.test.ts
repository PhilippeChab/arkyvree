import { describe, expect, test } from "bun:test";

import { abilitiesInRules, propertiesInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { Feats, Items, Klasses, Properties } from "@/server/repositories/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/vocabulary/dnd3.5/properties/index.ts";

const acBonus = { type: "AC_BONUS", value: "5", description: "Armor class bonus" };

/** A new user's ruleset with a feat, and a template item with a property and an item made from it. */
async function setup() {
  const { session, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  const [feat] = await Feats.create(db, { name: "Test Feat", rulesetId });
  const [template] = await Items.create(db, { name: "Armor Template", rulesetId, isTemplate: true });
  const [templateProperty] = await Properties.create(db, { ...acBonus, entityId: template.id, entityType: "items" });
  const [derived] = await Items.create(db, { name: "Chainmail", rulesetId, sourceItemId: template.id });
  return { session, rulesetId, feat, template, templateProperty, derived };
}

// The feat property routes are covered in the customization properties router test.
describe("PropertiesService", () => {
  test("creates, lists, updates and deletes a property, keeping its activities", async () => {
    const { session, rulesetId, feat } = await setup();
    expect(await PropertiesService.getProperties(rulesetId, "feats", feat.id)).toEqual([]);

    const created = await PropertiesService.createProperty(session, rulesetId, "feats", feat.id, acBonus);
    expect(created).toMatchObject({ ...acBonus, entityType: "feats", entityId: feat.id });
    expect(await PropertiesService.getProperties(rulesetId, "feats", feat.id)).toMatchObject([{ id: created.id }]);
    expect(
      await PropertiesService.updateProperty(session, rulesetId, "feats", feat.id, created.id, {
        type: "AC_BONUS",
        value: "8",
      }),
    ).toMatchObject({ id: created.id, value: "8" });

    await PropertiesService.deleteProperty(session, rulesetId, "feats", feat.id, created.id);
    expect(await PropertiesService.getProperties(rulesetId, "feats", feat.id)).toEqual([]);
    expect(await activityTypes(session.userId, propertiesInCustomization, created.id)).toEqual([
      "createProperty",
      "deleteProperty",
      "updateProperty",
    ]);
  });

  test("refuses a missing ruleset, entity or property, another entity's property and another user", async () => {
    const { session, rulesetId, feat, templateProperty } = await setup();
    const { session: other } = await createTestUserAndRuleset();
    const created = await PropertiesService.createProperty(session, rulesetId, "feats", feat.id, acBonus);

    await expectRefusedWith(PropertiesService.getProperties(NIL_UUID, "feats", feat.id), 404);
    await expectRefusedWith(PropertiesService.getProperties(rulesetId, "feats", NIL_UUID), 404);
    await expectRefusedWith(PropertiesService.createProperty(session, rulesetId, "feats", NIL_UUID, acBonus), 404);
    expect(PropertiesService.createProperty(other, rulesetId, "feats", feat.id, acBonus)).rejects.toThrow(
      ForbiddenError,
    );
    for (const change of [
      (s = session, entityId = feat.id, id = created.id) =>
        PropertiesService.updateProperty(s, rulesetId, "feats", entityId, id, acBonus),
      (s = session, entityId = feat.id, id = created.id) =>
        PropertiesService.deleteProperty(s, rulesetId, "feats", entityId, id),
    ]) {
      await expectRefusedWith(change(session, feat.id, NIL_UUID), 404);
      // Only an item made from a template reaches the template's properties.
      await expectRefusedWith(change(session, feat.id, templateProperty.id), 404);
      expect(change(other)).rejects.toThrow(ForbiddenError);
    }
  });

  test("refuses an edit started from a stale copy", async () => {
    const { session, rulesetId, feat } = await setup();
    const created = await PropertiesService.createProperty(session, rulesetId, "feats", feat.id, acBonus);
    const edit = (value: string) =>
      PropertiesService.updateProperty(session, rulesetId, "feats", feat.id, created.id, {
        ...acBonus,
        value,
        updatedAt: created.updatedAt,
      });
    await edit("6");
    await expectRefusedWith(edit("7"), 409);
  });

  test("names the entity a value names, on a class's Properties tab and an entity's page alike", async () => {
    const { user } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    const paladin = await Klasses.findOne(db, { name: "Paladin", rulesetId: fork.rulesetId! });
    expect(await PropertiesService.getProperties(fork.id, "klasses", paladin!.id)).toMatchObject([
      { type: KLASS_BONUS_SPELL_ABILITY_ID, valueLabel: "Wisdom" },
      { type: KLASS_CASTER_TYPE, value: "Divine", valueLabel: null },
    ]);

    // A feat's page lists its properties alike, an id its view has none of left unnamed
    const { session, rulesetId, feat } = await setup();
    const [wisdom] = await insertRows(abilitiesInRules, [{ name: "Wisdom", description: "Wisdom", rulesetId }]);
    for (const value of [NIL_UUID, wisdom.id]) {
      await PropertiesService.createProperty(session, rulesetId, "feats", feat.id, {
        type: KLASS_BONUS_SPELL_ABILITY_ID,
        value,
      });
    }
    // In their values' order, as a stat block lists a type's
    const named = [
      { value: NIL_UUID, valueLabel: null },
      { value: wisdom.id, valueLabel: "Wisdom" },
    ];
    expect(await PropertiesService.getProperties(rulesetId, "feats", feat.id)).toMatchObject(named);
    expect((await FeatsService.getFeat(rulesetId, feat.id)).properties).toMatchObject(named);
  });

  describe("on an item made from a template", () => {
    test("overrides a template property on the item, leaving the template's", async () => {
      const { session, rulesetId, derived, templateProperty } = await setup();
      const override = await PropertiesService.updateProperty(
        session,
        rulesetId,
        "items",
        derived.id,
        templateProperty.id,
        { ...acBonus, value: "8" },
      );
      expect(override).toMatchObject({ entityId: derived.id, value: "8", description: acBonus.description });
      expect(override.id).not.toBe(templateProperty.id);
      expect(await Properties.findOne(db, { id: templateProperty.id })).toMatchObject({ value: "5" });
    });

    test("updates the item's own properties in place", async () => {
      const { session, rulesetId, derived } = await setup();
      const own = await PropertiesService.createProperty(session, rulesetId, "items", derived.id, {
        type: "WEIGHT",
        value: "3",
      });
      expect(
        await PropertiesService.updateProperty(session, rulesetId, "items", derived.id, own.id, {
          type: "WEIGHT",
          value: "5",
        }),
      ).toMatchObject({ id: own.id, value: "5" });
    });

    test("refuses to delete a template property", async () => {
      const { session, rulesetId, derived, templateProperty } = await setup();
      await expectRefusedWith(
        PropertiesService.deleteProperty(session, rulesetId, "items", derived.id, templateProperty.id),
        400,
      );
      expect(await Properties.findOne(db, { id: templateProperty.id })).toBeDefined();
    });
  });
});
