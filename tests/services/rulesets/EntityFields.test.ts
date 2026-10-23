import { describe, expect, test } from "bun:test";

import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Abilities, Feats, Klasses, Properties } from "@/server/repositories/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";
import { copyEntity, createSeededTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  FEAT_FAMILY,
  FEAT_WEAPON_FINESSE,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  WEAPON_BASE_DAMAGE,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A weapon's fields, each but those it gives none. */
const WEAPON = {
  baseDamage: "1d8",
  criticalMultiplier: 2,
  criticalRange: 2,
  damageTypes: ["Slashing"],
  doubleDamage: "",
  family: "Sword",
  finessable: null,
  maxRangeIncrements: null,
  mighty: null,
  oneHandedPenalty: null,
  oneHandTraining: null,
  proficiency: "Martial",
  range: null,
  ranged: null,
  reach: null,
  size: "Medium",
  strengthDamage: "",
  type: "Longsword",
};

/** A new user's empty ruleset with a feat pool and a spell list, and its Intelligence. */
async function setup() {
  const { session, ruleset, aptitudeIds } = await createTestUserAndRuleset(["General", "Wizard Spells"]);
  const [featPool, spellList] = aptitudeIds;
  const [intelligence] = await Abilities.create(db, {
    name: "Intelligence",
    description: "Intelligence",
    rulesetId: ruleset.id,
  });
  return { session, rulesetId: ruleset.id, featPool, spellList, intelligence };
}

/** A weapon template, and a sword made from it. */
async function setupTemplate() {
  const { session, rulesetId } = await setup();
  const template = await ItemsService.createItem(session, rulesetId, {
    name: "Longsword",
    type: "Weapon",
    isTemplate: true,
    fields: { weapon: WEAPON },
  });
  const sword = await ItemsService.createItem(session, rulesetId, {
    name: "Sword",
    type: "Weapon",
    sourceItemId: template.id,
    fields: { weapon: WEAPON },
  });
  return { session, rulesetId, template, sword };
}

/** An entity's properties as stored, as `type=value`, sorted. */
async function storedProperties(entityId: string) {
  const rows = await Properties.findMany(db, { entityIds: [entityId] });
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("An entity's fields", () => {
  test("save through its own create and edit, as its ruleset declares them, an edit's over those it keeps", async () => {
    const { session, rulesetId, featPool, intelligence } = await setup();
    const feat = await FeatsService.createFeat(session, rulesetId, {
      name: "Finesse",
      aptitudeIds: [featPool],
      fields: { families: ["Luck"], weaponFinesse: true },
    });
    expect(feat).toMatchObject({ families: ["Luck"], weaponFinesse: true });
    await FeatsService.updateFeat(session, rulesetId, feat.id, { name: "Finesse", fields: { families: [] } });
    expect(await FeatsService.getFeat(rulesetId, feat.id)).toMatchObject({ families: [], weaponFinesse: true });
    expect(await storedProperties(feat.id)).toEqual([`${FEAT_WEAPON_FINESSE}=true`]);

    const race = await RacesService.createRace(session, rulesetId, {
      name: "Centaur",
      size: "Large",
      baseSpeed: 50,
      fields: { quadruped: true },
    });
    expect(await RacesService.getRace(rulesetId, race.id)).toMatchObject({ quadruped: true });

    const wizard = await ClassesService.createClass(session, rulesetId, {
      name: "Wizard",
      fields: { bonusSpellAbilityId: intelligence.id, casterType: "Arcane" },
    });
    expect(await ClassesService.getClass(rulesetId, wizard.id)).toMatchObject({
      bonusSpellAbilityId: intelligence.id,
      casterType: "Arcane",
    });
    // None, as its form's select says it
    await ClassesService.updateClass(session, rulesetId, wizard.id, { name: "Wizard", fields: { casterType: "" } });
    expect(await storedProperties(wizard.id)).toEqual([`${KLASS_BONUS_SPELL_ABILITY_ID}=${intelligence.id}`]);

    const level = await ClassLevelsService.createClassLevel(session, rulesetId, wizard.id, {
      level: 1,
      fields: { bab: 0, skills: 2 },
    });
    await ClassLevelsService.updateClassLevel(session, rulesetId, wizard.id, level.id, { fields: { skills: 4 } });
    expect(await ClassLevelsService.getClassLevel(rulesetId, wizard.id, level.id)).toMatchObject({ bab: 0, skills: 4 });
  });

  test("refuse, by field, one their entity type doesn't declare, and a value outside its type's list or bounds", async () => {
    const { session, rulesetId, featPool } = await setup();
    const create = (fields: Record<string, unknown>) =>
      FeatsService.createFeat(session, rulesetId, { name: "Odd", aptitudeIds: [featPool], fields: fields as never });
    expect(create({ school: "Evocation" })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "fields.school", message: "Not a field of this entity" }],
    });
    expect(create({ families: ["Not a family"] })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: "fields.families.0" }],
    });
    expect(create({ weaponFinesse: "yes" })).rejects.toMatchObject({ issues: [{ category: "fields.weaponFinesse" }] });

    const wizard = await ClassesService.createClass(session, rulesetId, { name: "Wizard" });
    expect(
      ClassesService.updateClass(session, rulesetId, wizard.id, { name: "Wizard", fields: { casterType: "Psionic" } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.casterType" }] });
    expect(
      ClassesService.updateClass(session, rulesetId, wizard.id, {
        name: "Wizard",
        fields: { bonusSpellAbilityId: NIL_UUID },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", message: `Ability ${NIL_UUID} does not belong to this ruleset` });
    expect(
      ClassLevelsService.createClassLevel(session, rulesetId, wizard.id, { level: 1, fields: { skills: -1 } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.skills" }] });
    // A base attack bonus past the last level's full one, and skill points past a table's most
    expect(
      ClassLevelsService.createClassLevel(session, rulesetId, wizard.id, { level: 1, fields: { bab: 21 } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.bab" }] });
    expect(
      ClassLevelsService.createClassLevel(session, rulesetId, wizard.id, { level: 1, fields: { skills: 100 } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.skills" }] });
    expect(await Feats.findOne(db, { name: "Odd", rulesetId })).toBeUndefined();
  });

  test("hold a spell's school to its ruleset's, a new one bringing its Spell Focus feats", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", aptitudes: [{ id: spellList, level: 1 }] };
    expect(
      PowersService.createPower(session, rulesetId, { ...spell, fields: { school: "Sorcery" } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.school" }] });
    const bolt = await PowersService.createPower(session, rulesetId, { ...spell, fields: { school: "Evocation" } });
    await PowersService.updatePower(session, rulesetId, bolt.id, { ...spell, fields: { school: "Conjuration" } });
    const focus = await FeatsService.getFeats(rulesetId, { search: "Spell Focus" }, { limit: 10, page: 1 });
    expect(focus.items.map((feat) => feat.name).toSorted()).toEqual([
      "Greater Spell Focus: Conjuration",
      "Greater Spell Focus: Evocation",
      "Spell Focus: Conjuration",
      "Spell Focus: Evocation",
    ]);
    expect(await storedProperties(bolt.id)).toEqual([`${SPELL_SCHOOL}=Conjuration`]);
  });

  test("of a spell take its range and its spell resistance in its book's words: free texts, no list", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", aptitudes: [{ id: spellList, level: 1 }] };
    const fields = { school: "Evocation", rangeType: "60 ft.", spellResistance: "Yes (harmless)" };
    const bolt = await PowersService.createPower(session, rulesetId, { ...spell, fields });
    expect(await storedProperties(bolt.id)).toEqual([
      `${SPELL_RANGE_TYPE}=60 ft.`,
      `${SPELL_RESISTANCE}=Yes (harmless)`,
      `${SPELL_SCHOOL}=Evocation`,
    ]);
  });

  test("keep a stored value their ruleset no longer lists while an edit leaves its field out", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", aptitudes: [{ id: spellList, level: 1 }] };
    const bolt = await PowersService.createPower(session, rulesetId, { ...spell, fields: { school: "Conjuration" } });
    await Properties.createMany(db, [
      { entityId: bolt.id, entityType: "powers", type: SPELL_SUBSCHOOL, value: "Creation or Calling" },
    ]);
    RulesetViews.invalidate(rulesetId);

    await PowersService.updatePower(session, rulesetId, bolt.id, { ...spell, fields: { castingTime: "1 round" } });
    expect(await PowersService.getPower(rulesetId, bolt.id)).toMatchObject({
      castingTime: "1 round",
      subschool: "Creation or Calling",
    });
    // Given back, it's refused as any value outside the list
    expect(
      PowersService.updatePower(session, rulesetId, bolt.id, {
        ...spell,
        fields: { subschool: "Creation or Calling" },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.subschool" }] });
  });

  test("copy an inherited entity to save them, its source's left as they were", async () => {
    const { session, user } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    const { abilityMap } = await getSeedCtx();
    const wisdom = await copyEntity(db, "abilities", abilityMap["Wisdom"], fork);
    RulesetViews.invalidate(fork.id);
    const fighter = await Klasses.findOne(db, { name: "Fighter", rulesetId: fork.rulesetId! });

    // The seed's ids are the sources': the API takes them, and stores the fork's copy's
    const saved = await ClassesService.updateClass(session, fork.id, fighter!.id, {
      name: "Fighter",
      fields: { bonusSpellAbilityId: abilityMap["Wisdom"], casterType: "Divine" },
    });
    expect(saved.id).not.toBe(fighter!.id);
    expect(saved).toMatchObject({ bonusSpellAbilityId: wisdom.id, casterType: "Divine" });
    expect(await storedProperties(saved.id)).toEqual(
      [`${KLASS_BONUS_SPELL_ABILITY_ID}=${wisdom.id}`, `${KLASS_CASTER_TYPE}=Divine`].toSorted(),
    );
    expect(await storedProperties(fighter!.id)).toEqual([]);
    expect(await ClassesService.getClass(fork.rulesetId!, fighter!.id)).toMatchObject({
      bonusSpellAbilityId: null,
      casterType: null,
    });
  });

  describe("on an item made from a template", () => {
    test("keep of their values those its template doesn't hold, reading the others off it", async () => {
      const { session, rulesetId, template, sword } = await setupTemplate();
      // What its form shows of its template, its own once saved, stores nothing of its own
      expect(sword).toMatchObject({ weapon: { baseDamage: "1d8", proficiency: "Martial" } });
      expect(await storedProperties(sword.id)).toEqual([]);

      await ItemsService.updateItem(session, rulesetId, sword.id, {
        name: "Sword",
        type: "Weapon",
        fields: { weapon: { ...WEAPON, baseDamage: "1d10" }, masterwork: true },
      });
      expect(await storedProperties(sword.id)).toEqual(["ITEM_MASTERWORK=true", `${WEAPON_BASE_DAMAGE}=1d10`]);

      // Its template's change reaches what the item doesn't hold
      await ItemsService.updateItem(session, rulesetId, template.id, {
        name: "Longsword",
        type: "Weapon",
        fields: { weapon: { ...WEAPON, proficiency: "Exotic" } },
      });
      expect(await ItemsService.getItem(rulesetId, sword.id)).toMatchObject({
        masterwork: true,
        weapon: { baseDamage: "1d10", proficiency: "Exotic", type: "Longsword" },
      });
    });

    test("copy over a duplicate's copied properties, of the item's own", async () => {
      const { session, rulesetId, sword } = await setupTemplate();
      await ItemsService.updateItem(session, rulesetId, sword.id, {
        name: "Sword",
        type: "Weapon",
        fields: { weapon: { ...WEAPON, baseDamage: "1d10" } },
      });
      const copy = await ItemsService.duplicateItem(session, rulesetId, sword.id, {
        name: "Sword (Copy)",
        type: "Weapon",
        fields: { weapon: { ...WEAPON, baseDamage: "1d12" } },
      });
      expect(copy).toMatchObject({ weapon: { baseDamage: "1d12", proficiency: "Martial" } });
      expect(await storedProperties(copy.id)).toEqual([`${WEAPON_BASE_DAMAGE}=1d12`]);
      expect(await storedProperties(sword.id)).toEqual([`${WEAPON_BASE_DAMAGE}=1d10`]);
    });
  });

  test("of a feat refuse a family past its ruleset's, though its rows may hold one", async () => {
    const { session, rulesetId, featPool } = await setup();
    const feat = await FeatsService.createFeat(session, rulesetId, { name: "Lucky", aptitudeIds: [featPool] });
    await Properties.createMany(db, [{ entityId: feat.id, entityType: "feats", type: FEAT_FAMILY, value: "homebrew" }]);
    RulesetViews.invalidate(rulesetId);
    expect(await FeatsService.getFeat(rulesetId, feat.id)).toMatchObject({ families: ["homebrew"] });
    expect(
      FeatsService.updateFeat(session, rulesetId, feat.id, { name: "Lucky", fields: { families: ["homebrew"] } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "fields.families.0" }] });
  });
});
