import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import {
  DND35_COMPLETE_ADVENTURER_NAME,
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
  DND35_RULESET_NAME,
} from "@/content/dnd3.5/rulesetNames.ts";
import { RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import {
  aptitudesInRules,
  characterAbilitiesInCharacter,
  charactersInCharacter,
  featsAptitudesInRules,
  featsInRules,
  inventoryInCharacter,
  modifiersInCustomization,
  powersAptitudesInRules,
  powersInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import CharacterResponse from "@/engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import type { WeaponSlot } from "@/engine/rulesets/dnd3.5/model/combat/CombatState.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { addClassLevels, addFeats, addPowers, addSkills, createCharacter } from "@/scripts/db/seeds/seedCharacter.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import {
  Aptitudes,
  CharacterLevelFeats,
  CharacterLevels,
  Characters,
  Feats,
  Klasses,
  Modifiers,
  Properties,
  Races,
  Requirements,
} from "@/server/repositories/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Character, Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { seededRows } from "@/tests/seeds/seededRows.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { insertRows, measure } from "@/tests/support/database.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { addCharacterLevel, createTestKlassLevel, findKlassLevel } from "@/tests/support/levels.ts";
import { createTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, findSeededRuleset, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  DAMAGE_TYPE,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  RACE_SPEED_IGNORES_ENCUMBRANCE,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FAMILY,
  WEAPON_MIGHTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
} from "@/vocabulary/dnd3.5/properties/index.ts";

interface Carried {
  equipped?: boolean;
  item: string;
  location?: ItemLocation;
  quantity?: number;
  weaponSet?: number;
}

type Detailed = Awaited<ReturnType<typeof build>>;

const WIZARD_SCORES = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 };

function allPowers(detailed: Detailed) {
  return Object.values(detailed.components.classes.getCharacterClasses()).flatMap((klass) =>
    klass.levels.flatMap((level) => level.powers),
  );
}

function dexterityMisc(detailed: Detailed) {
  return detailed.components.abilities.getAbilities().dexterity.misc;
}

/** A requirement's check that a number is `value`. */
function exactly(value: number) {
  return { operator: "equal", value: String(value), valueType: "number" } as const;
}

function requirementIssues(detailed: Detailed) {
  return detailed.validate().issues.filter((issue) => issue.category === "requirements");
}

/** One group holding one requirement on `target`: by default, that it's true. */
function requiring(
  target: string,
  check: Pick<Requirement, "operator" | "value" | "valueType"> = {
    operator: "equal",
    value: "true",
    valueType: "boolean",
  },
): Requirement[][] {
  const now = new Date().toISOString();
  const requirement: Requirement = {
    id: target,
    entityId: "test",
    entityType: "test",
    level: "1",
    target,
    ...check,
    chainingOperator: null,
    createdAt: now,
    deletedAt: null,
    updatedAt: now,
  };
  return [[requirement]];
}

function spellLevel(detailed: Detailed, aptitude: string, level: number) {
  return (detailed.components.aptitudes.getAptitudes()[aptitude] as Record<string, unknown>)[
    String(level)
  ] as AptitudeLevelData;
}

function spellUses(detailed: Detailed, aptitude: string, levels: number[]) {
  return levels.map((level) => spellLevel(detailed, aptitude, level).uses);
}

function weaponSet(detailed: Detailed, set = "0") {
  return detailed.components.combat.getCombat().weaponsets[set];
}

/** The seeded character, now a halfling. */
async function asHalfling(name: string) {
  const character = await findSeededCharacter(name);
  const halfling = (await Races.findOne(db, { name: "Halfling", rulesetId: character.rulesetId }))!;
  await db.update(charactersInCharacter).set({ raceId: halfling.id }).where(eq(charactersInCharacter.id, character.id));
  return { ...character, raceId: halfling.id };
}

async function build(character: Character) {
  const detailed = await buildAs(DetailedCharacter, character);
  return detailed;
}

/** The seeded character, carrying only these items. */
async function buildCarrying(name: string, carried: Carried[] = []) {
  const character = await findSeededCharacter(name);
  await carry(character, carried);
  return build(character);
}

/** A ranger 6 with Two-Weapon Fighting and its improved feat, through the combat style: STR 14, DEX 16, BAB +6. */
async function buildRanger(carried: Carried[]) {
  const ctx = await getSeedCtx();
  const characterId = await seedHuman(
    "Two-Weapon Ranger",
    { Strength: 14, Dexterity: 16, Constitution: 12, Intelligence: 10, Wisdom: 12, Charisma: 8 },
    { xp: 15000 },
  );
  const levels = await addClassLevels(db, ctx, characterId, "Ranger", [1, 2, 3, 4, 5, 6], [8, 5, 5, 5, 5, 5]);
  await addFeats(db, ctx, levels, [
    { levelIndex: 1, featName: "Two-Weapon Fighting", aptitude: "Ranger Combat Style (2nd)" },
    { levelIndex: 5, featName: "Improved Two-Weapon Fighting", aptitude: "Ranger Improved Combat Style (6th)" },
  ]);
  const character = (await Characters.findOne(db, { id: characterId }))!;
  await carry(character, carried);
  return build(character);
}

async function buildSeeded(name: string) {
  return build(await findSeededCharacter(name));
}

/** Replaces the character's inventory: seeded items by name, or item ids. */
async function carry(character: Character, carried: Carried[]) {
  const { itemMap } = await getSeedCtx();
  await db.delete(inventoryInCharacter).where(eq(inventoryInCharacter.characterId, character.id));
  if (carried.length === 0) return;
  await db.insert(inventoryInCharacter).values(
    carried.map(({ item, equipped = true, quantity = 1, ...rest }) => ({
      characterId: character.id,
      itemId: itemMap[item] ?? item,
      equipped,
      quantity,
      ...rest,
    })),
  );
}

/** A new wondrous item of the seeded ruleset, worn at `slot`, that raises an ability by `bonus`. */
async function createAbilityItem(ability: string, bonus: number, slot: ItemLocation) {
  const item = await createTestItem({ name: `${ability} +${bonus}`, type: "Wondrous Item", slot });
  await Modifiers.create(db, {
    sourceId: item.id,
    sourceType: "items",
    target: `abilities.${ability}.misc`,
    value: String(bonus),
    valueType: "number",
    operator: "add",
  });
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
  return item;
}

/** A character of a fork with Complete Divine, with these modifiers of its own (`[target, value, valueType]`). */
async function divineCharacter(
  name: string,
  abilities: Record<string, number>,
  granted: [string, string, string][],
  alignment?: "Neutral Good" | "Chaotic Neutral",
) {
  const fork = await forkWith(DND35_COMPLETE_DIVINE_NAME);
  const characterId = await seedHuman(name, abilities, { rulesetId: fork.id, alignment });
  for (const [target, value, valueType] of granted) {
    const operator = valueType === "boolean" ? "set" : "add";
    await Modifiers.create(db, {
      sourceId: characterId,
      sourceType: "characters",
      target,
      value,
      valueType,
      operator,
    });
  }
  return characterId;
}

/** A fork of the seeded ruleset that uses these extensions. */
async function forkWith(...extensionNames: string[]) {
  const { rulesetId } = await getSeedCtx();
  const extensions = [];
  for (const name of extensionNames) extensions.push((await findSeededRuleset(name)).id);
  const fork = await createTestRuleset(SEED_USER_ID, {
    rulesetId,
    ancestorRulesetIds: [rulesetId],
    extensionRulesetIds: extensions,
  });
  RulesetViews.invalidate(fork.id);
  return fork;
}

async function met(name: string, target: string, check?: Parameters<typeof requiring>[1]) {
  return (await buildSeeded(name)).areRequirementsMet(requiring(target, check));
}

/** A composite longbow of the seeded ruleset made for this Strength bonus. */
async function mightyBow(rating: number) {
  return createTestItem(
    {
      name: `Composite Longbow (+${rating} Str)`,
      type: "Weapon",
      slot: "Two Handed",
      sourceItemId: (await getSeedCtx()).itemMap["Composite Longbow"],
    },
    { [WEAPON_MIGHTY]: String(rating) },
  );
}

/** Whether `name` is proficient with `item` held at `location`. */
async function proficientWith(name: string, item: string, location: "Main Hand" | "Two Handed") {
  const set = weaponSet(await buildCarrying(name, [{ item, location, weaponSet: 0 }]));
  return (location === "Two Handed" ? set.twohanded : set.mainhand)!.proficient;
}

/** A modifier of the character's race, gated by `requirements` when given: it applies to the seeded character. */
async function raceModifier(
  name: string,
  modifier: { operator?: string; target: string; value: string },
  requirements: { operator: string; target: string; value: string; valueType: string }[] = [],
) {
  const character = await findSeededCharacter(name);
  const [created] = await Modifiers.create(db, {
    sourceId: character.raceId,
    sourceType: "races",
    operator: "add",
    valueType: "number",
    ...modifier,
  });
  for (const [index, requirement] of requirements.entries()) {
    await Requirements.create(db, {
      entityId: created.id,
      entityType: "modifiers",
      level: String(index + 1),
      ...requirement,
    });
  }
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
  return created;
}

/** An item that requires `target` (equal true, or this check), with +2 to hit for the hand holding it. */
async function requiringWithBonus(
  item: Awaited<ReturnType<typeof createTestItem>>,
  target: string,
  check: Pick<Requirement, "operator" | "value" | "valueType"> = {
    operator: "equal",
    value: "true",
    valueType: "boolean",
  },
) {
  await Requirements.create(db, { entityId: item.id, entityType: "items", level: "1", target, ...check });
  await Modifiers.create(db, {
    sourceId: item.id,
    sourceType: "items",
    target: "weapon.tohit.misc",
    value: "2",
    valueType: "number",
    operator: "add",
  });
  invalidateSeededRuleset((await getSeedCtx()).rulesetId);
  return item;
}

/** A new character of the seed user's: human, neutral good, with these scores. */
async function seedHuman(
  name: string,
  abilities: Record<string, number>,
  values: { alignment?: "Neutral Good" | "Chaotic Neutral" | "Neutral Evil"; rulesetId?: string; xp?: number } = {},
) {
  const ctx = await getSeedCtx();
  return createCharacter(db, ctx, {
    raceName: "Human",
    name,
    xp: values.xp ?? 0,
    alignment: values.alignment ?? "Neutral Good",
    age: 30,
    gender: "Male",
    height: "180",
    weight: "80",
    description: "Test",
    abilities,
    languages: ["Common"],
    rulesetId: values.rulesetId,
  });
}

/** A new wizard 1 whose Toughness grants Magic Missile, which gets `requirement` of its own when given. */
async function setupGrantedSpell({ requirement = false, spellFocus = false } = {}) {
  const ctx = await getSeedCtx();
  const characterId = await seedHuman("Granted Spell Test", WIZARD_SCORES, { xp: 1000 });
  const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
  await addSkills(db, ctx, levelIds, [
    { levelIndex: 0, skillName: "Spellcraft", rank: 4 },
    { levelIndex: 0, skillName: "Concentration", rank: 4 },
  ]);
  await addFeats(db, ctx, levelIds, [
    {
      levelIndex: 0,
      featName: spellFocus ? "Spell Focus: Evocation" : "Improved Initiative",
      aptitude: "General",
    },
    { levelIndex: 0, featName: "Scribe Scroll", aptitude: "Wizard Bonus Feat" },
    { levelIndex: 0, featName: "Toughness", aptitude: "General" },
  ]);
  await addPowers(
    db,
    ctx,
    levelIds,
    ["Detect Magic", "Read Magic", "Mage Armor"].map((powerName) => ({
      levelIndex: 0,
      powerName,
      aptitude: "Wizard Spells",
    })),
  );
  await Modifiers.create(db, {
    sourceId: ctx.featMap["Toughness"],
    sourceType: "feats",
    target: "powers.magicmissile.wizard.known",
    value: "true",
    valueType: "boolean",
    operator: "set",
  });
  if (requirement) {
    await Requirements.create(db, {
      entityId: ctx.powerMap["Magic Missile"],
      entityType: "powers",
      level: "1",
      target: "classes.wizard.level",
      operator: "greater_than_or_equal",
      value: "5",
      valueType: "number",
    });
  }
  invalidateSeededRuleset(ctx.rulesetId);
  return build((await Characters.findOne(db, { id: characterId }))!);
}

/** Bjorn on a fork using Complete Warrior, with its Uncanny Blow, holding a bastard sword. */
async function setupUncannyBlow(location: "Main Hand" | "Two Handed") {
  const bjorn = await findSeededCharacter("Bjorn Ironhand");
  const fork = await forkWith(DND35_COMPLETE_WARRIOR_NAME);
  await db.update(charactersInCharacter).set({ rulesetId: fork.id }).where(eq(charactersInCharacter.id, bjorn.id));
  const extension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const uncannyBlow = (await Feats.findOne(db, {
    name: "Uncanny Blow (Exotic Weapon Master Exotic Weapon Stunt)",
    rulesetId: extension.id,
  }))!;
  const stunt = (await Aptitudes.findOne(db, {
    name: "Exotic Weapon Master Exotic Weapon Stunt",
    rulesetId: extension.id,
  }))!;
  const [level] = await CharacterLevels.findMany(db, { characterId: bjorn.id });
  await CharacterLevelFeats.createMany(db, [
    { characterLevelId: level.id, featId: uncannyBlow.id, aptitudeId: stunt.id },
  ]);
  const character = { ...bjorn, rulesetId: fork.id };
  await carry(character, [{ item: "Bastard Sword", location, weaponSet: 0 }]);
  return build(character);
}

/**
 * A wizard 7 / loremaster 1 of Intelligence `intelligence`, who picked Weapon Trick at her loremaster level 1, a
 * quarterstaff in her hands.
 */
async function setupWeaponTrick(intelligence: number) {
  const ctx = await getSeedCtx();
  const dmg = await findSeededRuleset(DND35_DMG_NAME);
  const fork = await forkWith(DND35_DMG_NAME);
  const characterId = await seedHuman(
    `Loremaster ${intelligence}`,
    { ...WIZARD_SCORES, Intelligence: intelligence },
    { xp: 28000, rulesetId: fork.id },
  );
  await addClassLevels(db, ctx, characterId, "Wizard", [1, 2, 3, 4, 5, 6, 7], [4, 4, 4, 4, 4, 4, 4]);
  const loremaster = (await Klasses.findOne(db, { name: "Loremaster", rulesetId: dmg.id }))!;
  const weaponTrick = (await Feats.findOne(db, {
    name: "Secret: Weapon Trick (Loremaster Secret)",
    rulesetId: dmg.id,
  }))!;
  const secret = (await Aptitudes.findOne(db, { name: "Loremaster Secret", rulesetId: dmg.id }))!;
  await addCharacterLevel(characterId, (await findKlassLevel(loremaster.id, 1))!.id, {
    feats: [{ featId: weaponTrick.id, aptitudeId: secret.id }],
  });
  const character = (await Characters.findOne(db, { id: characterId }))!;
  await carry(character, [{ item: "Quarterstaff", location: "Two Handed", weaponSet: 0 }]);
  return await build(character);
}

describe("DetailedCharacter", () => {
  describe("building", () => {
    test("fails without its ruleset or its race", async () => {
      const { rulesetId } = await getSeedCtx();
      const character = {
        name: "Test Character",
        userId: SEED_USER_ID,
        xp: 0,
        alignment: "True Neutral",
        age: 20,
        gender: "Male",
        height: "180",
        weight: "80",
      };
      expect(
        buildAs(DetailedCharacter, { ...character, rulesetId: NIL_UUID, raceId: NIL_UUID } as Character),
      ).rejects.toThrow("Ruleset not found");
      expect(buildAs(DetailedCharacter, { ...character, rulesetId, raceId: NIL_UUID } as Character)).rejects.toThrow(
        "Race not found",
      );
    });

    test("builds in the scope its caller holds: it reads no ruleset and composes no view, for the same sheet", async () => {
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const own = await build(bjorn);
      await withRulesetScope(db, bjorn.rulesetId, async (scope) => {
        const built = await measure(() => buildAs(DetailedCharacter, bjorn, { scope }));
        expect(built.timing.cacheHits + built.timing.cacheMisses).toBe(0);
        expect(CharacterResponse.buildFull(bjorn, built.result)).toEqual(CharacterResponse.buildFull(bjorn, own));
      });
    });

    test("builds in a scope of its own when the one it's handed is another ruleset's", async () => {
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const ownScope = await measure(() => withRulesetScope(db, bjorn.rulesetId, async () => {}));
      await withRulesetScope(db, (await findSeededRuleset(DND35_DMG_NAME)).id, async (otherScope) => {
        const { result: detailed, timing } = await measure(() =>
          buildAs(DetailedCharacter, bjorn, { scope: otherScope }),
        );
        expect(timing.cacheHits + timing.cacheMisses).toBe(ownScope.timing.cacheHits + ownScope.timing.cacheMisses);
        expect(detailed.getRuleset()?.id).toBe(bjorn.rulesetId);
      });
    });

    test("resolves every property path listed for the spells it has, each type written its own way", async () => {
      const record = await findSeededCharacter("Elara Starweaver");
      const elara = await build(record);
      const targetPaths = new Dnd35TargetPaths();
      const { paths } = await withRulesetScope(db, record.rulesetId, async ({ rulesetData }) =>
        targetPaths.list(rulesetData, "requirement"),
      );
      // The spells it has: their entries carry their properties (a spell it hasn't is #335's)
      const spells = new Set(
        Object.entries(elara.components.powers.getPowers())
          .filter(([, entry]) => isRecord(entry) && "properties" in entry)
          .map(([slug]) => slug),
      );
      const propertyPaths = paths
        .map(({ path }) => path)
        .filter((path) => /^powers\.[a-z0-9]+\.properties\./.test(path) && spells.has(path.split(".")[1]));
      expect(propertyPaths.length).toBeGreaterThan(0);
      const errors = propertyPaths.flatMap((path) =>
        targetPaths
          .traversePathInit(path, elara.components)
          .flatMap((result) => (result.error === null ? [] : [`${path}: ${result.error}`])),
      );
      expect(errors).toEqual([]);
    });

    test("keeps the GM's private notes from every path, and in the sheet's response", async () => {
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const detailed = await build({ ...bjorn, notes: "A wandering smith", privateNotes: "Owes the thieves' guild" });
      const targetPaths = new Dnd35TargetPaths();
      const read = (path: string) =>
        targetPaths.traversePathInit(path, detailed.components).map((r) => r.error ?? r.data);
      expect(read("identity.background.notes")).toEqual(["A wandering smith"]);
      expect(read("identity.background.privateNotes")).toEqual(["Element not found: privateNotes"]);
      expect(detailed.components.identity.getIdentity().background).toEqual({ notes: "A wandering smith" });
      expect(CharacterResponse.buildFull(bjorn, detailed).identity.background).toEqual({
        notes: "A wandering smith",
        privateNotes: "Owes the thieves' guild",
      });
    });

    test("reaches no value a character doesn't have, and reads an unset height or weight as empty", async () => {
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const unset = await build({ ...bjorn, age: null, height: null, weight: null });
      const targetPaths = new Dnd35TargetPaths();
      expect(targetPaths.traversePathInit("identity.physiology.age", unset.components)).toEqual([]);
      const old = requiring("identity.physiology.age", {
        operator: "greater_than_or_equal",
        value: "100",
        valueType: "number",
      });
      const evaluator = new RequirementEvaluator(targetPaths);
      evaluator.evaluateRequirements(unset.components, old);
      expect(evaluator.getRequirements().invalidRequirements).toEqual([]);
      expect(unset.areRequirementsMet(old)).toBe(false);
      for (const field of ["height", "weight"]) {
        const empty = requiring(`identity.physiology.${field}`, {
          operator: "is_empty",
          value: "",
          valueType: "string",
        });
        expect([field, unset.areRequirementsMet(empty)]).toEqual([field, true]);
      }

      // A bow's Strength doesn't follow its hand: its share holds no value, which a path reaches nothing of
      const archer = await buildCarrying("Bjorn Ironhand", [
        { item: "Composite Longbow", location: "Two Handed", weaponSet: 0 },
      ]);
      expect(
        targetPaths.traversePathInit("items.weapons.compositelongbow.damage.strmultiplier", archer.components),
      ).toEqual([]);
      expect(
        targetPaths.traversePathInit("items.weapons.compositelongbow.damage.base", archer.components),
      ).toHaveLength(1);
    });

    test("reaches only values of the type each listed path declares", async () => {
      const targetPaths = new Dnd35TargetPaths();
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const characters = [
        await buildCarrying("Bjorn Ironhand", [{ item: "Heavy Crossbow", location: "Two Handed", weaponSet: 0 }]),
        await build({ ...bjorn, age: null, height: null, weight: null }),
        await buildSeeded("Elara Starweaver"),
      ];
      const { paths } = await withRulesetScope(db, bjorn.rulesetId, async ({ rulesetData }) =>
        targetPaths.list(rulesetData, "requirement"),
      );
      expect(paths.length).toBeGreaterThan(5000);
      const mismatches = characters.flatMap((detailed) =>
        paths.flatMap(({ path, valueType }) =>
          targetPaths
            .traversePathInit(path, detailed.components)
            .filter((result) => result.error === null && !LiteralValue.hasType(result.data, valueType))
            .map((result) => `${path}: ${typeof result.data}, declared ${valueType}`),
        ),
      );
      expect(mismatches).toEqual([]);
    });

    test("reads a seeded character's identity, abilities and ruleset", async () => {
      const bjorn = await buildSeeded("Bjorn Ironhand");
      expect(bjorn.getRuleset()?.name).toBe(DND35_RULESET_NAME);
      expect(bjorn.getPlayer()).toBeUndefined();
      expect(bjorn.getCampaign()).toBeUndefined();
      expect(bjorn.components.identity.getIdentity()).toMatchObject({
        physiology: { name: "Bjorn Ironhand", race: { name: "Human" } },
        beliefs: { alignment: "Lawful Good" },
        meta: { xp: 10000 },
      });

      // No increases or misc bonuses: each total is the base score.
      const scores = { strength: 18, dexterity: 14, constitution: 16, intelligence: 12, wisdom: 10, charisma: 8 };
      const abilities = bjorn.components.abilities;
      for (const [ability, score] of Object.entries(scores)) {
        expect(abilities.getAbilities()[ability as keyof typeof scores]).toMatchObject({
          base: score,
          level: 0,
          misc: 0,
          total: score,
        });
        const name = ability[0].toUpperCase() + ability.slice(1);
        expect(abilities.getAbility(name).total).toBe(score);
        expect(abilities.getAbilityModifier(name)).toBe(Math.floor((score - 10) / 2));
      }
    });

    test.each([
      ["Bjorn Ironhand", "Human", "Lawful Good"],
      ["Lyra Shadowstep", "Elf", "Chaotic Neutral"],
      ["Grak Thunderfist", "Half-Orc", "Chaotic Neutral"],
      ["Zen Whitepetal", "Human", "Lawful Neutral"],
      ["Kael Stormborn", "Dwarf", "Neutral Good"],
      ["Elara Starweaver", "Elf", "Neutral Good"],
      ["Vex Flamecaller", "Human", "Chaotic Good"],
      ["Theron Lightbringer", "Human", "Lawful Good"],
      ["Melody Silverveil", "Half-Elf", "Chaotic Good"],
      ["Aldric Dawnbringer", "Human", "Lawful Good"],
      ["Rowan Thornwalker", "Human", "True Neutral"],
      ["Fenn Ashwalker", "Half-Elf", "Neutral Good"],
    ])("validates seeded character %s", async (name, race, alignment) => {
      const detailed = await buildSeeded(name);
      expect(detailed.components.identity.getIdentity()).toMatchObject({
        physiology: { name, race: { name: race } },
        beliefs: { alignment },
      });
      expect(detailed.validate()).toEqual({ valid: true, issues: [] });
    });

    test("lists only the classes the character has levels in", async () => {
      const classes = (await buildSeeded("Vex Flamecaller")).components.classes;
      // getClasses holds every class of the ruleset, at level 0 when the character has none.
      expect(Object.keys(classes.getClasses()).length).toBeGreaterThan(1);
      expect(Object.entries(classes.getCharacterClasses()).map(([key, klass]) => [key, klass.level])).toEqual([
        ["sorcerer", 3],
      ]);
    });
    test("lists a level's skills, then its picked and its granted feats, each by name", async () => {
      const zen = (await buildSeeded("Zen Whitepetal")).components.classes.getCharacterClasses();
      const [first] = zen["monk"].levels;
      const names = (rows: { name: string }[]) => rows.map((row) => row.name);
      expect(names(first.skills)).toEqual(["Balance", "Jump", "Listen", "Spot", "Tumble"]);
      expect(names(first.feats)).toEqual([
        "Dodge",
        "Improved Grapple",
        "Improved Initiative",
        "AC Bonus (Monk)",
        "Bonus Feat 1st (Monk)",
        "Flurry of Blows (Monk)",
        "Improved Unarmed Strike",
        "Weapon and Armor Proficiency (Monk)",
      ]);
    });
  });

  describe("saving throws", () => {
    test("add the class's base, the ability and misc bonuses", async () => {
      // Fighter 5: good Fortitude 4, poor Reflex and Will 1. Great Fortitude adds 2.
      const bjorn = (await buildSeeded("Bjorn Ironhand")).components.saves;
      expect(bjorn.getSaves()).toMatchObject({
        fortitude: { base: 4, ability: 3, misc: 2, total: 9 },
        reflex: { base: 1, ability: 2, misc: 0, total: 3 },
        will: { base: 1, ability: 0, misc: 0, total: 1 },
      });
      expect(["Fortitude", "Reflex", "Will"].map((name) => bjorn.getSave(name).total)).toEqual([9, 3, 1]);
    });

    test("add a paladin's charisma through Divine Grace, a template modifier", async () => {
      // Paladin 5, CHA 15 (+2): good Fortitude 4, poor Reflex and Will 1.
      const aldric = await buildSeeded("Aldric Dawnbringer");
      expect(aldric.components.saves.getSaves()).toMatchObject({
        fortitude: { base: 4, misc: 2, total: 8 },
        reflex: { base: 1, misc: 2, total: 3 },
        will: { base: 1, misc: 2, total: 4 },
      });
      const { appliedModifiers, skippedModifiers } = aldric.modifierEvaluator.getModifiers();
      // The wildcard over saves gives one modifier each.
      expect(
        appliedModifiers.filter((m) => m.value === "{{ [abilities.charisma.modifier] }}").length,
      ).toBeGreaterThanOrEqual(3);
      expect(skippedModifiers.filter((s) => s.modifier.value.startsWith("{{"))).toEqual([]);
    });
  });

  describe("hit points", () => {
    test("add each level's constitution bonus, with the race's", async () => {
      // A dwarf (CON 16 + 2): +4 at each of 4 levels, on 10 + 8 + 7 + 12 rolled; Toughness adds 3.
      const hp = (await buildSeeded("Kael Stormborn")).components.combat.getCombat().hp;
      expect(hp).toMatchObject({ base: 37, constitution: 16, misc: 3, total: 56 });
    });

    test("never drop a level below 1 hit point, however low the constitution", async () => {
      const ctx = await getSeedCtx();
      const characterId = await seedHuman(
        "Frail Fighter",
        { Strength: 10, Dexterity: 10, Constitution: 6, Intelligence: 10, Wisdom: 10, Charisma: 10 },
        { xp: 1000 },
      );
      await addClassLevels(db, ctx, characterId, "Fighter", [1, 2], [1, 4]);
      const hp = (await build((await Characters.findOne(db, { id: characterId }))!)).components.combat.getCombat().hp;
      // CON 6 takes 2 off each roll: the 1 rolled still gives 1, the 4 gives 2.
      expect(hp).toMatchObject({ base: 5, constitution: -2, total: 3 });
    });
  });

  describe("skill points", () => {
    test("give a level at least 1, before the first level's four times over", async () => {
      const ctx = await getSeedCtx();
      const characterId = await seedHuman(
        "Dim Fighter",
        { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 3, Wisdom: 10, Charisma: 10 },
        { xp: 1000 },
      );
      await addClassLevels(db, ctx, characterId, "Fighter", [1, 2], [10, 6]);
      const budget = (
        await build((await Characters.findOne(db, { id: characterId }))!)
      ).components.skills.getSkillBudget();
      // A human fighter with INT 3: 2 - 4 = -2 a level, at least 1, and the human's 1 beside: 2 (8 at the first level) + 2.
      expect(budget.total).toBe(10);
    });
  });

  describe("skills", () => {
    test("a trained-only skill is unusable without ranks, its fields' rows or none", async () => {
      // Knowledge (Arcana) and Spellcraft are trained-only, and keep no rows: their fields are their defaults
      const skills = (await buildSeeded("Bjorn Ironhand")).components.skills.getSkills();
      const trained = (name: string) => skills[stripSeparators(name)];
      expect(
        [trained("Knowledge (Arcana)"), trained("Spellcraft")].map((skill) => [skill.rank, skill.trained]),
      ).toEqual([
        [0, false],
        [0, false],
      ]);
      expect(trained("Climb").trained).toBe(true);
    });
  });

  describe("initiative", () => {
    test("adds dexterity, modifiers to it included", async () => {
      // DEX 14, 18 (+4) with the gloves.
      const combat = (
        await buildCarrying("Bjorn Ironhand", [
          { item: (await createAbilityItem("dexterity", 4, "Hands")).id, location: "Hands" },
        ])
      ).components.combat.getCombat();
      expect(combat.initiative.dexterity).toBe(4);
      expect(combat.ac.dexterity).toBe(4);
    });
  });

  describe("weapons", () => {
    test("fill the weapon sets from what the character holds, with half strength in the off hand", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Longsword", location: "Main Hand", weaponSet: 0 },
        { item: "Shortsword", location: "Off Hand", weaponSet: 0 },
      ]);
      // STR 18: +4.
      expect(weaponSet(bjorn)).toMatchObject({
        mainhand: {
          name: "Longsword",
          damage: { base: "1d8", types: ["Slashing"], critical: { range: 2, multiplier: 2 }, strength: 4 },
        },
        offhand: { name: "Shortsword", damage: { base: "1d6", types: ["Piercing"], strength: 2 } },
      });
      expect(Object.keys(bjorn.components.weapons.getWeapons())).toEqual(
        expect.arrayContaining(["longsword", "shortsword"]),
      );
    });

    test("give a weapon held in two hands one and a half strength", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Greataxe", location: "Two Handed", weaponSet: 1 }]);
      expect(weaponSet(bjorn, "1").twohanded).toMatchObject({
        name: "Greataxe",
        damage: { base: "1d12", critical: { range: 1, multiplier: 3 }, strength: 6 },
      });
      expect(bjorn.components.weapons.getWeapons()["greataxe"]).toBeDefined();
    });

    test("group a weapon under its type, not its name", async () => {
      const variant = await createTestItem(
        { name: "Longsword +1", type: "Weapon", slot: "Main Hand" },
        {
          [WEAPON_PROFICIENCY]: "Martial",
          [WEAPON_FAMILY]: "Sword",
          [WEAPON_BASE_DAMAGE]: "1d8",
          [WEAPON_CRITICAL_RANGE]: "2",
          [WEAPON_CRITICAL_MULTIPLIER]: "2",
          [DAMAGE_TYPE]: "Slashing",
          [WEAPON_SIZE]: "Medium",
          [WEAPON_TYPE]: "Longsword",
        },
      );
      const weapons = (
        await buildCarrying("Bjorn Ironhand", [{ item: variant.id, location: "Main Hand", weaponSet: 0 }])
      ).components.weapons.getWeapons();
      expect(weapons["longsword"]).toBeDefined();
      expect(weapons["longsword1"]).toBeUndefined();
    });

    test("apply a weapon's own bonus to the hand that holds it, not the other", async () => {
      const blade = await createTestItem(
        { name: "Keen Blade", type: "Weapon", slot: "Main Hand" },
        {
          [WEAPON_PROFICIENCY]: "Martial",
          [WEAPON_FAMILY]: "Sword",
          [WEAPON_BASE_DAMAGE]: "1d8",
          [WEAPON_CRITICAL_RANGE]: "2",
          [WEAPON_CRITICAL_MULTIPLIER]: "2",
          [DAMAGE_TYPE]: "Slashing",
          [WEAPON_SIZE]: "Medium",
          [WEAPON_TYPE]: "Longsword",
        },
      );
      for (const target of ["weapon.tohit.misc", "weapon.damage.misc"]) {
        await Modifiers.create(db, {
          sourceId: blade.id,
          sourceType: "items",
          target,
          value: "2",
          valueType: "number",
          operator: "add",
        });
      }
      invalidateSeededRuleset((await getSeedCtx()).rulesetId);

      const { mainhand, offhand } = weaponSet(
        await buildCarrying("Bjorn Ironhand", [
          { item: blade.id, location: "Main Hand", weaponSet: 0 },
          { item: "Shortsword", location: "Off Hand", weaponSet: 0 },
        ]),
      );
      // On top of Bjorn's Weapon Focus (+1 to attack) and Weapon Specialization (+2 to damage) in longswords
      expect(mainhand).toMatchObject({ name: "Keen Blade", tohit: { misc: 3 }, damage: { misc: 4 } });
      expect(offhand).toMatchObject({ name: "Shortsword", tohit: { misc: 0 }, damage: { misc: 0 } });
    });

    test("write damage with the strength bonus added or taken away", async () => {
      // STR 18, Longsword.
      expect(weaponSet(await buildSeeded("Bjorn Ironhand")).mainhand!.damage.total).toMatch(/^\d+d\d+ \+ \d+$/);
      // STR 8: a dagger takes 1 off; a crossbow fires without strength.
      const vex = await buildSeeded("Vex Flamecaller");
      expect(weaponSet(vex).mainhand).toMatchObject({ name: "Dagger", damage: { total: "1d4 - 1" } });
      expect(weaponSet(vex, "1").twohanded).toMatchObject({ name: "Light Crossbow", damage: { total: "1d8" } });
    });

    test("cap a mighty composite bow's strength to damage at its rating, and aim it with dexterity", async () => {
      const bow = weaponSet(
        await buildCarrying("Bjorn Ironhand", [
          { item: (await mightyBow(2)).id, location: "Two Handed", weaponSet: 0 },
        ]),
      ).twohanded;
      // STR 18 (+4), DEX 14 (+2).
      expect(bow).toMatchObject({ damage: { strength: 2, total: "1d8 + 2" }, tohit: { strength: 2 } });

      // The seeded oathbow is a +2 composite longbow: its own rating wins over its template's +0.
      const oathbow = weaponSet(
        await buildCarrying("Bjorn Ironhand", [{ item: "Oathbow", location: "Two Handed", weaponSet: 0 }]),
      ).twohanded;
      expect(oathbow).toMatchObject({ name: "Oathbow", damage: { strength: 2 } });
    });

    test("take 2 off a composite bow's attack when the strength bonus falls short of its rating, a plain bow's never", async () => {
      // STR 8 (-1), DEX 14 (+2): short of the seeded composite longbow's +0.
      const vex = await buildCarrying("Vex Flamecaller", [
        { item: "Composite Longbow", location: "Two Handed", weaponSet: 0 },
        { item: "Longbow", location: "Two Handed", weaponSet: 1 },
      ]);
      expect([weaponSet(vex).twohanded!.tohit.strength, weaponSet(vex, "1").twohanded!.tohit.strength]).toEqual([0, 2]);

      // STR 18 (+4), short of +5: damage takes all of it.
      const bow = weaponSet(
        await buildCarrying("Bjorn Ironhand", [
          { item: (await mightyBow(5)).id, location: "Two Handed", weaponSet: 0 },
        ]),
      ).twohanded;
      expect(bow).toMatchObject({ tohit: { strength: 0 }, damage: { strength: 4 } });
    });

    test("add a sling's strength to damage, a thrown weapon's, and aim it with dexterity", async () => {
      // STR 18 (+4), DEX 14 (+2).
      const sling = weaponSet(
        await buildCarrying("Bjorn Ironhand", [{ item: "Sling", location: "Main Hand", weaponSet: 0 }]),
      ).mainhand;
      expect(sling).toMatchObject({ name: "Sling", tohit: { strength: 2 }, damage: { strength: 4, total: "1d4 + 4" } });
    });

    test("take a strength penalty but no bonus to a bow's damage, its rating aside, and none to a crossbow's", async () => {
      const ranged: Carried[] = [
        { item: "Longbow", location: "Two Handed", weaponSet: 0 },
        { item: "Composite Longbow", location: "Two Handed", weaponSet: 1 },
        { item: "Light Crossbow", location: "Two Handed", weaponSet: 2 },
      ];
      const strengthToDamage = (detailed: Detailed) =>
        ["0", "1", "2"].map((set) => weaponSet(detailed, set).twohanded!.damage.strength);
      // STR 8 (-1), then STR 18 (+4).
      expect(strengthToDamage(await buildCarrying("Vex Flamecaller", ranged))).toEqual([-1, -1, 0]);
      expect(strengthToDamage(await buildCarrying("Bjorn Ironhand", ranged))).toEqual([0, 0, 0]);
    });

    test("take a strength penalty in full in either hand and in two, never the hand's share of it", async () => {
      // STR 8, 4 (-3) with the belt.
      const vex = await buildCarrying("Vex Flamecaller", [
        { item: (await createAbilityItem("strength", -4, "Waist")).id, location: "Waist" },
        { item: "Dagger", location: "Main Hand", weaponSet: 0 },
        { item: "Sickle", location: "Off Hand", weaponSet: 0 },
        { item: "Quarterstaff", location: "Two Handed", weaponSet: 1 },
      ]);
      const { mainhand, offhand } = weaponSet(vex);
      expect([mainhand, offhand, weaponSet(vex, "1").twohanded].map((weapon) => weapon!.damage.strength)).toEqual([
        -3, -3, -3,
      ]);
    });

    test("give a light weapon held in two hands its strength once, not one and a half times", async () => {
      // STR 18 (+4): a shortsword is light for a human, a longsword isn't.
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Shortsword", location: "Two Handed", weaponSet: 0 },
        { item: "Longsword", location: "Two Handed", weaponSet: 1 },
      ]);
      expect(weaponSet(bjorn).twohanded).toMatchObject({ light: true, damage: { strength: 4 } });
      expect(weaponSet(bjorn, "1").twohanded).toMatchObject({ light: false, damage: { strength: 6 } });

      // As a halfling, STR 16 (+3): a shortsword, sized for its wielder, is still light.
      const halfling = await asHalfling("Bjorn Ironhand");
      await carry(halfling, [{ item: "Shortsword", location: "Two Handed", weaponSet: 0 }]);
      expect(weaponSet(await build(halfling)).twohanded).toMatchObject({ light: true, damage: { strength: 3 } });
    });

    test("aim and strike with strength as modifiers leave it", async () => {
      // STR 18, 22 (+6) with the belt.
      const longsword = weaponSet(
        await buildCarrying("Bjorn Ironhand", [
          { item: (await createAbilityItem("strength", 4, "Waist")).id, location: "Waist" },
          { item: "Longsword", location: "Main Hand", weaponSet: 0 },
        ]),
      ).mainhand;
      expect(longsword).toMatchObject({ tohit: { strength: 6 }, damage: { strength: 6 } });
    });

    test("aim a dagger with strength in melee and with dexterity thrown, and a crossbow with dexterity", async () => {
      // STR 8 (-1), DEX 14 (+2), BAB +1.
      const vex = await buildSeeded("Vex Flamecaller");
      expect(weaponSet(vex).mainhand).toMatchObject({
        name: "Dagger",
        ranged: false,
        tohit: { strength: -1, total: [0] },
        thrown: { dexterity: 2, total: [3] },
      });
      expect(weaponSet(vex, "1").twohanded).toMatchObject({
        name: "Light Crossbow",
        ranged: true,
        tohit: { strength: 2, total: [3] },
        thrown: null,
      });
    });

    test("aim a javelin and a dart with dexterity, ranged weapons though thrown, their damage taking strength", async () => {
      // STR 8 (-1), DEX 14 (+2).
      const vex = await buildCarrying("Vex Flamecaller", [
        { item: "Javelin", location: "Main Hand", weaponSet: 0 },
        { item: "Dart", location: "Main Hand", weaponSet: 1 },
      ]);
      for (const set of ["0", "1"]) {
        expect(weaponSet(vex, set).mainhand).toMatchObject({
          ranged: true,
          tohit: { strength: 2 },
          damage: { strength: -1 },
          thrown: null,
        });
      }
    });

    test("throw a sai but not a handaxe: of the two, the SRD gives a range increment to the sai only", async () => {
      // STR 18 (+4), DEX 14 (+2), BAB +5.
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Sai", location: "Main Hand", weaponSet: 0 },
        { item: "Handaxe", location: "Main Hand", weaponSet: 1 },
      ]);
      expect(weaponSet(bjorn).mainhand).toMatchObject({ name: "Sai", range: 10, thrown: { dexterity: 2 } });
      expect(weaponSet(bjorn, "1").mainhand).toMatchObject({ name: "Handaxe", range: 0, thrown: null });
    });

    test("read whether a weapon is ranged and how strength adds to its damage off its properties, not its family", async () => {
      const weapon = (name: string, family: string, properties: Record<string, string> = {}) =>
        createTestItem(
          { name, type: "Weapon", slot: "Main Hand" },
          {
            [WEAPON_PROFICIENCY]: "Simple",
            [WEAPON_FAMILY]: family,
            [WEAPON_BASE_DAMAGE]: "1d6",
            [WEAPON_CRITICAL_RANGE]: "1",
            [WEAPON_CRITICAL_MULTIPLIER]: "2",
            [WEAPON_TYPE]: name,
            ...properties,
          },
        );
      const caster = await weapon("Spell Caster", "Sword", {
        [WEAPON_RANGED]: "true",
        [WEAPON_RANGE]: "30",
        [WEAPON_STRENGTH_DAMAGE]: "None",
      });
      const stick = await weapon("Bow-shaped Stick", "Bow");
      // STR 18 (+4), DEX 14 (+2).
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: caster.id, location: "Main Hand", weaponSet: 0 },
        { item: stick.id, location: "Main Hand", weaponSet: 1 },
      ]);
      expect(weaponSet(bjorn).mainhand).toMatchObject({
        ranged: true,
        tohit: { strength: 2 },
        damage: { strength: 0 },
      });
      expect(weaponSet(bjorn, "1").mainhand).toMatchObject({
        ranged: false,
        tohit: { strength: 4 },
        damage: { strength: 4 },
      });
    });

    describe("with Weapon Finesse", () => {
      test("aim a light weapon with dexterity when it's higher, damage still using strength", async () => {
        // An elf rogue: STR 10, DEX 20 (+5).
        expect(weaponSet(await buildSeeded("Lyra Shadowstep"))).toMatchObject({
          mainhand: { name: "Shortsword", tohit: { strength: 5 }, damage: { strength: 0 } },
          offhand: { name: "Dagger", tohit: { strength: 5 } },
        });
      });

      test("aim with strength once modifiers raise it past dexterity", async () => {
        // An elf rogue: DEX 20 (+5), STR 10, 22 (+6) with the belt.
        const rapier = weaponSet(
          await buildCarrying("Lyra Shadowstep", [
            { item: (await createAbilityItem("strength", 12, "Waist")).id, location: "Waist" },
            { item: "Rapier", location: "Main Hand", weaponSet: 0 },
          ]),
        ).mainhand;
        expect(rapier).toMatchObject({ name: "Rapier", tohit: { strength: 6 } });
      });

      test("come from a feat's property, not its name", async () => {
        const { featMap, rulesetId } = await getSeedCtx();
        await Properties.delete(db, {
          entityIds: [featMap["Weapon Finesse"]],
          entityType: "feats",
          types: [FEAT_WEAPON_FINESSE],
        });
        invalidateSeededRuleset(rulesetId);
        // An elf rogue with Weapon Finesse, which no longer says it finesses: STR 10 (+0), DEX 20.
        expect(weaponSet(await buildSeeded("Lyra Shadowstep")).mainhand).toMatchObject({ tohit: { strength: 0 } });
      });

      test("keep strength when it's higher", async () => {
        // STR 18 (+4) over DEX 14 (+2).
        expect(
          weaponSet(
            await buildCarrying("Bjorn Ironhand", [{ item: "Shortsword", location: "Main Hand", weaponSet: 0 }]),
          ).mainhand!.tohit.strength,
        ).toBe(4);
      });

      test("take a carried shield's armor check penalty, keeping strength once that's better", async () => {
        // An elf rogue: STR 10 (+0), DEX 20 (+5), proficient with shields through a charm; a heavy steel shield costs 2,
        // a tower shield 10.
        const charm = await createTestItem({ name: "Shield Charm", type: "Wondrous Item", slot: "Neck" });
        for (const feat of ["shieldproficiency", "towershieldproficiency"]) {
          await Modifiers.create(db, {
            sourceId: charm.id,
            sourceType: "items",
            target: `feats.${feat}.possessed`,
            value: "true",
            valueType: "boolean",
            operator: "set",
          });
        }
        invalidateSeededRuleset((await getSeedCtx()).rulesetId);
        const finessed = async (shield: string) =>
          weaponSet(
            await buildCarrying("Lyra Shadowstep", [
              { item: charm.id, location: "Neck" },
              { item: "Rapier", location: "Main Hand", weaponSet: 0 },
              { item: shield, location: "Off Hand", weaponSet: 0 },
            ]),
          ).mainhand!.tohit;
        expect(await finessed("Heavy Steel Shield")).toMatchObject({ strength: 3, gearpenalty: 0 });
        expect(await finessed("Tower Shield")).toMatchObject({ strength: 0, gearpenalty: -2 });
      });

      test("take a shield's penalty once without proficiency: every attack takes it already", async () => {
        // The rogue, proficient with no shield: her whole DEX 20 (+5), and the heavy steel shield's 2 on every attack.
        const { mainhand } = weaponSet(
          await buildCarrying("Lyra Shadowstep", [
            { item: "Rapier", location: "Main Hand", weaponSet: 0 },
            { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect(mainhand!.tohit).toMatchObject({ strength: 5, gearpenalty: -2 });
      });
    });

    describe("with two weapons", () => {
      test("cost each hand the SRD's penalties, lighter for a light off-hand weapon, the off hand attacking once", async () => {
        // An elf rogue without the feats: BAB +2, DEX 20 (+5) through Weapon Finesse; a dagger is light (-4 / -8).
        const { mainhand, offhand } = weaponSet(await buildSeeded("Lyra Shadowstep"));
        expect(mainhand).toMatchObject({
          name: "Shortsword",
          tohit: { total: [7] },
          twoweapon: { total: [3], thrown: null },
        });
        // Thrown, the dagger aims with dexterity: +7 as well, the same penalty.
        expect(offhand).toMatchObject({
          name: "Dagger",
          tohit: { total: [7] },
          twoweapon: { total: [-1], thrown: [-1] },
        });
      });

      test("lighten the penalties and add off-hand attacks by the feats, each 5 lower", async () => {
        // STR 14 (+2), BAB +6: +8/+3 alone. With a light off-hand weapon and the feat, -2 / -2; without, -4 / -4.
        const light = weaponSet(
          await buildRanger([
            { item: "Longsword", location: "Main Hand", weaponSet: 0 },
            { item: "Shortsword", location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect([light.mainhand!.twoweapon!.total, light.offhand!.twoweapon!.total]).toEqual([
          [6, 1],
          [6, 1],
        ]);
        const heavy = weaponSet(
          await buildRanger([
            { item: "Longsword", location: "Main Hand", weaponSet: 0 },
            { item: "Battleaxe", location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect([heavy.mainhand!.twoweapon!.total, heavy.offhand!.twoweapon!.total]).toEqual([
          [4, -1],
          [4, -1],
        ]);
      });

      test("weigh a halfling's off-hand weapon as a human's: sized for its wielder, a kukri is light", async () => {
        const halfling = await asHalfling("Bjorn Ironhand");
        await carry(halfling, [
          { item: "Shortsword", location: "Main Hand", weaponSet: 0 },
          { item: "Kukri", location: "Off Hand", weaponSet: 0 },
        ]);
        const { mainhand, offhand } = weaponSet(await build(halfling));
        // Without the feats, a light off-hand weapon: -4 / -8.
        expect(mainhand!.twoweapon!.total).toEqual(mainhand!.tohit.total.map((attack) => attack - 4));
        expect(offhand!.twoweapon!.total).toEqual([offhand!.tohit.total[0] - 8]);
      });

      test("fight with a double weapon in two hands as two weapons, its other end a light off-hand one", async () => {
        // A quarterstaff (1d6/1d6): +8/+3 alone, 1½ Strength. As two weapons, with the feats and a light other end:
        // -2 / -2, the other end twice (Improved Two-Weapon Fighting), with its whole Strength bonus and half of it
        const { twohanded: staff } = weaponSet(
          await buildRanger([{ item: "Quarterstaff", location: "Two Handed", weaponSet: 0 }]),
        );
        expect(staff!.tohit.total).toEqual([8, 3]);
        expect(staff!.damage.total).toBe("1d6 + 3");
        expect(staff!.twoweapon).toEqual({ total: [6, 1], thrown: null, damage: "1d6 + 2" });
        expect(staff!.offend).toEqual({ total: [6, 1], damage: "1d6 + 1" });
      });

      test("count a one-handed off-hand weapon as light with a feat with FEAT_OVERSIZED_TWO_WEAPON_FIGHTING", async () => {
        // The ranger's Two-Weapon Fighting made to say it's Oversized Two-Weapon Fighting: a battleaxe off hand, -2 / -2
        const { featMap, rulesetId } = await getSeedCtx();
        await Properties.create(db, {
          entityId: featMap["Two-Weapon Fighting"],
          entityType: "feats",
          type: FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
          value: "true",
        });
        invalidateSeededRuleset(rulesetId);
        const set = weaponSet(
          await buildRanger([
            { item: "Longsword", location: "Main Hand", weaponSet: 0 },
            { item: "Battleaxe", location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect([set.mainhand!.twoweapon!.total, set.offhand!.twoweapon!.total]).toEqual([
          [6, 1],
          [6, 1],
        ]);
      });

      test("count a sling as a one-handed weapon, not a light one", async () => {
        const { mainhand } = weaponSet(
          await buildCarrying("Bjorn Ironhand", [{ item: "Sling", location: "Main Hand", weaponSet: 0 }]),
        );
        expect(mainhand).toMatchObject({ name: "Sling", light: false });
      });

      test("hold the same weapon in each hand, its enhancement once on each", async () => {
        // An elf rogue with an Assassin's Dagger (+2) in each hand: two entries of one item
        const { mainhand, offhand } = weaponSet(
          await buildCarrying("Lyra Shadowstep", [
            { item: "Assassin's Dagger", location: "Main Hand", weaponSet: 0 },
            { item: "Assassin's Dagger", location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect([mainhand?.tohit.magic, offhand?.tohit.magic]).toEqual([2, 2]);
        expect([mainhand?.twoweapon, offhand?.twoweapon].every(Boolean)).toBe(true);
      });

      test("leave a weapon alone without one in the other hand, an unarmed strike not counting", async () => {
        const lyra = await buildCarrying("Lyra Shadowstep", [
          { item: "Dagger", location: "Off Hand", weaponSet: 0 },
          { item: "Shortsword", location: "Main Hand", weaponSet: 1 },
        ]);
        expect(weaponSet(lyra)).toMatchObject({
          mainhand: { name: "Unarmed Strike", twoweapon: null },
          offhand: { name: "Dagger", twoweapon: null },
        });
        expect(weaponSet(lyra, "1").mainhand).toMatchObject({ name: "Shortsword", twoweapon: null });
      });
    });

    describe("the gear", () => {
      test("costs every attack the check penalty of armor and shields worn without proficiency", async () => {
        const dagger: Carried = { item: "Dagger", location: "Main Hand", weaponSet: 0 };
        const plateAndShield: Carried[] = [
          { item: "Full Plate", location: "Torso" },
          { item: "Heavy Steel Shield", location: "Off Hand", weaponSet: 0 },
        ];
        const attacks = async (name: string, carried: Carried[]) => {
          const { tohit, thrown } = weaponSet(await buildCarrying(name, [dagger, ...carried])).mainhand!;
          return { gearpenalty: tohit.gearpenalty, total: tohit.total, thrown: thrown!.total };
        };
        // A wizard, proficient with neither: full plate costs 6, a heavy steel shield 2, her thrown dagger as well
        const bare = await attacks("Elara Starweaver", []);
        expect(await attacks("Elara Starweaver", plateAndShield)).toEqual({
          gearpenalty: -8,
          total: bare.total.map((attack) => attack - 8),
          thrown: bare.thrown.map((attack) => attack - 8),
        });
        // A fighter, proficient with both: nothing
        expect((await attacks("Bjorn Ironhand", plateAndShield)).gearpenalty).toBe(0);
      });

      test("costs every attack 2 with a tower shield, and its check penalty without proficiency", async () => {
        const gear = async (name: string) =>
          weaponSet(
            await buildCarrying(name, [
              { item: "Dagger", location: "Main Hand", weaponSet: 0 },
              { item: "Tower Shield", location: "Off Hand", weaponSet: 1 },
            ]),
          ).mainhand!.tohit.gearpenalty;
        // A fighter, proficient with it; a wizard, who isn't, takes its 10 as well
        expect([await gear("Bjorn Ironhand"), await gear("Elara Starweaver")]).toEqual([-2, -12]);
      });

      test("costs a crossbow in one hand 2 when light, 4 when heavy, and a hand crossbow nothing", async () => {
        const SLOTS = { "Main Hand": "mainhand", "Off Hand": "offhand", "Two Handed": "twohanded" } as const;
        const gear = async (item: string, location: keyof typeof SLOTS) =>
          weaponSet(await buildCarrying("Bjorn Ironhand", [{ item, location, weaponSet: 0 }]))[SLOTS[location]]!.tohit
            .gearpenalty;
        expect([
          await gear("Light Crossbow", "Main Hand"),
          await gear("Heavy Crossbow", "Off Hand"),
          await gear("Heavy Crossbow", "Two Handed"),
          await gear("Hand Crossbow", "Main Hand"),
        ]).toEqual([-2, -4, 0, 0]);
      });
    });

    test("take a specific weapon's enhancement bonus, a masterwork one's on attack rolls only", async () => {
      const held = async (item: string) =>
        weaponSet(await buildCarrying("Bjorn Ironhand", [{ item, location: "Main Hand", weaponSet: 0 }])).mainhand!;
      expect(await held("Holy Avenger")).toMatchObject({ tohit: { magic: 2 }, damage: { magic: 2 } });
      expect(await held("Masterwork Cold Iron Longsword")).toMatchObject({ tohit: { magic: 1 }, damage: { magic: 0 } });
    });

    test("give a halfling +1 with a sling and a thrown weapon, a dagger's thrown attack too, not a bow", async () => {
      const halfling = await asHalfling("Bjorn Ironhand");
      await carry(halfling, [
        { item: "Sling", location: "Main Hand", weaponSet: 0 },
        { item: "Dagger", location: "Main Hand", weaponSet: 1 },
        { item: "Shortbow", location: "Two Handed", weaponSet: 2 },
      ]);
      const detailed = await build(halfling);
      const { bab, throwing } = detailed.components.combat.getCombat();
      expect(throwing.tohit).toBe(1);
      expect(detailed.areRequirementsMet(requiring("combat.throwing.tohit", exactly(1)))).toBe(true);
      /** A weapon's first attack without the bonus: its base attack and its parts. */
      const without = ({ tohit }: WeaponSlot) =>
        bab + tohit.strength + tohit.magic + tohit.misc + tohit.size + tohit.gearpenalty;
      const sling = weaponSet(detailed).mainhand!;
      const bow = weaponSet(detailed, "2").twohanded!;
      expect([sling.tohit.total[0] - without(sling), bow.tohit.total[0] - without(bow)]).toEqual([1, 0]);
      // The dagger's melee attack doesn't take it; its thrown one does
      const dagger = weaponSet(detailed, "1").mainhand!;
      const { tohit, thrown } = dagger;
      expect(tohit.total[0]).toBe(without(dagger));
      expect(thrown!.total[0]).toBe(
        bab + thrown!.dexterity + tohit.magic + tohit.misc + tohit.size + tohit.gearpenalty + 1,
      );
    });

    describe("proficiency", () => {
      test("counts a bastard sword or a dwarven waraxe as martial in two hands, and a dwarf's waraxe in one", async () => {
        // A human fighter, proficient with martial weapons
        for (const weapon of ["Bastard Sword", "Dwarven Waraxe"]) {
          expect([
            await proficientWith("Bjorn Ironhand", weapon, "Main Hand"),
            await proficientWith("Bjorn Ironhand", weapon, "Two Handed"),
          ]).toEqual([false, true]);
        }
        // A dwarf fighter: his waraxe in one hand too, and his urgrosh. A wizard has no martial weapon to count it as
        expect(await proficientWith("Kael Stormborn", "Dwarven Waraxe", "Main Hand")).toBe(true);
        expect(await proficientWith("Kael Stormborn", "Dwarven Urgrosh", "Two Handed")).toBe(true);
        expect(await proficientWith("Elara Starweaver", "Bastard Sword", "Two Handed")).toBe(false);
      });

      test("judges each place an item is held by its own hands: a bastard sword in one hand, and in two", async () => {
        const detailed = await buildCarrying("Bjorn Ironhand", [
          { item: "Bastard Sword", location: "Main Hand", weaponSet: 0 },
          { item: "Bastard Sword", location: "Two Handed", weaponSet: 1 },
        ]);
        const oneHanded = weaponSet(detailed).mainhand!;
        const twoHanded = weaponSet(detailed, "1").twohanded!;
        expect([oneHanded.proficient, twoHanded.proficient]).toEqual([false, true]);
        expect(oneHanded.tohit.misc - twoHanded.tohit.misc).toBe(-4);
      });

      test("reads the hand holding a weapon in its own modifiers' requirements too", async () => {
        // A battleaxe whose +1 to hit is only for the main hand
        const { itemMap, rulesetId } = await getSeedCtx();
        const sword = await createTestItem({
          name: "Main-Hand Axe",
          type: "Weapon",
          slot: "Main Hand",
          sourceItemId: itemMap["Battleaxe"],
        });
        const [bonus] = await Modifiers.create(db, {
          sourceId: sword.id,
          sourceType: "items",
          target: "weapon.tohit.misc",
          value: "1",
          valueType: "number",
          operator: "add",
        });
        await Requirements.create(db, {
          entityId: bonus.id,
          entityType: "modifiers",
          level: "1",
          target: "weapon.wielded",
          operator: "equal",
          value: "mainhand",
          valueType: "string",
        });
        invalidateSeededRuleset(rulesetId);
        const misc = async (location: "Main Hand" | "Off Hand") => {
          const set = weaponSet(await buildCarrying("Bjorn Ironhand", [{ item: sword.id, location, weaponSet: 0 }]));
          return (location === "Main Hand" ? set.mainhand : set.offhand)!.tohit.misc;
        };
        expect([await misc("Main Hand"), await misc("Off Hand")]).toEqual([1, 0]);
        // One in each hand: the main-hand one alone
        const both = weaponSet(
          await buildCarrying("Bjorn Ironhand", [
            { item: sword.id, location: "Main Hand", weaponSet: 0 },
            { item: sword.id, location: "Off Hand", weaponSet: 0 },
          ]),
        );
        expect([both.mainhand!.tohit.misc, both.offhand!.tohit.misc]).toEqual([1, 0]);
      });

      test("gives an elf the longsword, the rapier and the bows", async () => {
        // An elf wizard, whose class gives her none of them
        expect([
          await proficientWith("Elara Starweaver", "Longsword", "Main Hand"),
          await proficientWith("Elara Starweaver", "Rapier", "Main Hand"),
          await proficientWith("Elara Starweaver", "Composite Longbow", "Two Handed"),
          await proficientWith("Elara Starweaver", "Shortbow", "Two Handed"),
        ]).toEqual([true, true, true, true]);
      });

      test("costs a weapon the character isn't proficient with 4 to hit", async () => {
        // Weapon Focus: Longsword gives +1.
        expect(weaponSet(await buildSeeded("Bjorn Ironhand")).mainhand).toMatchObject({
          name: "Longsword",
          proficient: true,
          tohit: { misc: 1 },
          itemId: expect.any(String),
        });
        expect(weaponSet(await buildSeeded("Vex Flamecaller")).mainhand).toMatchObject({
          name: "Dagger",
          proficient: true,
          tohit: { misc: 0 },
        });
        // A wizard with a battleaxe, not an elf's weapon: BAB 1, STR 8.
        expect(
          weaponSet(
            await buildCarrying("Elara Starweaver", [{ item: "Battleaxe", location: "Main Hand", weaponSet: 0 }]),
          ).mainhand,
        ).toMatchObject({
          name: "Battleaxe",
          proficient: false,
          tohit: { strength: -1, misc: -4, total: [-4] },
        });
      });

      test("costs a weapon made from a template when the character isn't proficient with its template", async () => {
        const battleaxe: Carried[] = [{ item: "Adamantine Battleaxe", location: "Main Hand", weaponSet: 0 }];
        expect(weaponSet(await buildCarrying("Elara Starweaver", battleaxe)).mainhand).toMatchObject({
          name: "Adamantine Battleaxe",
          proficient: false,
          tohit: { misc: -4 },
        });
        expect(weaponSet(await buildCarrying("Bjorn Ironhand", battleaxe)).mainhand).toMatchObject({
          name: "Adamantine Battleaxe",
          proficient: true,
        });
      });

      test("doesn't cost a weapon made from a template its own modifiers", async () => {
        // A luck blade is a shortsword, which a wizard isn't proficient with: her saves still take its +1 luck.
        const elara = await buildCarrying("Elara Starweaver", [
          { item: "Luck Blade, 0 Wishes", location: "Main Hand", weaponSet: 0 },
        ]);
        expect(weaponSet(elara).mainhand).toMatchObject({ proficient: false, tohit: { misc: -4 } });
        const will = (character: DetailedCharacter) => character.components.saves.getSaves().will;
        expect(will(elara).misc).toBe(will(await buildCarrying("Elara Starweaver")).misc + 1);
      });

      test("costs a base weapon the character isn't proficient with 4 to hit, and nothing else", async () => {
        const blade = await requiringWithBonus(
          await createTestItem(
            { name: "Base Blade", type: "Weapon", slot: "Main Hand", isTemplate: true },
            { [WEAPON_PROFICIENCY]: "Martial", [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_TYPE]: "Longsword" },
          ),
          "feats.martialweaponproficiency.possessed",
        );
        // A wizard keeps its +2: -4 + 2
        expect(
          weaponSet(await buildCarrying("Elara Starweaver", [{ item: blade.id, location: "Main Hand", weaponSet: 0 }]))
            .mainhand,
        ).toMatchObject({ name: "Base Blade", proficient: false, tohit: { misc: -2 } });
      });

      test("counts a base weapon whose proficiency names nothing as one the character isn't proficient with", async () => {
        const blade = await requiringWithBonus(
          await createTestItem(
            { name: "Lost Blade", type: "Weapon", slot: "Main Hand", isTemplate: true },
            { [WEAPON_PROFICIENCY]: "Martial", [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_TYPE]: "Longsword" },
          ),
          "feats.nosuchproficiency.possessed",
        );
        expect(
          weaponSet(await buildCarrying("Bjorn Ironhand", [{ item: blade.id, location: "Main Hand", weaponSet: 0 }]))
            .mainhand,
        ).toMatchObject({ name: "Lost Blade", proficient: false });
      });

      test("never costs a plain weapon, neither a template nor made from one: its requirements are its own", async () => {
        const blade = await requiringWithBonus(
          await createTestItem(
            { name: "Plain Blade", type: "Weapon", slot: "Main Hand" },
            { [WEAPON_PROFICIENCY]: "Martial", [WEAPON_BASE_DAMAGE]: "1d8", [WEAPON_TYPE]: "Longsword" },
          ),
          "feats.martialweaponproficiency.possessed",
        );
        // A wizard: no -4, and its +2 off
        expect(
          weaponSet(await buildCarrying("Elara Starweaver", [{ item: blade.id, location: "Main Hand", weaponSet: 0 }]))
            .mainhand,
        ).toMatchObject({ name: "Plain Blade", proficient: true, tohit: { misc: 0 } });
      });

      test("costs a weapon nothing for another requirement unmet, which turns its own bonuses off", async () => {
        const { itemMap } = await getSeedCtx();
        const blade = await requiringWithBonus(
          await createTestItem({
            name: "Giant's Blade",
            type: "Weapon",
            slot: "Main Hand",
            sourceItemId: itemMap["Longsword"],
          }),
          "abilities.strength.total",
          { operator: "greater_than_or_equal", value: "30", valueType: "number" },
        );
        // Bjorn, proficient with longswords, has Weapon Focus: Longsword (+1) and STR 18
        expect(
          weaponSet(await buildCarrying("Bjorn Ironhand", [{ item: blade.id, location: "Main Hand", weaponSet: 0 }]))
            .mainhand,
        ).toMatchObject({ name: "Giant's Blade", proficient: true, tohit: { misc: 1 } });
      });

      test("never costs a monk her gauntlet, a strike with it being unarmed, but costs her a spiked one", async () => {
        const holding = async (item: string) =>
          weaponSet(await buildCarrying("Zen Whitepetal", [{ item, location: "Main Hand", weaponSet: 0 }])).mainhand;
        expect(await holding("Gauntlet")).toMatchObject({ name: "Gauntlet", proficient: true, tohit: { misc: 0 } });
        expect(await holding("Spiked Gauntlet")).toMatchObject({ name: "Spiked Gauntlet", proficient: false });
        // A wizard isn't proficient with her unarmed strike either.
        expect(
          weaponSet(
            await buildCarrying("Elara Starweaver", [{ item: "Gauntlet", location: "Main Hand", weaponSet: 0 }]),
          ).mainhand,
        ).toMatchObject({ name: "Gauntlet", proficient: false });
      });

      test("never costs an unarmed strike", async () => {
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand).toMatchObject({
          name: "Unarmed Strike",
          itemId: null,
          proficient: true,
          tohit: { misc: 0 },
        });
      });
    });

    describe("unarmed", () => {
      test("attack once below BAB 6", async () => {
        // BAB 5 + STR 4.
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand).toMatchObject({
          name: "Unarmed Strike",
          tohit: { total: [9] },
        });
      });

      test("strike harder with monk levels, gauntlets included but not spiked ones or other weapons", async () => {
        expect(weaponSet(await buildCarrying("Bjorn Ironhand")).mainhand!.damage.base).toBe("1d3");
        // Monk 3.
        expect(weaponSet(await buildCarrying("Zen Whitepetal")).mainhand).toMatchObject({
          name: "Unarmed Strike",
          damage: { base: "1d6" },
        });
        expect(
          weaponSet(
            await buildCarrying("Zen Whitepetal", [{ item: "Gauntlet", location: "Main Hand", weaponSet: 1 }]),
            "1",
          ).mainhand,
        ).toMatchObject({ name: "Gauntlet", damage: { base: "1d6" } });
        expect(
          weaponSet(
            await buildCarrying("Zen Whitepetal", [{ item: "Spiked Gauntlet", location: "Main Hand", weaponSet: 0 }]),
          ).mainhand,
        ).toMatchObject({ name: "Spiked Gauntlet", damage: { base: "1d4" } });
        expect(
          weaponSet(await buildCarrying("Zen Whitepetal", [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }]))
            .mainhand,
        ).toMatchObject({ name: "Longsword", damage: { base: "1d8" } });
      });
    });

    test("step a small character's damage dice down", async () => {
      const smallFighter = await asHalfling("Bjorn Ironhand");
      await carry(smallFighter, []);
      expect(weaponSet(await build(smallFighter)).mainhand!.damage.base).toBe("1d2");
      await carry(smallFighter, [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }]);
      expect(weaponSet(await build(smallFighter)).mainhand).toMatchObject({
        name: "Longsword",
        damage: { base: "1d6" },
      });

      // A monk 3's 1d6 steps down to 1d4.
      const smallMonk = await asHalfling("Zen Whitepetal");
      await carry(smallMonk, []);
      expect(weaponSet(await build(smallMonk)).mainhand).toMatchObject({
        name: "Unarmed Strike",
        damage: { base: "1d4" },
      });
    });

    describe("with Uncanny Blow", () => {
      // The stunt needs the weapon in two hands or Power Attack, which Bjorn has.
      test.each(["Main Hand", "Two Handed"] as const)(
        "doubles strength to damage with an exotic weapon held %s",
        async (location) => {
          const exotic = Object.values((await setupUncannyBlow(location)).components.weapons.getWeapons()["exotic"]);
          // STR 18: +4 doubled.
          expect(exotic).toHaveLength(1);
          expect(exotic[0].damage).toMatchObject({ strmultiplier: 2, strength: 8 });
        },
      );
    });
  });

  describe("item groups", () => {
    test("reach an armor by its type, and nothing by its item's name", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Elven Chain", location: "Torso" }]);
      const targetPaths = new Dnd35TargetPaths();
      const errorsOf = (path: string) => targetPaths.traversePathInit(path, bjorn.components).map((r) => r.error);
      expect(errorsOf("items.armors.chainmail.ac.misc")).toEqual([null]);
      expect(errorsOf("items.armors.elvenchain.ac.misc")).toEqual([]);
    });

    test("leave an empty hand's unarmed strike to its own group when what it holds fills no slot (an arrow)", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Slaying Arrow", location: "Main Hand", weaponSet: 0 },
      ]);
      const targetPaths = new Dnd35TargetPaths();
      const read = (path: string) => targetPaths.traversePathInit(path, bjorn.components);
      expect(read("items.weapons.slayingarrow.damage")).toEqual([]);
      expect(read("items.weapons.unarmedstrike.damage").map((r) => r.error)).toEqual([null]);
    });
  });

  describe("armor class", () => {
    test("keeps a dodge bonus in touch AC and loses it flat-footed, with the Dexterity bonus", async () => {
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const ac = async () => {
        const { total, touch, flatfooted, dexterity } = (await build(bjorn)).components.combat.getCombat().ac;
        return { total, touch, flatfooted, dexterity };
      };
      const before = await ac();
      await Modifiers.create(db, {
        sourceId: bjorn.raceId,
        sourceType: "races",
        target: "combat.ac.dodge",
        operator: "add",
        value: "2",
        valueType: "number",
      });
      invalidateSeededRuleset((await getSeedCtx()).rulesetId);
      expect(await ac()).toEqual({
        ...before,
        total: before.total + 2,
        touch: before.touch + 2,
        flatfooted: before.total - before.dexterity,
      });
    });

    test("gives a duelist its Intelligence bonus as a dodge bonus, up to its duelist level, and never a penalty", async () => {
      const ctx = await getSeedCtx();
      const fork = await forkWith(DND35_DMG_NAME);
      const duelist = (await Klasses.findOne(db, {
        name: "Duelist",
        rulesetId: (await findSeededRuleset(DND35_DMG_NAME)).id,
      }))!;
      const dodgeAt = async (intelligence: number, duelistLevels: number) => {
        const characterId = await seedHuman(
          `Duelist ${intelligence} ${duelistLevels}`,
          { ...WIZARD_SCORES, Intelligence: intelligence },
          { rulesetId: fork.id },
        );
        await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        for (let level = 1; level <= duelistLevels; level++)
          await addCharacterLevel(characterId, (await findKlassLevel(duelist.id, level))!.id);

        return (await build((await Characters.findOne(db, { id: characterId }))!)).components.combat.getCombat().ac
          .dodge;
      };
      // Intelligence 16 (+3): +1 at the first duelist level, +2 at the second; Intelligence 8 (−1): nothing
      expect([await dodgeAt(16, 1), await dodgeAt(16, 2), await dodgeAt(8, 2)]).toEqual([1, 2, 0]);
    });

    test("keeps the Dexterity bonus flat-footed with uncanny dodge: a barbarian 2's, not a barbarian 1's", async () => {
      const acOf = async (name: string) => (await buildSeeded(name)).components.combat.getCombat().ac;
      // Grak is a barbarian 3; Kael a barbarian 1 and fighter 3
      const grak = await acOf("Grak Thunderfist");
      expect(grak).toMatchObject({ uncannydodge: true, flatfooted: grak.total });
      const kael = await acOf("Kael Stormborn");
      expect(kael.dexterity).toBeGreaterThan(0);
      expect(kael).toMatchObject({ uncannydodge: false, flatfooted: kael.total - kael.dexterity });
    });

    test("adds armor, capping dexterity at its limit, and shows its penalties", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Chain Mail", location: "Torso" }]);
      expect(bjorn.components.armors.getArmors()["chainmail"]).toMatchObject({
        name: "Chain Mail",
        ac: { bonus: 5, total: 5 },
        checkpenalty: -5,
        spellfailure: 30,
        maxdex: 2,
      });
      // DEX 14 (+2), within Chain Mail's 2.
      expect(bjorn.components.combat.getCombat().ac).toMatchObject({ armor: 5, dexterity: 2, total: 17 });
    });

    test("takes a specific armor's own stats: its enhancement, its material's, and its category", async () => {
      // An elf rogue: DEX 20 (+5)
      const wearing = async (item: string) => {
        const lyra = await buildCarrying("Lyra Shadowstep", [{ item, location: "Torso" }]);
        const [armor] = Object.values(lyra.components.armors.getArmors());
        return { armor, combat: lyra.components.combat.getCombat() };
      };
      // Elven chain: light chainmail, +4 Dexterity at most
      const elven = await wearing("Elven Chain");
      expect(elven.armor).toMatchObject({ ac: { total: 5 }, checkpenalty: -2, spellfailure: 20, maxdex: 4 });
      expect(elven.combat).toMatchObject({ armor: { category: "light" }, ac: { armor: 5, dexterity: 4 } });
      // Celestial armor: +3 chainmail made as elven chain is, +8 Dexterity at most
      const celestial = await wearing("Celestial Armor");
      expect(celestial.armor).toMatchObject({ checkpenalty: -2, spellfailure: 15, maxdex: 8 });
      expect(celestial.combat).toMatchObject({ armor: { category: "light" }, ac: { armor: 8, dexterity: 5 } });
      // Banded mail of luck: +3 banded mail, masterwork as magic armor is (-6 lessened by 1)
      const banded = await wearing("Banded Mail of Luck");
      expect([banded.armor.checkpenalty, banded.combat.ac.armor]).toEqual([-5, 9]);
      // Mithral full plate: medium armor
      expect((await wearing("Mithral Full Plate of Speed")).combat.armor.category).toBe("medium");
    });

    test("adds a shield, dexterity uncapped", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Heavy Steel Shield", location: "Off Hand" }]);
      expect(bjorn.components.shields.getShields()["heavysteelshield"]).toMatchObject({
        name: "Heavy Steel Shield",
        ac: { bonus: 2, total: 2 },
        checkpenalty: -2,
        spellfailure: 15,
      });
      expect(bjorn.components.combat.getCombat().ac).toMatchObject({ shield: 2, dexterity: 2, total: 14 });
    });

    test("adds armor and shield together, a weapon in hand", async () => {
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: "Longsword", location: "Main Hand", weaponSet: 0 },
        { item: "Chain Mail", location: "Torso" },
        { item: "Light Wooden Shield", location: "Off Hand" },
      ]);
      expect(weaponSet(bjorn).mainhand!.name).toBe("Longsword");
      expect(bjorn.components.armors.getArmors()["chainmail"].ac.bonus).toBe(5);
      expect(bjorn.components.shields.getShields()["lightwoodenshield"].ac.bonus).toBe(1);
      expect(bjorn.components.combat.getCombat().ac).toMatchObject({
        base: 10,
        armor: 5,
        shield: 1,
        dexterity: 2,
        total: 18,
      });
    });

    test("reads the armor properties of an item made from a template", async () => {
      const { itemMap } = await getSeedCtx();
      const derived = await createTestItem({
        name: "Full Plate +1",
        type: "Armor",
        slot: "Torso",
        sourceItemId: itemMap["Full Plate"],
      });
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: derived.id, location: "Torso" }]);
      // By its template's type, which it inherits: an item is never reached by its name
      expect(bjorn.components.armors.getArmors()["fullplate"]).toMatchObject({
        name: "Full Plate +1",
        ac: { bonus: 8 },
        maxdex: 1,
        checkpenalty: -6,
        spellfailure: 35,
      });
      expect(bjorn.components.combat.getCombat().ac).toMatchObject({ armor: 8, dexterity: 1, total: 19 });
    });

    test("lowers a masterwork armor or shield's check penalty by 1", async () => {
      const armor = await createTestItem(
        { name: "Chain Mail (Masterwork)", type: "Armor", slot: "Torso" },
        {
          [ARMOR_PROFICIENCY]: "Heavy",
          [ARMOR_TYPE]: "Chain Mail",
          [ARMOR_AC_BONUS]: "5",
          [ARMOR_CHECK_PENALTY]: "-5",
          [ITEM_SPELL_FAILURE]: "30",
          [ARMOR_MAX_DEX]: "2",
          [ITEM_MASTERWORK]: "true",
        },
      );
      const shield = await createTestItem(
        { name: "Heavy Steel Shield (Masterwork)", type: "Shield", slot: "Off Hand" },
        {
          [SHIELD_PROFICIENCY]: "Heavy",
          [SHIELD_TYPE]: "Heavy Steel Shield",
          [SHIELD_AC_BONUS]: "2",
          [ARMOR_CHECK_PENALTY]: "-2",
          [ITEM_SPELL_FAILURE]: "15",
          [ITEM_MASTERWORK]: "true",
        },
      );
      const bjorn = await buildCarrying("Bjorn Ironhand", [
        { item: armor.id, location: "Torso" },
        { item: shield.id, location: "Off Hand" },
      ]);
      expect(bjorn.components.armors.getArmors()["chainmail"]).toMatchObject({
        checkpenalty: -4,
        ac: { bonus: 5 },
        spellfailure: 30,
        maxdex: 2,
      });
      expect(bjorn.components.shields.getShields()["heavysteelshield"]).toMatchObject({
        checkpenalty: -1,
        ac: { bonus: 2 },
        spellfailure: 15,
      });
    });

    test("adds a monk's wisdom when unarmored, through a template modifier its requirements gate", async () => {
      // Monk 3: DEX 16 (+3), WIS 16 (+3).
      const zen = await buildSeeded("Zen Whitepetal");
      expect(zen.components.combat.getCombat().ac).toMatchObject({
        base: 10,
        dexterity: 3,
        armor: 0,
        shield: 0,
        misc: 3,
        total: 16,
      });
      const acBonus = zen.modifierEvaluator
        .getModifiers()
        .appliedModifiers.find(
          (m) => m.value === "{{ max(0, [abilities.wisdom.modifier]) }}" && m.target === "combat.ac.misc",
        );
      expect(acBonus).toBeDefined();
      // Its requirements: no armor, no shield, a light load.
      const gates = zen.requirementEvaluator
        .getRequirements()
        .fulfilledRequirementGroups.filter((group) =>
          group.some((r) => r.entityId === acBonus!.id && r.entityType === "modifiers"),
        );
      expect(gates.length).toBeGreaterThan(0);
    });
  });

  describe("speed", () => {
    test.each([
      ["Breastplate", 20],
      ["Full Plate", 20],
      ["Leather Armor", 30],
    ])("under %s is %i feet", async (armor, speed) => {
      const combat = (
        await buildCarrying("Bjorn Ironhand", [{ item: armor, location: "Torso" }])
      ).components.combat.getCombat();
      expect(combat.speed).toMatchObject({ base: 30, total: speed });
    });

    test("of a dwarf stays 20 feet in medium or heavy armor, by the race's property", async () => {
      // A dwarf barbarian in scale mail: fast movement's +10 on the base, which medium armor allows
      const speed = async () => (await buildSeeded("Kael Stormborn")).components.combat.getCombat().speed;
      expect(await speed()).toMatchObject({ base: 30, misc: 0, total: 30 });

      const { raceMap, rulesetId } = await getSeedCtx();
      await Properties.delete(db, {
        entityIds: [raceMap.pc["Dwarf"]],
        entityType: "races",
        types: [RACE_SPEED_IGNORES_ENCUMBRANCE],
      });
      invalidateSeededRuleset(rulesetId);
      // Without the property, the armor slows it as anyone's, fast movement first: 30 feet become 20 (the SRD's
      // halfling barbarian)
      expect((await speed()).total).toBe(20);
    });

    test.each([
      // A barbarian 3: fast movement in medium armor, before it slows him; none in heavy armor
      ["Grak Thunderfist", [], 40],
      ["Grak Thunderfist", ["Breastplate"], 30],
      ["Grak Thunderfist", ["Full Plate"], 20],
      // A monk 3: in no armor only
      ["Zen Whitepetal", [], 40],
      ["Zen Whitepetal", ["Leather Armor"], 30],
    ] as const)("of %s wearing %j is %i feet: fast movement by its armor", async (name, armors, speed) => {
      const carried = armors.map((item) => ({ item, location: "Torso" as const }));
      expect((await buildCarrying(name, carried)).components.combat.getCombat().speed.total).toBe(speed);
    });

    test("and AC of a prestige class follow its table: a sacred fist's, a dwarven defender's", async () => {
      const ctx = await getSeedCtx();
      /** A fighter 1 with `levels` of the class from `book`, unarmored: its speed and AC parts. */
      const sheetWith = async (book: string, className: string, levels: number) => {
        const fork = await forkWith(book);
        const characterId = await seedHuman(`${className} ${levels}`, WIZARD_SCORES, { rulesetId: fork.id });
        await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        const klass = (await Klasses.findOne(db, {
          name: className,
          rulesetId: (await findSeededRuleset(book)).id,
        }))!;
        for (let level = 1; level <= levels; level++)
          await addCharacterLevel(characterId, (await findKlassLevel(klass.id, level))!.id);

        const { speed, ac } = (
          await build((await Characters.findOne(db, { id: characterId }))!)
        ).components.combat.getCombat();
        return { speed: speed.total, misc: ac.misc, dodge: ac.dodge };
      };
      // Sacred fist 6: +20 feet, +2 AC; dwarven defender 4: +2 dodge
      expect(await sheetWith(DND35_COMPLETE_DIVINE_NAME, "Sacred Fist", 6)).toEqual({ speed: 50, misc: 2, dodge: 0 });
      expect(await sheetWith(DND35_DMG_NAME, "Dwarven Defender", 4)).toEqual({ speed: 30, misc: 0, dodge: 2 });
    });

    test("of a monk loses fast movement under a medium load, and her AC bonus with it", async () => {
      const zen = await findSeededCharacter("Zen Whitepetal");
      const sheet = async () => {
        const { speed, ac, encumbrance } = (await build(zen)).components.combat.getCombat();
        return { load: encumbrance.load, speed: speed.total, misc: ac.misc };
      };
      const light = await sheet();
      expect(light).toMatchObject({ load: "light", speed: 40 });
      expect(light.misc).toBeGreaterThan(0);
      // Heavy enough for a medium load: no fast movement (a medium load slows 30 feet to 20), no Wisdom to AC
      await Modifiers.create(db, {
        sourceId: zen.raceId,
        sourceType: "races",
        target: "combat.encumbrance.carriedweight",
        operator: "add",
        value: String(Math.ceil((await build(zen)).components.combat.getCombat().encumbrance.lightload + 1)),
        valueType: "number",
      });
      invalidateSeededRuleset((await getSeedCtx()).rulesetId);
      expect(await sheet()).toEqual({ load: "medium", speed: 20, misc: 0 });
    });
  });

  describe("modifiers", () => {
    test("leave a spell level all known after an add, a later round's included", async () => {
      // A cleric's 1st-level spells are all known (her first level's set -1); a gated add applies in a later round
      await raceModifier("Theron Lightbringer", { target: "aptitudes.clericspells.1.allowed", value: "1" }, [
        { target: "identity.meta.level", operator: "greater_than_or_equal", value: "1", valueType: "number" },
      ]);
      expect(spellLevel(await buildSeeded("Theron Lightbringer"), "clericspells", 1).allowed).toBe(ALLOWED_ALL);
    });

    test("skip a part the sheet computes, and say why: it would be overwritten, or read stale", async () => {
      const modifier = await raceModifier("Bjorn Ironhand", { target: "skills.climb.total", value: "5" });
      const bjorn = await buildSeeded("Bjorn Ironhand");
      expect(bjorn.modifierEvaluator.getModifiers().skippedModifiers).toContainEqual({
        modifier: expect.objectContaining({ id: modifier.id }),
        warning: "Target skills.climb.total is computed from the sheet: a modifier can't change it",
      });
    });

    test("keep a bonus to the armor's AC beside the armor's own, whichever applies first", async () => {
      // Chain mail (+5), its item +1 (a magic armor), and bracers' +2 on the armor bonus
      const { itemMap, rulesetId } = await getSeedCtx();
      await Modifiers.create(db, {
        sourceId: itemMap["Chain Mail"],
        sourceType: "items",
        target: "items.armors.chainmail.ac.misc",
        operator: "add",
        value: "1",
        valueType: "number",
      });
      invalidateSeededRuleset(rulesetId);
      await raceModifier("Bjorn Ironhand", { target: "combat.ac.armor", value: "2" });
      const bjorn = await buildCarrying("Bjorn Ironhand", [{ item: "Chain Mail", location: "Torso" }]);
      expect(bjorn.components.combat.getCombat().ac.armor).toBe(8);
    });

    test("gated by a requirement, read the sheet the other modifiers have changed", async () => {
      // +5 initiative while Strength is 20 or more: Bjorn's 18, 20 with the belt
      await raceModifier("Bjorn Ironhand", { target: "combat.initiative.misc", value: "5" }, [
        { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "20", valueType: "number" },
      ]);
      const initiative = async (carried: Carried[]) =>
        (await buildCarrying("Bjorn Ironhand", carried)).components.combat.getCombat().initiative.misc;
      const belt = { item: (await createAbilityItem("strength", 2, "Waist")).id, location: "Waist" as const };
      expect([await initiative([]), await initiative([belt])]).toEqual([0, 5]);
    });

    test("report a gated modifier whose requirement a modifier applied after it broke, which stays applied", async () => {
      // +5 hit points while Strength is 18 or more (Bjorn's 18); then, once those hit points are in, Strength −4
      const hp = await raceModifier("Bjorn Ironhand", { target: "combat.hp.misc", value: "5" }, [
        { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "18", valueType: "number" },
      ]);
      await raceModifier("Bjorn Ironhand", { target: "abilities.strength.misc", value: "-4" }, [
        { target: "combat.hp.misc", operator: "greater_than_or_equal", value: "5", valueType: "number" },
      ]);
      const bjorn = await buildSeeded("Bjorn Ironhand");
      expect(bjorn.components.abilities.getAbilities().strength.total).toBe(14);
      expect(bjorn.components.combat.getCombat().hp.misc).toBe(5);
      const race = (await Races.findOne(db, { id: (await findSeededCharacter("Bjorn Ironhand")).raceId }))!.name;
      expect(
        bjorn
          .validate()
          .issues.filter((issue) => issue.category === "modifiers")
          .map((issue) => issue.message),
      ).toEqual([
        `Modifier on ${hp.target} from ${race} (races) applied while its requirement held, which no longer holds on the final sheet`,
      ]);
    });

    test("report a modifier that breaks its own requirement, and not one that never applied", async () => {
      // Strength −4 while Strength is 18 or more: it applies, then its own requirement fails. A computed target
      // gated the same way is skipped, never applied
      const strength = { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "18" };
      const penalty = await raceModifier("Bjorn Ironhand", { target: "abilities.strength.misc", value: "-4" }, [
        { ...strength, valueType: "number" },
      ]);
      await raceModifier("Bjorn Ironhand", { target: "abilities.dexterity.total", value: "1" }, [
        { ...strength, valueType: "number" },
      ]);
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const race = (await Races.findOne(db, { id: (await findSeededCharacter("Bjorn Ironhand")).raceId }))!.name;
      expect(
        bjorn
          .validate()
          .issues.filter((issue) => issue.category === "modifiers" && issue.message.includes("no longer holds"))
          .map((issue) => issue.message),
      ).toEqual([
        `Modifier on ${penalty.target} from ${race} (races) applied while its requirement held, which no longer holds on the final sheet`,
      ]);
    });

    test("raise the spell DCs with the casting ability", async () => {
      // An elf wizard, INT 18: a headband's +2 makes her modifier 5, each DC one higher
      const dcs = async (carried: Carried[]) =>
        Object.values(
          (await buildCarrying("Elara Starweaver", carried)).components.powerGroupings.getPowerGroupings(),
        ).flatMap((group) => Object.values(group).flatMap((byClass) => Object.values(byClass).map((dc) => dc.total)));
      const before = await dcs([]);
      const headband = { item: (await createAbilityItem("intelligence", 2, "Head")).id, location: "Head" as const };
      expect(await dcs([headband])).toEqual(before.map((dc) => dc + 1));
    });

    test("apply a feat's bonus", async () => {
      const toughness = (await buildSeeded("Kael Stormborn")).modifierEvaluator
        .getModifiers()
        .appliedModifiers.find((m) => m.target === "combat.hp.misc");
      expect(toughness).toMatchObject({ operator: "add", value: "3" });
    });

    test("hold a weapon feat's bonus until the weapon is in hand", async () => {
      // Weapon Focus and Weapon Specialization: Longsword.
      const targets = ["items.weapons.longsword.tohit.misc", "items.weapons.longsword.damage.misc"];
      const empty = (await buildCarrying("Bjorn Ironhand")).modifierEvaluator.getModifiers();
      expect(targets.map((target) => empty.inactiveModifiers.find((m) => m.target === target)?.value)).toEqual([
        "1",
        "2",
      ]);

      const armed = (
        await buildCarrying("Bjorn Ironhand", [{ item: "Longsword", location: "Main Hand", weaponSet: 0 }])
      ).modifierEvaluator.getModifiers();
      expect(armed.inactiveModifiers.filter((m) => m.target.includes("longsword"))).toEqual([]);
      expect(targets.every((target) => armed.appliedModifiers.some((m) => m.target === target))).toBe(true);
    });

    test("leave none unapplied or skipped for a valid character", async () => {
      const { unappliedModifiers, skippedModifiers } = (
        await buildSeeded("Bjorn Ironhand")
      ).modifierEvaluator.getModifiers();
      expect(unappliedModifiers.filter((m) => m.target.startsWith("items.weapons.longsword."))).toEqual([]);
      expect(skippedModifiers).toEqual([]);
    });
  });

  describe("requirements", () => {
    test("are all met for valid seeded characters", async () => {
      for (const [name, feats] of [
        ["Bjorn Ironhand", 5],
        ["Kael Stormborn", 3],
      ] as const) {
        const { fulfilledRequirementGroups, unmetRequirementGroups, invalidRequirements } = (
          await buildSeeded(name)
        ).requirementEvaluator.getRequirements();
        expect(fulfilledRequirementGroups.length).toBeGreaterThanOrEqual(feats);
        expect(unmetRequirementGroups).toEqual([]);
        expect(invalidRequirements).toEqual([]);
      }
    });

    test("go unmet when a score drops below a feat's prerequisite", async () => {
      // Power Attack and Cleave need STR 13.
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const { abilityMap } = await getSeedCtx();
      await db
        .update(characterAbilitiesInCharacter)
        .set({ score: 10 })
        .where(
          and(
            eq(characterAbilitiesInCharacter.characterId, bjorn.id),
            eq(characterAbilitiesInCharacter.abilityId, abilityMap["Strength"]),
          ),
        );
      expect((await build(bjorn)).requirementEvaluator.getRequirements().unmetRequirementGroups.length).toBeGreaterThan(
        0,
      );
    });

    test("mark in their tree the conditions unmet, judged as the requirements are", async () => {
      const condition = (level: string, target: string, check: Parameters<typeof requiring>[1]) => ({
        ...requiring(target, check)[0][0],
        level,
      });
      // A value computed from another path, a string operator, and a boolean written false: Bjorn has Dodge
      const tree = (await buildSeeded("Bjorn Ironhand")).formatRequirements([
        condition("1", "classes.fighter.level", {
          operator: "greater_than_or_equal",
          value: "{{ [classes.fighter.level] }}",
          valueType: "number",
        }),
        condition("2", "identity.physiology.name", { operator: "starts_with", value: "Bjorn", valueType: "string" }),
        condition("3", "feats.dodge.possessed", { operator: "equal", value: "false", valueType: "boolean" }),
      ]);
      expect(tree.split("\n")).toEqual([
        "classes.fighter.level >= {{ [classes.fighter.level] }}",
        "identity.physiology.name starts with Bjorn",
        "feats.dodge.possessed = false  [UNMET]",
      ]);
    });
  });

  describe("feats", () => {
    test("count a level's general feats toward General, and report them when the ruleset has none", async () => {
      const ruleset = await createTestRuleset(SEED_USER_ID);
      const [race] = await Races.create(db, {
        name: "Test Race",
        rulesetId: ruleset.id,
        size: "Medium",
        baseSpeed: 30,
      });
      const { klassLevel } = await createTestKlassLevel(ruleset.id);
      const character = await createTestCharacter(SEED_USER_ID, { rulesetId: ruleset.id, raceId: race.id });
      await addCharacterLevel(character.id, klassLevel.id);

      const integrityIssues = (detailed: Detailed) =>
        detailed.validate().issues.filter((i) => i.category === "integrity");
      expect(integrityIssues(await build(character))).toEqual([
        {
          category: "integrity",
          message: "The ruleset has no General aptitude: this character's 1 general feat(s) count toward none",
        },
      ]);

      await Aptitudes.create(db, { name: "General", rulesetId: ruleset.id });
      RulesetViews.invalidate(ruleset.id);
      const withGeneral = await build(character);
      expect(withGeneral.components.aptitudes.getAptitudes().general.allowed).toBe(1);
      expect(integrityIssues(withGeneral)).toEqual([]);
    });

    test("give none by a family's name, which names no feat: the modifier is reported, and the sheet still builds", async () => {
      const ctx = await getSeedCtx();
      const dodge = (await Feats.findOne(db, { name: "Dodge", rulesetId: ctx.rulesetId }))!;
      await Modifiers.create(db, {
        sourceId: dodge.id,
        sourceType: "feats",
        target: "feats.weaponfocus.possessed",
        value: "true",
        valueType: "boolean",
        operator: "set",
      });
      invalidateSeededRuleset(ctx.rulesetId);
      // Bjorn has Dodge
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const issues = bjorn.validate().issues.filter((issue) => issue.category === "modifiers");
      expect(issues.map((issue) => issue.message)).toEqual([
        "Skipped modifier on feats.weaponfocus.possessed from Dodge (feats): Element not found: possessed",
      ]);
    });

    test("don't count a proficiency two classes grant twice", async () => {
      // A barbarian level grants the fighter's proficiency feats again.
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const { klassMap } = await getSeedCtx();
      await addCharacterLevel(bjorn.id, (await findKlassLevel(klassMap.pc["Barbarian"], 1))!.id);
      const detailed = await build(bjorn);

      const general = detailed.components.aptitudes.getAptitudes()["general"];
      expect(general.available).toBeGreaterThanOrEqual(0);
      expect(general.available).toBe(general.allowed - general.spent);
      const nonStacking = Object.values(detailed.components.classes.getCharacterClasses())
        .flatMap((klass) => klass.levels.flatMap((level) => level.feats))
        .filter((f) => !f.stackable)
        .map((f) => f.id);
      expect(new Set(nonStacking).size).toBe(nonStacking.length);
    });

    describe("granted by another feat's modifier", () => {
      test("count as possessed, their own modifiers applying", async () => {
        // War Domain Weapon: Longsword grants Weapon Focus and the martial proficiency.
        const ctx = await getSeedCtx();
        const characterId = await seedHuman(
          "War Domain Test",
          { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
          { xp: 1000 },
        );
        const [fighter] = await addClassLevels(db, ctx, characterId, "Fighter", [1], [10]);
        const [cleric] = await addClassLevels(db, ctx, characterId, "Cleric", [1], [8]);
        await addFeats(
          db,
          ctx,
          [fighter, cleric],
          [
            { levelIndex: 0, featName: "Power Attack", aptitude: "General" },
            { levelIndex: 0, featName: "Great Fortitude", aptitude: "General" },
            { levelIndex: 0, featName: "Improved Initiative", aptitude: "Fighter Bonus Feat" },
            { levelIndex: 1, featName: "War Domain", aptitude: "Cleric Domain" },
            { levelIndex: 1, featName: "Good Domain", aptitude: "Cleric Domain" },
            { levelIndex: 1, featName: "War Domain Weapon: Longsword", aptitude: "War Domain Weapon" },
          ],
        );
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);

        const feats = detailed.components.feats.getFeats() as Record<string, { possessed: boolean }>;
        expect([feats["weaponfocuslongsword"].possessed, feats["martialweaponproficiencylongsword"].possessed]).toEqual(
          [true, true],
        );
        // No longsword in hand: the focus bonus waits.
        expect(
          detailed.modifierEvaluator
            .getModifiers()
            .inactiveModifiers.find((m) => m.target === "items.weapons.longsword.tohit.misc"),
        ).toMatchObject({ value: "1", operator: "add" });
      });

      test("aren't held to their own prerequisites", async () => {
        // A first bard level grants Exotic Weapon Proficiency: Whip, which needs BAB 1; the bard has 0.
        const ctx = await getSeedCtx();
        const characterId = await seedHuman("Whip Bard Test", {
          Strength: 10,
          Dexterity: 14,
          Constitution: 12,
          Intelligence: 12,
          Wisdom: 10,
          Charisma: 16,
        });
        await addFeats(db, ctx, await addClassLevels(db, ctx, characterId, "Bard", [1], [6]), [
          { levelIndex: 0, featName: "Toughness", aptitude: "General" },
        ]);
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);

        expect(
          (detailed.components.feats.getFeats()["exoticweaponproficiencywhip"] as { possessed: boolean }).possessed,
        ).toBe(true);
        expect(
          requirementIssues(detailed).find((issue) => issue.entityName === "Exotic Weapon Proficiency: Whip"),
        ).toBeUndefined();
      });
    });
    test("keep what a class grants once the character's ruleset copies the class", async () => {
      // Editing an inherited class in a fork copies it there (copy-on-write): the character's levels then read the
      // copy's, whose grants a lookup by the levels' stored class levels never reached
      const dmgId = (await findSeededRuleset(DND35_DMG_NAME)).id;
      const fork = await forkWith(DND35_DMG_NAME);
      const characterId = await seedHuman(
        "Archmage Candidate",
        { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 10, Charisma: 10 },
        { rulesetId: fork.id },
      );
      const archmage = (await Klasses.findOne(db, { name: "Archmage", rulesetId: dmgId }))!;
      const highArcana = (await Aptitudes.findOne(db, { name: "Archmage High Arcana", rulesetId: dmgId }))!;
      for (const [index, option] of ["Arcane Reach", "Spell Power"].entries()) {
        const feat = (await Feats.findOne(db, { name: `${option} (Archmage High Arcana)`, rulesetId: dmgId }))!;
        await addCharacterLevel(characterId, (await findKlassLevel(archmage.id, index + 1))!.id, {
          feats: [{ featId: feat.id, aptitudeId: highArcana.id }],
        });
      }
      // Each level's High Arcana (Archmage) grants one pick of the High Arcana
      const highArcanaPicks = async () => {
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const { allowed, spent } = detailed.components.aptitudes.getAptitudes()["archmagehigharcana"];
        return {
          allowed,
          spent,
          granted: detailed.components.feats.getFeat("High Arcana (Archmage)")?.count,
        };
      };
      expect(await highArcanaPicks()).toEqual({ allowed: 2, spent: 2, granted: 2 });

      await ClassesService.updateClass(makeSession(), fork.id, archmage.id, {
        name: "Archmage",
        description: "Ours",
      });
      RulesetViews.invalidate(fork.id);
      expect(await Klasses.findOne(db, { name: "Archmage", rulesetId: fork.id })).toBeDefined();
      expect(await highArcanaPicks()).toEqual({ allowed: 2, spent: 2, granted: 2 });
    });
  });

  describe("spells", () => {
    test("reach no DC of a spell the character doesn't cast: a modifier there applies to nothing, a requirement is unmet", async () => {
      // A fighter: no class list's spell (Fireball), and no domain's alone (Chaos Hammer)
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const targetPaths = new Dnd35TargetPaths();
      for (const target of [
        "powers.fireball.dc.*.misc",
        "powers.fireball.dc.*.total",
        "powers.chaoshammer.dc.*.misc",
        "powers.chaoshammer.dc.*.total",
      ])
        expect([target, targetPaths.traversePathInit(target, bjorn.components)]).toEqual([target, []]);

      const atLeast15 = { operator: "greater_than_or_equal", value: "15", valueType: "number" } as const;
      const requirement = requiring("powers.fireball.dc.*.total", atLeast15);
      const evaluator = new RequirementEvaluator(targetPaths);
      evaluator.evaluateRequirements(bjorn.components, requirement);
      expect(evaluator.getRequirements().invalidRequirements).toEqual([]);
      expect(bjorn.areRequirementsMet(requirement)).toBe(false);
    });

    test("give a class drawing on another class's list its slots: a spellthief's, of the sorcerer's", async () => {
      const fork = await forkWith(DND35_COMPLETE_ADVENTURER_NAME);
      const scores = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 };
      const characterId = await seedHuman("Spellthief", scores, { rulesetId: fork.id });
      const adventurerId = (await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME)).id;
      const spellthief = (await Klasses.findOne(db, { name: "Spellthief", rulesetId: adventurerId }))!;
      for (let level = 1; level <= 6; level++)
        await addCharacterLevel(characterId, (await findKlassLevel(spellthief.id, level))!.id);

      // Spellthief 6: one 1st-level spell a day, three known
      const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
      expect(spellUses(detailed, "spellthiefspells", [1])).toEqual([1]);
      expect(spellLevel(detailed, "spellthiefspells", 1).allowed).toBe(3);
    });

    test("give a pious templar the list she picks, as her alignment allows: the paladin's or the blackguard's", async () => {
      const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
      const listFeat = (list: string) => divine.feat(`${list} Spell List (Pious Templar)`);
      const fork = await forkWith(DND35_COMPLETE_DIVINE_NAME);
      const scores = { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 };
      // A good templar's list is the paladin's, an evil one's the blackguard's; a neutral one picks either
      const allowed = async (alignment: "Neutral Good" | "Chaotic Neutral" | "Neutral Evil") => {
        const characterId = await seedHuman(alignment, scores, { rulesetId: fork.id, alignment });
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        return ["Paladin", "Blackguard"].filter((list) =>
          detailed.areRequirementsMet([divine.requirementsOf(listFeat(list).id)]),
        );
      };
      expect(await allowed("Neutral Good")).toEqual(["Paladin"]);
      expect(await allowed("Neutral Evil")).toEqual(["Blackguard"]);
      expect(await allowed("Chaotic Neutral")).toEqual(["Paladin", "Blackguard"]);

      // A pious templar 3 who meets the class's prerequisites, Wis 16, with `bonus` caster levels: her slots, bonus spells
      // and caster level go to the list she picked, none to the other
      const templar = divine.klasses.find((klass) => klass.name === "Pious Templar")!;
      const sheetWith = async (list: string, bonus = 0) => {
        const characterId = await seedHuman(
          `${list} Templar`,
          { ...scores, Wisdom: 16 },
          { rulesetId: fork.id, alignment: "Chaotic Neutral" },
        );
        const granted: [string, string, string][] = [
          ["combat.bab", "5", "number"],
          ["skills.knowledgereligion.rank", "4", "number"],
          ["feats.truebeliever.possessed", "true", "boolean"],
          ["feats.weaponfocuslongsword.possessed", "true", "boolean"],
          ...(bonus > 0
            ? [["classes.pioustemplar.bonuscasterlevel", String(bonus), "number"] as [string, string, string]]
            : []),
        ];
        for (const [target, value, valueType] of granted) {
          const operator = valueType === "boolean" ? "set" : "add";
          await Modifiers.create(db, {
            sourceId: characterId,
            sourceType: "characters",
            target,
            value,
            valueType,
            operator,
          });
        }
        const pick = { featId: listFeat(list).id, aptitudeId: divine.aptitude("Pious Templar Spell List").id };
        for (let level = 1; level <= 3; level++) {
          const klassLevel = (await findKlassLevel(templar.id, level))!;
          await addCharacterLevel(characterId, klassLevel.id, level === 1 ? { feats: [pick] } : {});
        }
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const divineLevel = [0, 1, 2, 3, 4].find((n) =>
          detailed.areRequirementsMet(requiring("spellcasting.divine", exactly(n))),
        );
        return {
          paladin: spellUses(detailed, "pioustemplarspells", [1, 2, 3]),
          blackguard: spellUses(detailed, "pioustemplarblackguardspells", [1, 2, 3]),
          divine: divineLevel,
        };
      };
      // A 1st- and a 2nd-level spell a day, each with Wisdom's bonus one
      expect(await sheetWith("Paladin")).toEqual({ paladin: [2, 2, 0], blackguard: [0, 0, 0], divine: 2 });
      expect(await sheetWith("Blackguard")).toEqual({ paladin: [0, 0, 0], blackguard: [2, 2, 0], divine: 2 });
      // Two bonus caster levels, a templar 5's: her 3rd level opens on her list alone
      expect(await sheetWith("Blackguard", 2)).toEqual({ paladin: [0, 0, 0], blackguard: [2, 2, 1], divine: 3 });
    });

    describe("save DCs", () => {
      test("add the spell's level, the casting ability and focus bonuses, shared across its groupings", async () => {
        // A wizard, INT 18 (+4), with Spell Focus: Evocation.
        const elara = await buildSeeded("Elara Starweaver");
        const groupings = elara.components.powerGroupings.getPowerGroupings();
        expect(Object.keys(groupings)).toEqual(expect.arrayContaining(["evocation", "abjuration", "conjuration"]));
        expect(Object.keys(groupings["evocation"]).length).toBeGreaterThanOrEqual(2);

        // Each spell's DC is its class's: Elara's are a wizard's
        const burningHands = groupings["evocation"]["burninghands"]["wizard"];
        expect(burningHands).toMatchObject({ base: 10, level: 1, ability: 4, misc: 1, total: 16 });
        expect(groupings["evocation"]["light"]["wizard"]).toMatchObject({
          base: 10,
          level: 0,
          ability: 4,
          misc: 1,
          total: 15,
        });
        // The school's and the descriptor's groupings and the spell hold the same DC; the spell's name isn't a grouping
        expect(groupings["fire"]["burninghands"]["wizard"]).toBe(burningHands);
        expect(elara.components.powers.getPower("Burning Hands")?.dc?.["wizard"]).toBe(burningHands);
        expect(groupings["burninghands"]).toBeUndefined();
      });

      test("use the class's casting ability: charisma for a sorcerer", async () => {
        // CHA 18 (+4), no Spell Focus.
        const dc = (await buildSeeded("Vex Flamecaller")).components.powerGroupings.getPowerGroupings()["evocation"]?.[
          "burninghands"
        ]?.["sorcerer"];
        expect(dc).toMatchObject({ base: 10, level: 1, ability: 4, total: 15 });
      });

      test("leave empty groupings for a character without spells", async () => {
        // Groupings exist for every school, so a Spell Focus has somewhere to point.
        const groupings = (await buildSeeded("Bjorn Ironhand")).components.powerGroupings.getPowerGroupings();
        expect(Object.keys(groupings).length).toBeGreaterThan(0);
        expect(Object.values(groupings).every((bucket) => Object.keys(bucket).length === 0)).toBe(true);
      });
    });

    describe("per day", () => {
      test("add the casting ability's bonus spells to the levels the class can cast", async () => {
        // Wizard 3 and cleric 3: 4, 2 and 1, plus one second- and first-level spell for INT 18 or WIS 16.
        expect(spellUses(await buildSeeded("Elara Starweaver"), "wizardspells", [0, 1, 2, 3])).toEqual([4, 3, 2, 0]);
        expect(spellUses(await buildSeeded("Theron Lightbringer"), "clericspells", [0, 1, 2, 3])).toEqual([4, 3, 2, 0]);
        // A third-level ranger casts nothing yet.
        expect(spellUses(await buildSeeded("Fenn Ashwalker"), "rangerspells", [0, 1, 2, 3, 4])).toEqual([
          0, 0, 0, 0, 0,
        ]);
      });

      test.each([1, 2])("rise with %i bonus caster level(s) from a prestige class", async (bonus) => {
        const ctx = await getSeedCtx();
        const theron = await findSeededCharacter("Theron Lightbringer");
        const { levelIds } = await new RulesetSeeder(db, ctx).seedClass({
          name: "Test Theurge",
          description: "Advances divine casting",
          hd: 6,
          levels: 10,
          skillPoints: 2,
          bab: "medium",
          saves: { fortitude: "good", reflex: "poor", will: "good" },
          classSkills: ["Concentration"],
          casterLevelAdvancement: { type: "divine", levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
        });
        invalidateSeededRuleset(ctx.rulesetId);
        // The class's aptitude and feat exist once it's seeded.
        const { featMap, aptMap } = await getSeedCtx();
        for (let level = 1; level <= bonus; level++) {
          await addCharacterLevel(theron.id, levelIds[level], {
            feats: [
              { featId: featMap["Advance Cleric Spellcasting"], aptitudeId: aptMap["Bonus Divine Caster Level"] },
            ],
          });
        }

        const detailed = await build(theron);
        expect(detailed.components.classes.getCharacterClasses()["cleric"]).toMatchObject({
          level: 3,
          bonuscasterlevel: bonus,
        });
        // A cleric 4 casts 5, 3 and 2; a cleric 5 opens third-level spells.
        if (bonus === 1) {
          expect(spellUses(detailed, "clericspells", [0, 1, 2, 3])).toEqual([5, 4, 3, 0]);
          expect(spellLevel(detailed, "clericspells", 3).allowed).toBe(0);
        } else {
          expect(spellUses(detailed, "clericspells", [0, 1, 2, 3, 4])).toEqual([5, 4, 3, 2, 0]);
          expect([3, 4].map((level) => spellLevel(detailed, "clericspells", level).allowed)).toEqual([ALLOWED_ALL, 0]);
          const levels = new Set(allPowers(detailed).map((p) => (p as { powerLevel?: number | null }).powerLevel));
          expect([levels.has(3), levels.has(4)]).toEqual([true, false]);
        }
      });
    });

    test("give a cleric every spell of the levels it can cast, and none above", async () => {
      // Cleric 3 casts up to second level.
      const theron = await buildSeeded("Theron Lightbringer");
      expect(theron.components.aptitudes.isLeveledAptitude("clericspells")).toBe(true);
      const knowsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
        (level) => spellLevel(theron, "clericspells", level)?.allowed === ALLOWED_ALL,
      );
      expect(knowsAll).toEqual([0, 1, 2]);
      const levels = Object.values(theron.components.powers.getFlatPowers())
        .map((entry) => (entry.power as { powerLevel?: number | null }).powerLevel)
        .filter((level) => level != null);
      expect(levels.every((level) => knowsAll.includes(level!))).toBe(true);
    });

    describe("of a cleric's domains", () => {
      test("fill one domain slot a spell level the cleric casts, whatever his domains", async () => {
        // Cleric 3 of the Healing and Sun domains: a domain slot at the first and second levels, his feature's
        const theron = await buildSeeded("Theron Lightbringer");
        expect(spellUses(theron, "domainspells", [0, 1, 2, 3])).toEqual([0, 1, 1, 0]);
        for (const list of ["healingdomainspells", "sundomainspells"]) {
          expect([1, 2, 3].map((level) => spellLevel(theron, list, level))).toMatchObject([
            { allowed: ALLOWED_ALL, uses: 0 },
            { allowed: ALLOWED_ALL, uses: 0 },
            { allowed: 0, uses: 0 },
          ]);
        }
      });

      test("join the cleric's list with the domain's tag, up to the levels it casts", async () => {
        // Sun domain: Heat Metal (2nd level, not a cleric spell), Fire Shield (4th).
        const theron = await buildSeeded("Theron Lightbringer");
        const clericPowers = theron.components.classes
          .getCharacterClasses()
          ["cleric"].levels.flatMap((level) => level.powers);
        const heatMetal = clericPowers.find((p) => p.name === "Heat Metal")!;
        expect(heatMetal.aptitudeId).toBe(theron.components.aptitudes.getAptitudes()["clericspells"].id);
        expect(theron.getSpellTags()[heatMetal.id]).toContain("Sun Domain");
        expect(allPowers(theron).map((p) => p.name)).not.toContain("Fire Shield");
      });

      test("open with bonus caster levels", async () => {
        // Cleric 7 / Stormlord 5: the weather domain's fifth and sixth levels open.
        const ctx = await getSeedCtx();
        const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
        const extension = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
        const fork = await forkWith(DND35_COMPLETE_DIVINE_NAME);
        const characterId = await seedHuman(
          "Storm Cleric",
          { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 18, Charisma: 10 },
          { xp: 66000, alignment: "Chaotic Neutral", rulesetId: fork.id },
        );
        const clericLevels = await addClassLevels(
          db,
          ctx,
          characterId,
          "Cleric",
          [1, 2, 3, 4, 5, 6, 7],
          [8, 6, 7, 6, 8, 6, 7],
        );
        await addFeats(db, ctx, clericLevels, [{ levelIndex: 0, featName: "War Domain", aptitude: "Cleric Domain" }]);
        await CharacterLevelFeats.createMany(db, [
          {
            characterLevelId: clericLevels[0],
            featId: divine.feat("Weather Domain").id,
            aptitudeId: ctx.aptMap["Cleric Domain"],
          },
        ]);
        const stormlord = (await Klasses.findOne(db, { name: "Stormlord", rulesetId: extension.id }))!;
        const advance =
          (await Feats.findOne(db, { name: "Advance Cleric Spellcasting", rulesetId: extension.id }))?.id ??
          ctx.featMap["Advance Cleric Spellcasting"];
        const bonusLevel =
          (await Aptitudes.findOne(db, { name: "Bonus Divine Caster Level", rulesetId: extension.id }))?.id ??
          ctx.aptMap["Bonus Divine Caster Level"];
        for (let level = 1; level <= 5; level++) {
          const klassLevel = (await findKlassLevel(stormlord.id, level))!;
          await addCharacterLevel(characterId, klassLevel.id, { feats: [{ featId: advance, aptitudeId: bonusLevel }] });
        }

        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        expect(detailed.components.classes.getCharacterClasses()["cleric"]).toMatchObject({
          level: 7,
          bonuscasterlevel: 5,
        });
        expect([5, 6, 7].map((level) => spellLevel(detailed, "weatherdomainspells", level))).toMatchObject([
          { allowed: ALLOWED_ALL, uses: 0 },
          { allowed: ALLOWED_ALL, uses: 0 },
          { allowed: 0 },
        ]);
        // One domain slot a spell level, his two domains' alike, its fifth and sixth opened by the bonus caster levels
        expect(spellUses(detailed, "domainspells", [1, 2, 3, 4, 5, 6, 7])).toEqual([1, 1, 1, 1, 1, 1, 0]);
        const tags = detailed.getSpellTags();
        const weather = allPowers(detailed)
          .filter((p) => tags[p.id]?.includes("Weather Domain"))
          .map((p) => p.name);
        expect(weather).toEqual(expect.arrayContaining(["Binding Winds", "Cloudwalkers"]));
      });

      test("open with bonus caster levels only the slots whose other requirements hold", async () => {
        // Cleric 7 / stormlord 5, chaotic neutral, casts as a cleric 12: a homebrew domain's sixth level opens; its fifth,
        // for a lawful neutral cleric only, doesn't
        const ctx = await getSeedCtx();
        const extension = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
        const fork = await forkWith(DND35_COMPLETE_DIVINE_NAME);
        const [order] = await insertRows(aptitudesInRules, [{ name: "Order Prayers", rulesetId: fork.id }]);
        const [fifth, sixth] = await insertRows(powersInRules, [
          { name: "Fifth Order Hymn", rulesetId: fork.id },
          { name: "Sixth Order Hymn", rulesetId: fork.id },
        ]);
        await insertRows(powersAptitudesInRules, [
          { powerId: fifth.id, aptitudeId: order.id, level: 5 },
          { powerId: sixth.id, aptitudeId: order.id, level: 6 },
        ]);
        const [orderDomain] = await insertRows(featsInRules, [{ name: "Order Domain", rulesetId: fork.id }]);
        const modifier = (target: string, value: string, operator: string, valueType = "number") => ({
          sourceId: orderDomain.id,
          sourceType: "feats",
          target,
          value,
          valueType,
          operator,
        });
        const [fifthUses, fifthAllowed, sixthUses, sixthAllowed] = await insertRows(modifiersInCustomization, [
          modifier("aptitudes.orderprayers.5.uses", "1", "add"),
          modifier("aptitudes.orderprayers.5.allowed", "-1", "set"),
          modifier("aptitudes.orderprayers.6.uses", "1", "add"),
          modifier("aptitudes.orderprayers.6.allowed", "-1", "set"),
          modifier("aptitudes.orderprayers.joinsclasslist", "true", "set", "boolean"),
        ]);
        const gate = (entityId: string, clericLevel: number, lawful: boolean) => [
          {
            entityId,
            entityType: "modifiers",
            level: "1",
            target: "classes.cleric.level",
            operator: "greater_than_or_equal",
            value: String(clericLevel),
            valueType: "number",
          },
          ...(lawful
            ? [
                {
                  entityId,
                  entityType: "modifiers",
                  level: "2",
                  target: "identity.beliefs.alignment",
                  operator: "equal",
                  value: "Lawful Neutral",
                  valueType: "string",
                },
              ]
            : []),
        ];
        await insertRows(requirementsInCustomization, [
          ...gate(fifthUses.id, 9, true),
          ...gate(fifthAllowed.id, 9, true),
          ...gate(sixthUses.id, 11, false),
          ...gate(sixthAllowed.id, 11, false),
        ]);
        RulesetViews.invalidate(fork.id);

        const characterId = await seedHuman(
          "Order Cleric",
          { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 18, Charisma: 10 },
          { xp: 66000, alignment: "Chaotic Neutral", rulesetId: fork.id },
        );
        const clericLevels = await addClassLevels(
          db,
          ctx,
          characterId,
          "Cleric",
          [1, 2, 3, 4, 5, 6, 7],
          [8, 6, 7, 6, 8, 6, 7],
        );
        await CharacterLevelFeats.createMany(db, [
          { characterLevelId: clericLevels[0], featId: orderDomain.id, aptitudeId: ctx.aptMap["Cleric Domain"] },
        ]);
        const stormlord = (await Klasses.findOne(db, { name: "Stormlord", rulesetId: extension.id }))!;
        const advance =
          (await Feats.findOne(db, { name: "Advance Cleric Spellcasting", rulesetId: extension.id }))?.id ??
          ctx.featMap["Advance Cleric Spellcasting"];
        const bonusLevel =
          (await Aptitudes.findOne(db, { name: "Bonus Divine Caster Level", rulesetId: extension.id }))?.id ??
          ctx.aptMap["Bonus Divine Caster Level"];
        for (let level = 1; level <= 5; level++) {
          const klassLevel = (await findKlassLevel(stormlord.id, level))!;
          await addCharacterLevel(characterId, klassLevel.id, { feats: [{ featId: advance, aptitudeId: bonusLevel }] });
        }

        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        expect([5, 6].map((level) => spellLevel(detailed, "orderprayers", level))).toMatchObject([
          { allowed: 0, uses: 0 },
          { allowed: ALLOWED_ALL, uses: 1 },
        ]);
      });

      // The divine crusader's prerequisites
      const CRUSADER_PREREQUISITES: [string, string, string][] = [
        ["combat.bab", "7", "number"],
        ["skills.knowledgereligion.rank", "2", "number"],
        ["feats.weaponfocuslongsword.possessed", "true", "boolean"],
      ];

      test("make a divine crusader's list the spells of the domain she picks, cast with her own slots", async () => {
        // Charisma 16: a bonus spell at each of the first three levels
        const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
        const crusader = divine.klasses.find((klass) => klass.name === "Divine Crusader")!;
        const fire = {
          featId: divine.feat("Fire Domain (Divine Crusader)").id,
          aptitudeId: divine.aptitude("Divine Crusader Domain").id,
        };
        const sheetAt = async (levels: number) => {
          const scores = { ...WIZARD_SCORES, Charisma: 16 };
          const characterId = await divineCharacter(`Crusader ${levels}`, scores, CRUSADER_PREREQUISITES);
          for (let level = 1; level <= levels; level++) {
            const klassLevel = (await findKlassLevel(crusader.id, level))!;
            await addCharacterLevel(characterId, klassLevel.id, level === 1 ? { feats: [fire] } : {});
          }
          const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
          const list = detailed.components.aptitudes.getAptitudes()["divinecrusaderspells"].id;
          return {
            uses: spellUses(detailed, "divinecrusaderspells", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
            known: allPowers(detailed)
              .filter((power) => power.aptitudeId === list)
              .map((power) => power.name)
              .sort(),
            divine: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) =>
              detailed.areRequirementsMet(requiring("spellcasting.divine", exactly(n))),
            ),
          };
        };
        expect(await sheetAt(1)).toEqual({ uses: [1, 0, 0, 0, 0, 0, 0, 0, 0], known: ["Burning Hands"], divine: 1 });
        expect(await sheetAt(4)).toEqual({
          uses: [3, 3, 2, 0, 0, 0, 0, 0, 0],
          known: ["Burning Hands", "Produce Flame", "Resist Energy", "Wall of Fire"],
          divine: 4,
        });
        expect(await sheetAt(10)).toEqual({
          uses: [4, 4, 4, 3, 3, 3, 2, 2, 1],
          known: [
            "Burning Hands",
            "Elemental Swarm",
            "Fire Seeds",
            "Fire Shield",
            "Fire Storm",
            "Incendiary Cloud",
            "Produce Flame",
            "Resist Energy",
            "Wall of Fire",
          ],
          divine: 9,
        });
      });

      test("give a cleric and a divine crusader who pick the same domain its spells on each list, as far as each casts", async () => {
        // Cleric 3 / divine crusader 4, both of fire: the cleric casts to the second level, the crusader to the fourth
        const ctx = await getSeedCtx();
        const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
        const characterId = await divineCharacter(
          "Fire Crusader",
          { ...WIZARD_SCORES, Wisdom: 14 },
          CRUSADER_PREREQUISITES,
        );
        const cleric = (await Klasses.findOne(db, { name: "Cleric", rulesetId: ctx.rulesetId }))!;
        for (let level = 1; level <= 3; level++) {
          const picks = { feats: [{ featId: ctx.featMap["Fire Domain"], aptitudeId: ctx.aptMap["Cleric Domain"] }] };
          await addCharacterLevel(characterId, (await findKlassLevel(cleric.id, level))!.id, level === 1 ? picks : {});
        }
        const crusader = divine.klasses.find((klass) => klass.name === "Divine Crusader")!;
        const fire = {
          featId: divine.feat("Fire Domain (Divine Crusader)").id,
          aptitudeId: divine.aptitude("Divine Crusader Domain").id,
        };
        for (let level = 1; level <= 4; level++) {
          await addCharacterLevel(
            characterId,
            (await findKlassLevel(crusader.id, level))!.id,
            level === 1 ? { feats: [fire] } : {},
          );
        }
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const aptitudes = detailed.components.aptitudes.getAptitudes();
        const onList = (list: string) =>
          allPowers(detailed)
            .filter((power) => power.aptitudeId === aptitudes[list].id)
            .map((power) => power.name);
        // Produce Flame and Wall of Fire are neither cleric spells nor first-level ones: the domain's on each list
        expect(onList("clericspells")).toEqual(expect.arrayContaining(["Burning Hands", "Produce Flame"]));
        expect(onList("clericspells")).not.toContain("Wall of Fire");
        expect(onList("divinecrusaderspells").sort()).toEqual([
          "Burning Hands",
          "Produce Flame",
          "Resist Energy",
          "Wall of Fire",
        ]);
        // The domain's spells are known up to the level the cleric casts, his domain slot his; each feat's tag shows on
        // its class's list
        expect([1, 2, 3].map((level) => spellLevel(detailed, "firedomainspells", level))).toMatchObject([
          { allowed: ALLOWED_ALL, uses: 0 },
          { allowed: ALLOWED_ALL, uses: 0 },
          { allowed: 0, uses: 0 },
        ]);
        expect(spellUses(detailed, "domainspells", [1, 2, 3])).toEqual([1, 1, 0]);
        const tagLists = detailed.getSpellTagLists();
        expect(tagLists["Fire Domain"].aptitudeIds).toContain(aptitudes["clericspells"].id);
        expect(tagLists["Fire Domain (Divine Crusader)"].aptitudeIds).toContain(aptitudes["divinecrusaderspells"].id);
      });

      test("join the Luck domain's spells to a class's list at the level a class feature of it brings them", async () => {
        // A homebrew class whose second level's feature joins the Luck domain's list to its own
        const ctx = await getSeedCtx();
        const [feature, raiderSpells] = await insertRows(aptitudesInRules, [
          { name: "Test Raider Class Feature", rulesetId: ctx.rulesetId },
          { name: "Test Raider Spells", rulesetId: ctx.rulesetId },
        ]);
        await insertRows(powersAptitudesInRules, [
          { powerId: ctx.powerMap["Bless"], aptitudeId: raiderSpells.id, level: 1 },
        ]);
        const [luck] = await insertRows(featsInRules, [{ name: "Test Raider Luck", rulesetId: ctx.rulesetId }]);
        await insertRows(modifiersInCustomization, [
          {
            sourceId: luck.id,
            sourceType: "feats",
            target: "aptitudes.luckdomainspells.joinsclasslist",
            operator: "set",
            value: "true",
            valueType: "boolean",
          },
        ]);
        const { levelIds } = await new RulesetSeeder(db, {
          ...ctx,
          featMap: { ...ctx.featMap, "Test Raider Luck": luck.id },
          aptMap: { ...ctx.aptMap, "Test Raider Class Feature": feature.id },
        }).seedClass({
          name: "Test Raider",
          description: "Steals a domain's luck",
          hd: 6,
          levels: 2,
          skillPoints: 4,
          bab: "medium",
          saves: { fortitude: "poor", reflex: "good", will: "good" },
          classSkills: ["Search"],
          classFeatureAptitude: "Test Raider Class Feature",
          classFeatures: [[2, "Test Raider Luck"]],
          spells: { slug: "testraiderspells", perDay: [[1], [1]], knowAll: true, noCantrips: true },
        });
        invalidateSeededRuleset(ctx.rulesetId);

        const knownAt = async (levels: number) => {
          const characterId = await seedHuman(`Test Raider ${levels}`, WIZARD_SCORES);
          for (let level = 1; level <= levels; level++) await addCharacterLevel(characterId, levelIds[level]);
          const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
          const list = detailed.components.aptitudes.getAptitudes()["testraiderspells"].id;
          return allPowers(detailed)
            .filter((power) => power.aptitudeId === list)
            .map((power) => power.name)
            .sort();
        };
        // The Luck domain's first-level spell from its second level; its second-level one never: the class casts none
        expect(await knownAt(1)).toEqual(["Bless"]);
        expect(await knownAt(2)).toEqual(["Bless", "Entropic Shield"]);
      });

      test("join the list of each class that brings them, a class level's as well as a feat's", async () => {
        // A homebrew class whose first level joins the fire domain to its list, taken by a fire cleric
        const ctx = await getSeedCtx();
        const [sunPriestSpells] = await insertRows(aptitudesInRules, [
          { name: "Test Sun Priest Spells", rulesetId: ctx.rulesetId },
        ]);
        await insertRows(powersAptitudesInRules, [
          { powerId: ctx.powerMap["Bless"], aptitudeId: sunPriestSpells.id, level: 1 },
        ]);
        const { levelIds } = await new RulesetSeeder(db, ctx).seedClass({
          name: "Test Sun Priest",
          description: "Draws on a domain",
          hd: 6,
          levels: 2,
          skillPoints: 2,
          bab: "medium",
          saves: { fortitude: "good", reflex: "poor", will: "good" },
          classSkills: ["Concentration"],
          spells: { slug: "testsunpriestspells", perDay: [[1], [1]], knowAll: true, noCantrips: true },
          modifiers: [
            {
              level: 1,
              target: "aptitudes.firedomainspells.joinsclasslist",
              operator: "set",
              value: "true",
              valueType: "boolean",
            },
          ],
        });
        invalidateSeededRuleset(ctx.rulesetId);

        const characterId = await seedHuman("Sun Priest", { ...WIZARD_SCORES, Wisdom: 16 });
        const cleric = (await Klasses.findOne(db, { name: "Cleric", rulesetId: ctx.rulesetId }))!;
        await addCharacterLevel(characterId, (await findKlassLevel(cleric.id, 1))!.id, {
          feats: [{ featId: ctx.featMap["Fire Domain"], aptitudeId: ctx.aptMap["Cleric Domain"] }],
        });
        await addCharacterLevel(characterId, levelIds[1]);
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const aptitudes = detailed.components.aptitudes.getAptitudes();
        const onList = (list: string) =>
          allPowers(detailed)
            .filter((power) => power.aptitudeId === aptitudes[list].id)
            .map((power) => power.name);
        // The fire domain's first-level spell on both lists, its second on neither: both classes cast the first level only
        for (const list of ["clericspells", "testsunpriestspells"]) {
          expect(onList(list)).toContain("Burning Hands");
          expect(onList(list)).not.toContain("Produce Flame");
        }
      });

      test("keep a domain's spells on its own list for a class with no list knowing their level", async () => {
        // A fighter picking the sun domain, as a prestige class granting a domain pick would: its first-level spell is
        // its own, though no domain slot: that's a cleric's
        const ctx = await getSeedCtx();
        const characterId = await seedHuman("Sun Fighter", { ...WIZARD_SCORES, Wisdom: 16 });
        const fighter = (await Klasses.findOne(db, { name: "Fighter", rulesetId: ctx.rulesetId }))!;
        await addCharacterLevel(characterId, (await findKlassLevel(fighter.id, 1))!.id, {
          feats: [{ featId: ctx.featMap["Sun Domain"], aptitudeId: ctx.aptMap["Cleric Domain"] }],
        });
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const sunDomainSpells = detailed.components.aptitudes.getAptitudes()["sundomainspells"].id;
        expect(spellLevel(detailed, "sundomainspells", 1)).toMatchObject({ allowed: ALLOWED_ALL, uses: 0 });
        expect(spellLevel(detailed, "domainspells", 1)).toMatchObject({ allowed: 0, uses: 0 });
        expect(
          allPowers(detailed)
            .filter((power) => power.aptitudeId === sunDomainSpells)
            .map((power) => power.name),
        ).toEqual(["Endure Elements"]);
      });

      test("keep a feat's extra slot in a class's own list the class's: no tag, its spells still learned", async () => {
        const ctx = await getSeedCtx();
        const fork = await forkWith();
        const [reserve] = await insertRows(featsInRules, [{ name: "Test Arcane Reserve", rulesetId: fork.id }]);
        await insertRows(featsAptitudesInRules, [{ featId: reserve.id, aptitudeId: ctx.aptMap["General"] }]);
        await insertRows(modifiersInCustomization, [
          {
            sourceId: reserve.id,
            sourceType: "feats",
            target: "aptitudes.wizardspells.1.uses",
            value: "1",
            valueType: "number",
            operator: "add",
          },
        ]);
        RulesetViews.invalidate(fork.id);

        const characterId = await seedHuman("Reserve Wizard", WIZARD_SCORES, { rulesetId: fork.id });
        const wizard = (await Klasses.findOne(db, { name: "Wizard", rulesetId: ctx.rulesetId }))!;
        await addCharacterLevel(characterId, (await findKlassLevel(wizard.id, 1))!.id, {
          feats: [{ featId: reserve.id, aptitudeId: ctx.aptMap["General"] }],
        });
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        // A wizard 1 with Intelligence 16: one first-level spell, one for Intelligence, one from the feat
        expect(spellUses(detailed, "wizardspells", [1])).toEqual([3]);
        expect(Object.values(detailed.getSpellTags()).flat()).not.toContain("Test Arcane Reserve");
        expect(detailed.components.powers.getSpellEntry("magicmissile", "wizard")).toBeDefined();
      });

      test("open a specialist's school slot at the spell levels bonus caster levels reach", async () => {
        // An evocation specialist wizard 5 / loremaster 3 casts as a wizard 8: fourth-level spells, a school slot there too
        const ctx = await getSeedCtx();
        const fork = await forkWith(DND35_DMG_NAME);
        const characterId = await seedHuman("Lore Specialist", WIZARD_SCORES, {
          xp: 36000,
          rulesetId: fork.id,
        });
        const wizardLevels = await addClassLevels(db, ctx, characterId, "Wizard", [1, 2, 3, 4, 5], [4, 4, 4, 4, 4]);
        await addFeats(db, ctx, wizardLevels, [
          { levelIndex: 0, featName: "Evocation Specialist", aptitude: "Wizard Specialization" },
        ]);
        const dmg = await findSeededRuleset(DND35_DMG_NAME);
        const loremaster = (await Klasses.findOne(db, { name: "Loremaster", rulesetId: dmg.id }))!;
        const advance = {
          featId: ctx.featMap["Advance Wizard Spellcasting"],
          aptitudeId: ctx.aptMap["Bonus Arcane Caster Level"],
        };
        for (let level = 1; level <= 3; level++)
          await addCharacterLevel(characterId, (await findKlassLevel(loremaster.id, level))!.id, { feats: [advance] });

        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        expect(spellLevel(detailed, "wizardspells", 4).uses).toBeGreaterThan(0);
        expect([3, 4, 5].map((level) => spellLevel(detailed, "evocationspecialistspells", level))).toMatchObject([
          { allowed: ALLOWED_ALL, uses: 1 },
          { allowed: ALLOWED_ALL, uses: 1 },
          { allowed: 0, uses: 0 },
        ]);
      });

      test("join the cleric's list by their feat's flag, whatever their lists are named", async () => {
        // A homebrew domain whose list isn't named "… Domain Spells" and joins the cleric's, and one named so that doesn't
        const ctx = await getSeedCtx();
        const fork = await forkWith();
        const [prayers, moon, litany] = await insertRows(aptitudesInRules, [
          { name: "Sun Prayers", rulesetId: fork.id },
          { name: "Moon Domain Spells", rulesetId: fork.id },
          { name: "Sun Litany", rulesetId: fork.id },
        ]);
        const [dawn, dusk, noon] = await insertRows(powersInRules, [
          { name: "Dawn Hymn", rulesetId: fork.id },
          { name: "Dusk Hymn", rulesetId: fork.id },
          { name: "Noon Hymn", rulesetId: fork.id },
        ]);
        await insertRows(powersAptitudesInRules, [
          { powerId: dawn.id, aptitudeId: prayers.id, level: 1 },
          { powerId: dusk.id, aptitudeId: moon.id, level: 1 },
          { powerId: noon.id, aptitudeId: litany.id, level: 1 },
        ]);
        const [sun, moonDomain] = await insertRows(featsInRules, [
          { name: "Prayers of the Sun", rulesetId: fork.id },
          { name: "Moon Domain", rulesetId: fork.id },
        ]);
        const clericDomain = ctx.aptMap["Cleric Domain"];
        await insertRows(featsAptitudesInRules, [
          { featId: sun.id, aptitudeId: clericDomain },
          { featId: moonDomain.id, aptitudeId: clericDomain },
        ]);
        const slot = (sourceId: string, list: string) => [
          {
            sourceId,
            sourceType: "feats",
            target: `aptitudes.${list}.1.uses`,
            value: "1",
            valueType: "number",
            operator: "add",
          },
          {
            sourceId,
            sourceType: "feats",
            target: `aptitudes.${list}.1.allowed`,
            value: "-1",
            valueType: "number",
            operator: "set",
          },
        ];
        await insertRows(modifiersInCustomization, [
          ...slot(sun.id, "sunprayers"),
          ...slot(sun.id, "sunlitany"),
          {
            sourceId: sun.id,
            sourceType: "feats",
            target: "aptitudes.sunprayers.joinsclasslist",
            value: "true",
            valueType: "boolean",
            operator: "set",
          },
          ...slot(moonDomain.id, "moondomainspells"),
        ]);
        RulesetViews.invalidate(fork.id);

        const characterId = await seedHuman("Sun Cleric", WIZARD_SCORES, { rulesetId: fork.id });
        const clericClass = (await Klasses.findOne(db, { name: "Cleric", rulesetId: ctx.rulesetId }))!;
        const cleric = (await findKlassLevel(clericClass.id, 1))!;
        await addCharacterLevel(characterId, cleric.id, {
          feats: [
            { featId: sun.id, aptitudeId: clericDomain },
            { featId: moonDomain.id, aptitudeId: clericDomain },
          ],
        });
        const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
        const clericSpells = detailed.components.aptitudes.getAptitudes()["clericspells"].id;
        const onClericList = allPowers(detailed)
          .filter((power) => power.aptitudeId === clericSpells)
          .map((power) => power.name);
        expect(onClericList).toContain("Dawn Hymn");
        expect(onClericList).not.toContain("Dusk Hymn");

        // Each feat's list tags its spells, shown on that list and the cleric's, and comes with the feat: nothing to know
        expect(detailed.getSpellTags()).toMatchObject({
          [dawn.id]: ["Prayers of the Sun"],
          [dusk.id]: ["Moon Domain"],
          [noon.id]: ["Prayers of the Sun"],
        });
        // A feat opening two lists shows its tag on both
        const tagLists = detailed.getSpellTagLists();
        expect(tagLists["Prayers of the Sun"].aptitudeIds.toSorted()).toEqual(
          [prayers.id, litany.id, clericSpells].sort(),
        );
        expect(tagLists["Prayers of the Sun"].joinsClassList).toBe(true);
        expect(tagLists["Moon Domain"]).toEqual({ aptitudeIds: [moon.id, clericSpells], joinsClassList: false });
        const powers = detailed.components.powers;
        expect(powers.getSpellEntry("dawnhymn", "sunprayers")).toBeUndefined();
        expect(powers.getSpellEntry("duskhymn", "moondomain")).toBeUndefined();
        expect(powers.getSpellEntry("bless", "cleric")).toBeDefined();
      });
    });

    describe("of a loremaster's secrets", () => {
      test("are her picks in her Secret pool, none of them granted", async () => {
        const detailed = await setupWeaponTrick(20);
        const loremasterFeats = detailed.components.classes
          .getCharacterClasses()
          ["loremaster"].levels.flatMap((level) => level.feats.map((f) => f.name));
        expect(loremasterFeats.filter((name) => name.startsWith("Secret")).sort()).toEqual([
          "Secret (Loremaster)",
          "Secret: Weapon Trick (Loremaster Secret)",
        ]);
        expect(detailed.components.aptitudes.getAptitudes()["loremastersecret"]).toMatchObject({
          allowed: 1,
          spent: 1,
        });
      });

      test("give a secret's bonus once her loremaster level plus her Intelligence modifier reach its row", async () => {
        // Weapon Trick, the sixth row: +1 on attack rolls at loremaster 1 with Intelligence 20 (+5), none with 18 (+4).
        // Once on her quarterstaff, though it's both a quarterstaff and a simple weapon
        const tohit = async (intelligence: number) =>
          (await setupWeaponTrick(intelligence)).components.weapons.getWeapons()["quarterstaff"]["0_twohanded"].tohit
            .misc;
        expect([await tohit(20), await tohit(18)]).toEqual([1, 0]);
      });
    });

    describe("tags", () => {
      test("mark a cleric's domain spells and a specialist's school", async () => {
        const theronTags = Object.values((await buildSeeded("Theron Lightbringer")).getSpellTags()).flat();
        expect(theronTags).toEqual(expect.arrayContaining(["Healing Domain", "Sun Domain"]));

        const elara = await buildSeeded("Elara Starweaver");
        const tags = elara.getSpellTags();
        const byName = Object.fromEntries(allPowers(elara).map((p) => [p.name, tags[p.id] ?? []]));
        expect(byName["Magic Missile"]).toContain("Evocation Specialist");
        expect(byName["Burning Hands"]).toContain("Evocation Specialist");
        expect(byName["Web"]).not.toContain("Evocation Specialist");

        expect((await buildSeeded("Bjorn Ironhand")).getSpellTags()).toEqual({});
      });
    });

    test("give a spell known through two classes each class's DC: its level on that list and that class's ability", async () => {
      // Hold Person is a 3rd-level wizard spell and a 2nd-level bard spell: Intelligence 16 (+3), Charisma 12 (+1)
      const ctx = await getSeedCtx();
      const characterId = await seedHuman("Two Casters", { ...WIZARD_SCORES, Charisma: 12 }, { xp: 1000 });
      const wizardLevel = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
      const bardLevel = await addClassLevels(db, ctx, characterId, "Bard", [1], [6]);
      await addFeats(db, ctx, wizardLevel, [
        { levelIndex: 0, featName: "Spell Focus: Enchantment", aptitude: "General" },
      ]);
      await addPowers(db, ctx, wizardLevel, [{ levelIndex: 0, powerName: "Hold Person", aptitude: "Wizard Spells" }]);
      await addPowers(db, ctx, bardLevel, [{ levelIndex: 0, powerName: "Hold Person", aptitude: "Bard Spells" }]);
      const record = (await Characters.findOne(db, { id: characterId }))!;
      const detailed = await build(record);

      // Spell Focus: Enchantment adds 1 to both
      const dcs = detailed.components.powers.getPower("Hold Person")?.dc;
      expect({ wizard: dcs?.["wizard"]?.total, bard: dcs?.["bard"]?.total }).toEqual({
        wizard: 10 + 3 + 3 + 1,
        bard: 10 + 2 + 1 + 1,
      });
      // The sheet's spell lists show each class's
      const lists = CharacterResponse.buildFull(record, detailed).spellGroups;
      const holdPerson = (list: string, level: number) =>
        lists
          .find((apt) => apt.aptitudeName === list)
          ?.levels.find((group) => group.level === level)
          ?.spells.find((spell) => spell.name === "Hold Person")?.dc;
      expect([holdPerson("Wizard Spells", 3), holdPerson("Bard Spells", 2)]).toEqual([17, 14]);
    });

    describe("granted by a feat's modifier", () => {
      test("are known, next to those picked", async () => {
        const spells = (await setupGrantedSpell()).components.powers;
        expect(
          ["magicmissile", "detectmagic", "burninghands"].map((spell) => spells.getSpellEntry(spell, "wizard")?.known),
        ).toEqual([true, true, false]);
      });

      test("aren't held to their own prerequisites", async () => {
        // Magic Missile needs wizard 5 here; the grant is the gate.
        const detailed = await setupGrantedSpell({ requirement: true });
        expect(detailed.components.powers.getSpellEntry("magicmissile", "wizard")?.known).toBe(true);
        expect(requirementIssues(detailed).find((issue) => issue.entityName === "Magic Missile")).toBeUndefined();
      });

      test("list each of their properties' values, in the books' order", async () => {
        // Magic Missile's components: Verbal and Somatic, on a sheet's granted spells as on its others
        const virtualPowers = (await setupGrantedSpell()).getVirtualPowers();
        expect(virtualPowers.find((power) => power.name === "Magic Missile")?.properties).toMatchObject({
          SPELL_COMPONENT: "Verbal, Somatic",
          SPELL_SCHOOL: "Evocation",
        });
      });

      test("get the school's DC bonuses", async () => {
        // 10 + 1 + INT 16 (+3) + Spell Focus: Evocation.
        const granted = (await setupGrantedSpell({ spellFocus: true })).getVirtualPowers();
        expect(granted.find((power) => power.name === "Magic Missile")).toMatchObject({ dc: 15 });
      });
    });

    describe("the highest spell level cast, by kind", () => {
      test("counts arcane and divine casting apart", async () => {
        expect((await buildSeeded("Elara Starweaver")).getSpellcasting()).toMatchObject({ arcane: 2, divine: 0 });
        expect((await buildSeeded("Theron Lightbringer")).getSpellcasting()).toMatchObject({ arcane: 0, divine: 2 });
        expect((await buildSeeded("Bjorn Ironhand")).getSpellcasting()).toMatchObject({ arcane: 0, divine: 0 });
      });

      test("can be required", async () => {
        const elara = await buildSeeded("Elara Starweaver");
        const atLeast = (target: string) =>
          requiring(target, { operator: "greater_than_or_equal", value: "2", valueType: "number" });
        expect(elara.areRequirementsMet(atLeast("spellcasting.arcane"))).toBe(true);
        expect(elara.areRequirementsMet(atLeast("spellcasting.divine"))).toBe(false);
      });

      test("counts while projecting a prestige class that requires it", async () => {
        // Regression: the value was 0 or 1 during the build, so a cleric 5 failed the Thaumaturgist's divine 3.
        const ctx = await getSeedCtx();
        const fork = await forkWith(DND35_DMG_NAME);
        const characterId = await seedHuman(
          "Thaumaturgist Candidate",
          { Strength: 10, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
          { xp: 15000, rulesetId: fork.id },
        );
        const levelIds = await addClassLevels(db, ctx, characterId, "Cleric", [1, 2, 3, 4, 5], [8, 6, 7, 6, 7]);
        const skills = ["Concentration", "Heal", "Knowledge (Religion)", "Spellcraft"];
        await addSkills(
          db,
          ctx,
          levelIds,
          levelIds.flatMap((_, levelIndex) =>
            skills.map((skillName) => ({ levelIndex, skillName, rank: levelIndex === 0 ? 4 : 1 })),
          ),
        );
        await addFeats(db, ctx, levelIds, [
          { levelIndex: 0, featName: "Spell Focus: Conjuration", aptitude: "General" },
          { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
          { levelIndex: 0, featName: "Healing Domain", aptitude: "Cleric Domain" },
          { levelIndex: 0, featName: "Sun Domain", aptitude: "Cleric Domain" },
          { levelIndex: 2, featName: "Toughness", aptitude: "General" },
        ]);
        const thaumaturgist = (await Klasses.findOne(db, {
          name: "Thaumaturgist",
          rulesetId: (await findSeededRuleset(DND35_DMG_NAME)).id,
        }))!;
        const firstLevel = (await findKlassLevel(thaumaturgist.id, 1))!;

        const record = (await Characters.findOne(db, { id: characterId }))!;
        const detailed = await buildAs(DetailedCharacter, record, {
          project: (projection) => projection.addLevel(firstLevel.id, { hp: 4 }),
        });
        expect(requirementIssues(detailed)).toEqual([]);
      });
    });
  });

  describe("encumbrance", () => {
    test("keeps a modifier to the carried weight, whoever carries it", async () => {
      // A race's +100 lbs: the sheet's encumbrance is the encumbrance's own, which the modifier changes
      const { rulesetId } = await getSeedCtx();
      for (const name of ["Lyra Shadowstep", "Bjorn Ironhand"]) {
        const carried = async () => (await buildSeeded(name)).components.combat.getCombat().encumbrance.carriedweight;
        const before = await carried();
        const character = await findSeededCharacter(name);
        const [modifier] = await Modifiers.create(db, {
          sourceId: character.raceId,
          sourceType: "races",
          target: "combat.encumbrance.carriedweight",
          operator: "add",
          value: "100",
          valueType: "number",
        });
        invalidateSeededRuleset(rulesetId);
        expect(await carried()).toBe(before + 100);
        await Modifiers.delete(db, { id: modifier.id });
        invalidateSeededRuleset(rulesetId);
      }
    });

    test("is what a modifier's requirements read, with the rest of the sheet's totals", async () => {
      // +5 initiative while under a medium load and with a grapple of 1 or more: Bjorn, STR 18, with 4 barrels
      const bjorn = await findSeededCharacter("Bjorn Ironhand");
      const [modifier] = await Modifiers.create(db, {
        sourceId: bjorn.raceId,
        sourceType: "races",
        target: "combat.initiative.misc",
        operator: "add",
        value: "5",
        valueType: "number",
      });
      const gate = (level: string, target: string, operator: string, value: string, valueType: string) => ({
        entityId: modifier.id,
        entityType: "modifiers",
        level,
        target,
        operator,
        value,
        valueType,
      });
      await Requirements.create(db, gate("1", "combat.encumbrance.load", "equal", "medium", "string"));
      await Requirements.create(db, gate("2", "combat.grapple.total", "greater_than_or_equal", "1", "number"));
      invalidateSeededRuleset((await getSeedCtx()).rulesetId);

      const initiative = async (barrels: number) => {
        await carry(bjorn, barrels ? [{ item: "Barrel (empty)", quantity: barrels, equipped: false }] : []);
        return (await build(bjorn)).components.combat.getCombat().initiative.misc;
      };
      expect([await initiative(4), await initiative(0)]).toEqual([5, 0]);
    });

    test("weighs the inventory against the character's strength", async () => {
      // STR 18: loads of 100, 200 and 300 lbs; the seeded inventory weighs 95.
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const light = {
        heavyload: 300,
        mediumload: 200,
        lightload: 100,
        carriedweight: 95,
        load: "light",
        maxdex: Infinity,
        checkpenalty: 0,
      };
      expect(bjorn.components.encumbrance.getEncumbrance()).toMatchObject(light);
      expect(bjorn.components.combat.getCombat().encumbrance).toMatchObject({
        load: "light",
        heavyload: 300,
        carriedweight: 95,
      });

      expect((await buildCarrying("Bjorn Ironhand")).components.encumbrance.getEncumbrance()).toMatchObject({
        carriedweight: 0,
        load: "light",
        maxdex: Infinity,
        checkpenalty: 0,
      });
      // Weight times quantity: ten 1 lb torches.
      expect(
        (
          await buildCarrying("Bjorn Ironhand", [{ item: "Torch", quantity: 10, equipped: false }])
        ).components.encumbrance.getEncumbrance().carriedweight,
      ).toBe(10);
    });

    test.each([
      // STR 8 and STR 20 (a half-orc's 18 + 2).
      ["Elara Starweaver", { heavyload: 80, mediumload: 53, lightload: 26 }],
      ["Grak Thunderfist", { heavyload: 400, mediumload: 266, lightload: 133 }],
    ])("sets %s's loads by strength", async (name, loads) => {
      expect((await buildSeeded(name)).components.encumbrance.getEncumbrance()).toMatchObject(loads);
    });

    test.each([
      // Full plate, a barrel, a chest and rope.
      [
        "medium",
        [
          { item: "Full Plate", location: "Torso" },
          { item: "Barrel (empty)", equipped: false },
          { item: "Chest (empty)", equipped: false },
          { item: "Rope, hempen (50 ft.)", equipped: false },
        ],
        { carriedweight: 115, maxdex: 3, checkpenalty: -3 },
      ],
      [
        "heavy",
        [{ item: "Barrel (empty)", quantity: 7, equipped: false }],
        { carriedweight: 210, maxdex: 1, checkpenalty: -6 },
      ],
      [
        "overloaded",
        [{ item: "Barrel (empty)", quantity: 11, equipped: false }],
        { carriedweight: 330, maxdex: 0, checkpenalty: -6 },
      ],
    ] as [string, Carried[], object][])(
      "of a %s load caps dexterity and costs checks",
      async (load, carried, expected) => {
        expect((await buildCarrying("Bjorn Ironhand", carried)).components.encumbrance.getEncumbrance()).toMatchObject({
          load,
          ...expected,
        });
      },
    );

    test("slows the character", async () => {
      const barrels = (quantity: number): Carried[] => [{ item: "Barrel (empty)", quantity, equipped: false }];
      expect((await buildCarrying("Bjorn Ironhand", barrels(4))).components.combat.getCombat()).toMatchObject({
        encumbrance: { load: "medium" },
        speed: { base: 30, total: 20 },
      });
      expect((await buildCarrying("Bjorn Ironhand", barrels(11))).components.combat.getCombat()).toMatchObject({
        encumbrance: { load: "overloaded" },
        speed: { total: 5 },
      });
      // A dwarf keeps its speed under a medium load, the barbarian's fast movement with it: only a heavy load stops that
      const kael = (await buildCarrying("Kael Stormborn", barrels(3))).components.combat.getCombat();
      expect(kael).toMatchObject({ encumbrance: { load: "medium" }, speed: { base: 30, total: 30 } });
    });

    test("caps dexterity in armor class and costs weight-affected skills, swim double, unless the armor costs more", async () => {
      // A heavy load's max dex 1, over DEX 14's +2.
      expect(
        (
          await buildCarrying("Bjorn Ironhand", [{ item: "Barrel (empty)", quantity: 7, equipped: false }])
        ).components.combat.getCombat(),
      ).toMatchObject({ encumbrance: { maxdex: 1 }, ac: { dexterity: 1, total: 11 } });

      const skills = async (carried: Carried[]) => {
        const { swim, climb } = (await buildCarrying("Bjorn Ironhand", carried)).components.skills.getSkills();
        return [swim?.weight, climb?.weight];
      };
      // A medium load's -3, twice that on Swim.
      expect(await skills([{ item: "Barrel (empty)", quantity: 4, equipped: false }])).toEqual([6, 3]);
      // Chain mail's -5 wins over the medium load's -3.
      expect(
        await skills([
          { item: "Chain Mail", location: "Torso" },
          { item: "Barrel (empty)", quantity: 3, equipped: false },
        ]),
      ).toEqual([10, 5]);
    });
  });
  describe("a class's own customizations", () => {
    test("give a dragon disciple its ability boosts", async () => {
      const ctx = await getSeedCtx();
      const fork = await forkWith(DND35_DMG_NAME);
      const characterId = await seedHuman("Dragon Blooded", { ...WIZARD_SCORES, Strength: 12 }, { rulesetId: fork.id });
      await addClassLevels(db, ctx, characterId, "Sorcerer", [1], [4]);
      const dragonDisciple = (await Klasses.findOne(db, {
        name: "Dragon Disciple",
        rulesetId: (await findSeededRuleset(DND35_DMG_NAME)).id,
      }))!;
      const strength = async () => {
        const { misc, total } = (
          await build((await Characters.findOne(db, { id: characterId }))!)
        ).components.abilities.getAbilities().strength;
        return { misc, total };
      };
      await addCharacterLevel(characterId, (await findKlassLevel(dragonDisciple.id, 1))!.id);
      expect(await strength()).toEqual({ misc: 0, total: 12 });
      // The second level's +2 Strength
      await addCharacterLevel(characterId, (await findKlassLevel(dragonDisciple.id, 2))!.id);
      expect(await strength()).toEqual({ misc: 2, total: 14 });
    });

    test("give a character with any level of the class its modifiers, once", async () => {
      const ctx = await getSeedCtx();
      const [lyraBefore, bjornBefore] = [await buildSeeded("Lyra Shadowstep"), await buildSeeded("Bjorn Ironhand")];
      await Modifiers.create(db, {
        sourceId: ctx.klassMap.pc["Rogue"],
        sourceType: "klasses",
        target: "abilities.dexterity.misc",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      invalidateSeededRuleset(ctx.rulesetId);
      // Lyra is a rogue 3, Bjorn has no rogue level
      expect(dexterityMisc(await buildSeeded("Lyra Shadowstep"))).toBe(dexterityMisc(lyraBefore) + 1);
      expect(dexterityMisc(await buildSeeded("Bjorn Ironhand"))).toBe(dexterityMisc(bjornBefore));
    });

    test("check its requirements, unmet ones keeping its modifiers off", async () => {
      const ctx = await getSeedCtx();
      const rogue = ctx.klassMap.pc["Rogue"];
      const lyraBefore = await buildSeeded("Lyra Shadowstep");
      await Modifiers.create(db, {
        sourceId: rogue,
        sourceType: "klasses",
        target: "abilities.dexterity.misc",
        value: "1",
        valueType: "number",
        operator: "add",
      });
      await Requirements.create(db, {
        entityId: rogue,
        entityType: "klasses",
        level: "1",
        target: "abilities.strength.total",
        operator: "greater_than_or_equal",
        value: "30",
        valueType: "number",
      });
      invalidateSeededRuleset(ctx.rulesetId);
      const lyra = await buildSeeded("Lyra Shadowstep");
      expect(requirementIssues(lyra).map((issue) => issue.message)).toContain("Unmet prerequisite on Rogue (klasses)");
      expect(dexterityMisc(lyra)).toBe(dexterityMisc(lyraBefore));
    });
  });

  describe("requirements on feats", () => {
    const atLeastOne = { operator: "greater_than_or_equal", value: "1", valueType: "number" } as const;

    // Bjorn has Weapon Focus: Longsword and no Spell Focus; Elara, Spell Focus: Evocation and no Weapon Focus.
    test("a family is met by any of its feats, and only by them", async () => {
      expect(await met("Bjorn Ironhand", "feats.weaponfocus.*.possessed")).toBe(true);
      expect(await met("Elara Starweaver", "feats.weaponfocus.*.possessed")).toBe(false);
      expect(await met("Bjorn Ironhand", "feats.spellfocus.*.possessed")).toBe(false);
      expect(await met("Elara Starweaver", "feats.spellfocus.*.possessed")).toBe(true);
      expect(await met("Bjorn Ironhand", "feats.weaponfocus.*.count", atLeastOne)).toBe(true);
      expect(await met("Elara Starweaver", "feats.weaponfocus.*.count", atLeastOne)).toBe(false);
    });

    test("a family's count is how many times the character has its feats, every class's sneak attack dice together", async () => {
      expect(await met("Elara Starweaver", "feats.spellfocus.count", exactly(1))).toBe(true);
      expect(await met("Bjorn Ironhand", "feats.spellfocus.count", exactly(0))).toBe(true);
      // A rogue 3 has her Sneak Attack (Rogue) twice: +2d6
      expect(await met("Lyra Shadowstep", "feats.sneakattack.count", exactly(2))).toBe(true);

      // An assassin level adds its +1d6, from a feat of its own
      const ctx = await getSeedCtx();
      const fork = await forkWith(DND35_DMG_NAME);
      const characterId = await seedHuman(
        "Two Sneak Attacks",
        { Strength: 10, Dexterity: 16, Constitution: 12, Intelligence: 12, Wisdom: 10, Charisma: 10 },
        { rulesetId: fork.id },
      );
      await addClassLevels(db, ctx, characterId, "Rogue", [1, 2, 3], [6, 4, 4]);
      const assassin = (await Klasses.findOne(db, {
        name: "Assassin",
        rulesetId: (await findSeededRuleset(DND35_DMG_NAME)).id,
      }))!;
      await addCharacterLevel(characterId, (await findKlassLevel(assassin.id, 1))!.id);
      const detailed = await build((await Characters.findOne(db, { id: characterId }))!);
      expect(detailed.areRequirementsMet(requiring("feats.sneakattack.count", exactly(3)))).toBe(true);
      // Each class's alone is less
      const threeOfOne = { operator: "greater_than_or_equal", value: "3", valueType: "number" } as const;
      expect(detailed.areRequirementsMet(requiring("feats.sneakattack.*.count", threeOfOne))).toBe(false);
    });

    test("a feat named like its family is that feat, and the family's wildcard reaches the family's feats", async () => {
      // Martial Weapon Proficiency is every martial weapon, a fighter's. A rogue has some, each a feat of the family,
      // and so has an elf, by her race; a sorcerer, none
      expect(await met("Bjorn Ironhand", "feats.martialweaponproficiency.possessed")).toBe(true);
      expect(await met("Bjorn Ironhand", "feats.martialweaponproficiency.count", exactly(1))).toBe(true);
      expect(await met("Bjorn Ironhand", "feats.martialweaponproficiency.*.possessed")).toBe(false);
      expect(await met("Lyra Shadowstep", "feats.martialweaponproficiency.possessed")).toBe(false);
      expect(await met("Lyra Shadowstep", "feats.martialweaponproficiency.*.possessed")).toBe(true);
      expect(await met("Elara Starweaver", "feats.martialweaponproficiencylongsword.possessed")).toBe(true);
      expect(await met("Vex Flamecaller", "feats.martialweaponproficiency.*.possessed")).toBe(false);
    });

    test("a family no feat of the ruleset is in is unmet, not invalid: another book's ki power", async () => {
      // Bjorn's rules are the core's: Ki Power and Skirmish feats are Complete Adventurer's
      const bjorn = await buildSeeded("Bjorn Ironhand");
      const atLeastTwo = { operator: "greater_than_or_equal", value: "2", valueType: "number" } as const;
      for (const groups of [requiring("feats.kipower.*.possessed"), requiring("feats.skirmish.count", atLeastTwo)]) {
        expect(bjorn.areRequirementsMet(groups)).toBe(false);
        expect(bjorn.getUnmetRequirementIssues(groups).filter((issue) => issue.message.startsWith("Invalid"))).toEqual(
          [],
        );
      }
    });

    test("a family's name alone, or a name that only starts a feat's, names no feat", async () => {
      expect(await met("Bjorn Ironhand", "feats.weaponfocus.possessed")).toBe(false);
      // Power Attack
      expect(await met("Bjorn Ironhand", "feats.power.possessed")).toBe(false);
      const issues = (await buildSeeded("Bjorn Ironhand")).getUnmetRequirementIssues(
        requiring("feats.power.possessed"),
      );
      expect(issues.map((issue) => issue.message)).toEqual(["Invalid requirement: Element not found: power"]);
    });

    test("a feat's name reaches that feat, not one whose name it starts: a monk's weapons aren't all simple ones", async () => {
      // Zen's monk proficiencies are Simple Weapon Proficiency: Club, Dagger… and, by the monk's, Unarmed Strike
      expect(await met("Zen Whitepetal", "feats.simpleweaponproficiencyclub.possessed")).toBe(true);
      expect(await met("Zen Whitepetal", "feats.simpleweaponproficiencyunarmedstrike.possessed")).toBe(true);
      expect(await met("Zen Whitepetal", "feats.simpleweaponproficiency.possessed")).toBe(false);
    });

    test("a skill's name still reaches its subtypes", async () => {
      expect(await met("Elara Starweaver", "skills.knowledge.rank", atLeastOne)).toBe(true);
    });

    test("a check that reaches nothing isn't met", async () => {
      // Bjorn knows no spell, so no evocation spell's DC
      const dc = { operator: "greater_than", value: "0", valueType: "number" } as const;
      expect(await met("Bjorn Ironhand", "powers.groups.evocation.*.dc.total", dc)).toBe(false);
      expect(await met("Elara Starweaver", "powers.groups.evocation.*.dc.total", dc)).toBe(true);
    });
  });
});
