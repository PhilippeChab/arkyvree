import { describe, expect, test } from "bun:test";

import type { Feat, Klass, Race, RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findFormValues, listValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import { copyEntity, createSeededTestRuleset, ownerSessionOf } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { DEFAULT_HIT_DIE } from "@/vocabulary/dnd3.5/classes.ts";
import {
  CLASS_CASTER_TYPE,
  CLASS_HD,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  DAMAGE_TYPE,
  FEAT_FAMILY,
  FEAT_WEAPON_FINESSE,
  ITEM_IS_TEMPLATE,
  ITEM_MASTERWORK,
  ITEM_TYPE,
  RACE_BASE_SPEED,
  RACE_QUADRUPED,
  RACE_SIZE,
  SPELL_CASTING_TIME,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MAX_RANGE_INCREMENTS,
  WEAPON_MIGHTY,
  WEAPON_ONE_HAND_TRAINING,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A weapon's fields, each but those it gives none. */
const WEAPON = {
  [WEAPON_BASE_DAMAGE]: "1d8",
  [WEAPON_CRITICAL_MULTIPLIER]: 2,
  [WEAPON_CRITICAL_RANGE]: 2,
  [DAMAGE_TYPE]: ["Slashing"],
  [WEAPON_DOUBLE_DAMAGE]: "",
  [WEAPON_FAMILY]: "Sword",
  [WEAPON_FINESSABLE]: null,
  [WEAPON_MAX_RANGE_INCREMENTS]: null,
  [WEAPON_MIGHTY]: null,
  [WEAPON_ONE_HANDED_PENALTY]: null,
  [WEAPON_ONE_HAND_TRAINING]: null,
  [WEAPON_PROFICIENCY]: "Martial",
  [WEAPON_RANGE]: null,
  [WEAPON_RANGED]: null,
  [WEAPON_REACH]: null,
  [WEAPON_SIZE]: "Medium",
  [WEAPON_STRENGTH_DAMAGE]: "",
  [WEAPON_TYPE]: "Longsword",
};

/** The entity a single link of an answer's names, by its role: none without one. */
function linkedBy(answer: { links: readonly { role: string; toId: string }[] }, role: string) {
  return answer.links.find((link) => link.role === role)?.toId ?? null;
}

/** An entity's fields as its answer holds them (`type`'s `id`, in `rulesetId`): by the stored field that keeps each. */
async function fieldsOf(rulesetId: string, type: "classes" | "feats" | "items" | "races" | "spells", id: string) {
  return (await EntitiesService.getEntity(await ownerSessionOf(rulesetId), rulesetId, type, id)).fields;
}

/** A new user's empty ruleset with a feat pool and a spell list, and its Intelligence. */
async function setup() {
  const { session, ruleset, aptitudeIds } = await createTestUserAndRuleset(["General", "Wizard Spells"]);
  const [featPool, spellList] = aptitudeIds;
  const [intelligence] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Intelligence",
    description: "Intelligence",
    rulesetId: ruleset.id,
  });
  return { session, rulesetId: ruleset.id, featPool, spellList, intelligence };
}

/** A weapon template, and a sword made from it. */
async function setupTemplate() {
  const { session, rulesetId } = await setup();
  const template = await EntitiesService.createEntity(session, rulesetId, "items", {
    name: "Longsword",
    fields: { ...WEAPON, [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
  });
  const sword = await EntitiesService.createEntity(session, rulesetId, "items", {
    name: "Sword",
    fields: { ...WEAPON, [ITEM_TYPE]: "Weapon" },
    links: { madeFrom: template.id },
  });
  return { session, rulesetId, template, sword };
}

describe("An entity's fields", () => {
  test("save through its own create and edit, as its ruleset declares them, an edit's over those it keeps", async () => {
    const { session, rulesetId, featPool, intelligence } = await setup();
    const feat = await EntitiesService.createEntity(session, rulesetId, "feats", {
      name: "Finesse",
      fields: { [FEAT_FAMILY]: ["Luck"], [FEAT_WEAPON_FINESSE]: true },
      links: { listedIn: [{ toId: featPool }] },
    });
    expect(feat.fields).toMatchObject({ [FEAT_FAMILY]: ["Luck"], [FEAT_WEAPON_FINESSE]: true });
    await EntitiesService.updateEntity(session, rulesetId, "feats", feat.id, {
      name: "Finesse",
      fields: { [FEAT_FAMILY]: [] },
    });
    expect(await fieldsOf(rulesetId, "feats", feat.id)).toMatchObject({
      [FEAT_FAMILY]: [],
      [FEAT_WEAPON_FINESSE]: true,
    });
    expect(listValues(await findFormValues("feats", feat.id))).toEqual([`${FEAT_WEAPON_FINESSE}=true`]);

    // A list given a value twice keeps it once
    await EntitiesService.updateEntity(session, rulesetId, "feats", feat.id, {
      name: "Finesse",
      fields: { [FEAT_FAMILY]: ["Luck", "Lore", "Luck"] },
    });
    expect(await fieldsOf(rulesetId, "feats", feat.id)).toMatchObject({ [FEAT_FAMILY]: ["Luck", "Lore"] });

    const race = await EntitiesService.createEntity(session, rulesetId, "races", {
      name: "Centaur",
      fields: { [RACE_QUADRUPED]: true, [RACE_SIZE]: "Large", [RACE_BASE_SPEED]: 50 },
    });
    expect(await fieldsOf(rulesetId, "races", race.id)).toMatchObject({
      [RACE_SIZE]: "Large",
      [RACE_BASE_SPEED]: 50,
      [RACE_QUADRUPED]: true,
    });

    const wizard = await EntitiesService.createEntity(session, rulesetId, "classes", {
      name: "Wizard",
      fields: { [CLASS_CASTER_TYPE]: "Arcane" },
      links: { bonusSpellAbility: intelligence.id },
    });
    const described = await EntitiesService.getEntity(await ownerSessionOf(rulesetId), rulesetId, "classes", wizard.id);
    expect(described.fields).toMatchObject({ [CLASS_CASTER_TYPE]: "Arcane" });
    expect(linkedBy(described, "bonusSpellAbility")).toBe(intelligence.id);
    // None, as its form's select says it
    await EntitiesService.updateEntity(session, rulesetId, "classes", wizard.id, {
      name: "Wizard",
      fields: { [CLASS_CASTER_TYPE]: "" },
    });
    expect(listValues(await findFormValues("classes", wizard.id))).toEqual([`bonusSpellAbility=${intelligence.id}`]);

    const level = await EntitiesService.createOwnedEntity(session, rulesetId, "classes", wizard.id, {
      fields: { [CLASS_LEVEL_BAB]: 0, [CLASS_LEVEL_SKILL_POINTS]: 2 },
      position: 1,
    });
    await EntitiesService.updateOwnedEntity(session, rulesetId, "classes", wizard.id, level.id, {
      fields: { [CLASS_LEVEL_SKILL_POINTS]: 4 },
    });
    expect(
      (await EntitiesService.getOwnedEntityWithOwner(await ownerSessionOf(rulesetId), rulesetId, "classes", level.id))
        .fields,
    ).toMatchObject({
      [CLASS_LEVEL_BAB]: 0,
      [CLASS_LEVEL_SKILL_POINTS]: 4,
    });
  });

  test("refuse, by field, one their entity type doesn't declare, and a value outside its type's list or bounds", async () => {
    const { session, rulesetId, featPool } = await setup();
    const create = (fields: Record<string, unknown>) =>
      EntitiesService.createEntity(session, rulesetId, "feats", {
        name: "Odd",
        links: { listedIn: [{ toId: featPool }] },
        fields: fields as never,
      });
    expect(create({ [SPELL_SCHOOL]: "Evocation" })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: `fields.${SPELL_SCHOOL}`, message: "Not a field of this entity" }],
    });
    expect(create({ [FEAT_FAMILY]: ["Not a family"] })).rejects.toMatchObject({
      refusal: "invalid",
      issues: [{ category: `fields.${FEAT_FAMILY}.0` }],
    });
    expect(create({ [FEAT_WEAPON_FINESSE]: "yes" })).rejects.toMatchObject({
      issues: [{ category: `fields.${FEAT_WEAPON_FINESSE}` }],
    });

    const wizard = await EntitiesService.createEntity(session, rulesetId, "classes", { name: "Wizard" });
    expect(
      EntitiesService.updateEntity(session, rulesetId, "classes", wizard.id, {
        name: "Wizard",
        fields: { [CLASS_CASTER_TYPE]: "Psionic" },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${CLASS_CASTER_TYPE}` }] });
    expect(
      EntitiesService.updateEntity(session, rulesetId, "classes", wizard.id, {
        name: "Wizard",
        links: { bonusSpellAbility: NIL_UUID },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", message: `Ability ${NIL_UUID} does not belong to this ruleset` });
    expect(
      EntitiesService.createOwnedEntity(session, rulesetId, "classes", wizard.id, {
        fields: { [CLASS_LEVEL_SKILL_POINTS]: -1 },
        position: 1,
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${CLASS_LEVEL_SKILL_POINTS}` }] });
    // A base attack bonus past the last level's full one, and skill points past a table's most
    expect(
      EntitiesService.createOwnedEntity(session, rulesetId, "classes", wizard.id, {
        fields: { [CLASS_LEVEL_BAB]: 21 },
        position: 1,
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${CLASS_LEVEL_BAB}` }] });
    expect(
      EntitiesService.createOwnedEntity(session, rulesetId, "classes", wizard.id, {
        fields: { [CLASS_LEVEL_SKILL_POINTS]: 100 },
        position: 1,
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${CLASS_LEVEL_SKILL_POINTS}` }] });
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", name: "Odd", rulesetId })).toBeUndefined();
  });

  test("hold a spell's school to its ruleset's, a new one bringing its Spell Focus feats", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", links: { listedIn: [{ toId: spellList, tier: 1 }] } };
    expect(
      EntitiesService.createEntity(session, rulesetId, "spells", { ...spell, fields: { [SPELL_SCHOOL]: "Sorcery" } }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${SPELL_SCHOOL}` }] });
    const bolt = await EntitiesService.createEntity(session, rulesetId, "spells", {
      ...spell,
      fields: { [SPELL_SCHOOL]: "Evocation" },
    });
    await EntitiesService.updateEntity(session, rulesetId, "spells", bolt.id, {
      ...spell,
      fields: { [SPELL_SCHOOL]: "Conjuration" },
    });
    const focus = await EntitiesService.getEntities(
      await ownerSessionOf(rulesetId),
      rulesetId,
      "feats",
      { search: "Spell Focus" },
      { limit: 10, page: 1 },
    );
    expect(focus.items.map((feat) => feat.name).toSorted()).toEqual([
      "Greater Spell Focus: Conjuration",
      "Greater Spell Focus: Evocation",
      "Spell Focus: Conjuration",
      "Spell Focus: Evocation",
    ]);
    expect(listValues(await findFormValues("spells", bolt.id))).toEqual([`${SPELL_SCHOOL}=Conjuration`]);
  });

  test("of a spell take its range and its spell resistance in its book's words: free texts, no list", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", links: { listedIn: [{ toId: spellList, tier: 1 }] } };
    const fields = { [SPELL_SCHOOL]: "Evocation", [SPELL_RANGE_TYPE]: "60 ft.", [SPELL_RESISTANCE]: "Yes (harmless)" };
    const bolt = await EntitiesService.createEntity(session, rulesetId, "spells", { ...spell, fields });
    expect(listValues(await findFormValues("spells", bolt.id))).toEqual([
      `${SPELL_RANGE_TYPE}=60 ft.`,
      `${SPELL_RESISTANCE}=Yes (harmless)`,
      `${SPELL_SCHOOL}=Evocation`,
    ]);
  });

  test("keep a value their ruleset no longer lists while an edit leaves its field out", async () => {
    const { session, rulesetId, spellList } = await setup();
    const spell = { name: "Bolt", links: { listedIn: [{ toId: spellList, tier: 1 }] } };
    const bolt = await EntitiesService.createEntity(session, rulesetId, "spells", {
      ...spell,
      fields: { [SPELL_SCHOOL]: "Conjuration" },
    });
    await writeFieldValues("spells", bolt.id, [[SPELL_SUBSCHOOL, "Creation or Calling"]]);
    RulesetViews.invalidate(rulesetId);

    await EntitiesService.updateEntity(session, rulesetId, "spells", bolt.id, {
      ...spell,
      fields: { [SPELL_CASTING_TIME]: "1 round" },
    });
    expect(await fieldsOf(rulesetId, "spells", bolt.id)).toMatchObject({
      [SPELL_CASTING_TIME]: "1 round",
      [SPELL_SUBSCHOOL]: ["Creation or Calling"],
    });
    // Given back, it's refused as any value outside the list
    expect(
      EntitiesService.updateEntity(session, rulesetId, "spells", bolt.id, {
        ...spell,
        fields: { [SPELL_SUBSCHOOL]: ["Creation or Calling"] },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${SPELL_SUBSCHOOL}.0` }] });
  });

  test("give a new entity those it always holds, their defaults where its form or any writer gives none, never none", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const mage = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Mage" });
    expect(mage.fields[CLASS_HD]).toBe(DEFAULT_HIT_DIE);
    const elf = await EntitiesService.createEntity(session, ruleset.id, "races", { name: "Elf" });
    expect(elf.fields).toMatchObject({ [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 });
    // A writer past its form, which gives none of them: its storage writes their defaults
    const [bard] = await Entities.create<Klass>(db, "classes", { name: "Bard", rulesetId: ruleset.id });
    const [gnome] = await Entities.create<Race>(db, "races", { name: "Gnome", rulesetId: ruleset.id });
    expect(bard.fields[CLASS_HD]).toBe(DEFAULT_HIT_DIE);
    expect(gnome.fields).toMatchObject({ [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 });
    // Given, it's what it stores; none is refused
    const wizard = await EntitiesService.createEntity(session, ruleset.id, "classes", {
      name: "Wizard",
      fields: { [CLASS_HD]: 4 },
    });
    expect(wizard.fields[CLASS_HD]).toBe(4);
    for (const [type, id, field] of [
      ["classes", mage.id, CLASS_HD],
      ["races", elf.id, RACE_SIZE],
      ["races", elf.id, RACE_BASE_SPEED],
    ] as const) {
      expect(
        EntitiesService.updateEntity(session, ruleset.id, type, id, { name: "Kept", fields: { [field]: null } }),
      ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${field}` }] });
    }
  });

  test("copy an inherited entity to save them, its source's left as they were", async () => {
    const { session, user } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    const { abilityMap } = await getSeedCtx();
    const wisdom = await copyEntity(db, "abilities", abilityMap["Wisdom"], fork);
    RulesetViews.invalidate(fork.id);
    const fighter = await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Fighter",
      rulesetId: fork.rulesetId!,
    });

    // The seed's ids are the sources': the API takes them, and stores the fork's copy's
    const saved = await EntitiesService.updateEntity(session, fork.id, "classes", fighter!.id, {
      name: "Fighter",
      fields: { [CLASS_CASTER_TYPE]: "Divine" },
      links: { bonusSpellAbility: abilityMap["Wisdom"] },
    });
    expect(saved.id).not.toBe(fighter!.id);
    expect(saved.fields).toMatchObject({ [CLASS_CASTER_TYPE]: "Divine" });
    expect(linkedBy(saved, "bonusSpellAbility")).toBe(wisdom.id);
    expect(listValues(await findFormValues("classes", saved.id))).toEqual(
      [`bonusSpellAbility=${wisdom.id}`, `${CLASS_CASTER_TYPE}=Divine`].toSorted(),
    );
    expect(listValues(await findFormValues("classes", fighter!.id))).toEqual([]);
    const source = await EntitiesService.getEntity(
      await ownerSessionOf(fork.rulesetId!),
      fork.rulesetId!,
      "classes",
      fighter!.id,
    );
    expect(source.fields).toMatchObject({ [CLASS_CASTER_TYPE]: null });
    expect(linkedBy(source, "bonusSpellAbility")).toBeNull();
  });

  describe("on an item made from a template", () => {
    test("keep of their values those its template doesn't hold, reading the others off it", async () => {
      const { session, rulesetId, template, sword } = await setupTemplate();
      // What its form shows of its template, its own once saved, stores nothing of its own
      expect(sword.fields).toMatchObject({ [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_PROFICIENCY]: "Martial" });
      expect(listValues(await findFormValues("items", sword.id))).toEqual([]);

      await EntitiesService.updateEntity(session, rulesetId, "items", sword.id, {
        name: "Sword",
        fields: { ...WEAPON, [WEAPON_BASE_DAMAGE]: "1d10", [ITEM_MASTERWORK]: true, [ITEM_TYPE]: "Weapon" },
      });
      expect(listValues(await findFormValues("items", sword.id))).toEqual([
        "ITEM_MASTERWORK=true",
        `${WEAPON_BASE_DAMAGE}=1d10`,
      ]);

      // Its template's change reaches what the item doesn't hold
      await EntitiesService.updateEntity(session, rulesetId, "items", template.id, {
        name: "Longsword",
        fields: { ...WEAPON, [WEAPON_PROFICIENCY]: "Exotic", [ITEM_TYPE]: "Weapon" },
      });
      expect(await fieldsOf(rulesetId, "items", sword.id)).toMatchObject({
        [ITEM_MASTERWORK]: true,
        [WEAPON_BASE_DAMAGE]: "1d10",
        [WEAPON_PROFICIENCY]: "Exotic",
        [WEAPON_TYPE]: "Longsword",
      });
    });

    test("hold a duplicate's own of the fields its source holds, its form's over them", async () => {
      const { session, rulesetId, sword } = await setupTemplate();
      await EntitiesService.updateEntity(session, rulesetId, "items", sword.id, {
        name: "Sword",
        fields: { ...WEAPON, [WEAPON_BASE_DAMAGE]: "1d10", [ITEM_TYPE]: "Weapon" },
      });
      const copy = await EntitiesService.duplicateEntity(session, rulesetId, "items", sword.id, {
        name: "Sword (Copy)",
        fields: { ...WEAPON, [WEAPON_BASE_DAMAGE]: "1d12", [ITEM_TYPE]: "Weapon" },
      });
      expect(copy.fields).toMatchObject({ [WEAPON_BASE_DAMAGE]: "1d12", [WEAPON_PROFICIENCY]: "Martial" });
      expect(listValues(await findFormValues("items", copy.id))).toEqual([`${WEAPON_BASE_DAMAGE}=1d12`]);
      expect(listValues(await findFormValues("items", sword.id))).toEqual([`${WEAPON_BASE_DAMAGE}=1d10`]);
    });
  });

  test("of a feat refuse a family past its ruleset's, though its rows may hold one", async () => {
    const { session, rulesetId, featPool } = await setup();
    const feat = await EntitiesService.createEntity(session, rulesetId, "feats", {
      name: "Lucky",
      links: { listedIn: [{ toId: featPool }] },
    });
    await writeFieldValues("feats", feat.id, [[FEAT_FAMILY, "homebrew"]]);
    RulesetViews.invalidate(rulesetId);
    expect(await fieldsOf(rulesetId, "feats", feat.id)).toMatchObject({ [FEAT_FAMILY]: ["homebrew"] });
    expect(
      EntitiesService.updateEntity(session, rulesetId, "feats", feat.id, {
        name: "Lucky",
        fields: { [FEAT_FAMILY]: ["homebrew"] },
      }),
    ).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: `fields.${FEAT_FAMILY}.0` }] });
  });
});
