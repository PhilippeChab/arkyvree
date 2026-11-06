import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import type { ClassSeeds } from "@/codegen/pf1/tools/seeds/classes/ClassSeeds.ts";
import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { Engine } from "@/engine/index.ts";
import CombatPaths from "@/engine/rulesets/pf1/model/combat/CombatPaths.ts";
import ItemsPaths from "@/engine/rulesets/pf1/model/combat/ItemsPaths.ts";
import type { OperatorKind } from "@/shared/customization/target.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

/** The paths a target may name that its entities give, not the book's: feats, aptitudes, classes, languages, bonds. */
const ENTITY_PATHS = [
  /^feats\.[a-z0-9]+\.(?:possessed|count)$/,
  /^aptitudes\.[a-z0-9]+(?:\.\d)?\.(?:allowed|uses)$/,
  /^classes\.[a-z0-9]+\.(?:level|bonuscasterlevel)$/,
  /^languages\.(?:[a-z]+\.known|extrapicks)$/,
  /^bonded\.(?:familiar|animalcompanion|mount)\.level$/,
];

/** The book's class seeds, by their class's name. */
function bookClasses(): Map<string, ClassSeeds> {
  const book = new BookSeeds("core-rulebook");
  return new Map(book.classReferences().map((ref) => [book.classes(ref).seed().name, book.classes(ref)]));
}

/** The engine's paths of `kind` a book's content can name, every character's encumbrance and unarmed strike's too. */
function enginePaths(kind: OperatorKind): Set<string> {
  const names = { abilities: ABILITY_NAMES, saves: SAVE_NAMES, skills: [...SKILL_NAMES] };
  return new Set(
    [
      ...Engine.forRules(PF1_BASE_RULES).listBookTargetPaths(names, kind),
      ...CombatPaths.generateEncumbrancePaths(kind),
      ...ItemsPaths.generateWeaponPaths(["unarmedstrike"], kind),
    ].map(({ path }) => path),
  );
}

/** The targets a modifier and its requirements name, each by the kind of path it is. */
function modifierTargets(modifier: ModifierSeed): [string, OperatorKind][] {
  return [
    [modifier.target, "modifier"],
    ...(modifier.requirements ?? [])
      .flatMap(targetsOf)
      .map((target): [string, OperatorKind] => [target, "requirement"]),
  ];
}

/** A class's seeds, by its name. */
function seedsOf(name: string): ClassSeeds {
  const seeds = bookClasses().get(name);
  if (!seeds) throw new Error(`No class ${name}`);
  return seeds;
}

/** A requirement's targets, its children's for a group. */
function targetsOf(requirement: RequirementEntry): string[] {
  return "chainingOperator" in requirement ? requirement.children.flatMap(targetsOf) : [requirement.target];
}

describe("The Core Rulebook's classes' seeds", () => {
  test("read its 11 base, 5 NPC and 10 prestige classes, the Pathfinder Chronicler as the Chronicler", () => {
    const classes = bookClasses();
    expect(classes.size).toBe(26);
    expect(classes.has("Chronicler")).toBe(true);
    expect([...classes.values()].filter((seeds) => seeds.ref.raw.prestige)).toHaveLength(10);
    expect(seedsOf("Chronicler").seed().levels).toBe(10);
    expect(seedsOf("Expert").seed().levels).toBe(20);
  });

  test("read a class's hit die, skill points, progressions and class skills", () => {
    const fighter = seedsOf("Fighter").seed();
    expect(fighter.fields).toEqual({ CLASS_HD: 10 });
    expect(fighter.skillPoints).toBe(2);
    expect(fighter.bab).toBe("good");
    expect(fighter.saves).toEqual({ fortitude: "good", reflex: "poor", will: "poor" });
    expect(fighter.classSkills).toContain("Knowledge (Dungeoneering)");
    expect(fighter.classSkills).toContain("Craft");
    expect(
      seedsOf("Wizard")
        .seed()
        .classSkills.filter((skill) => skill.startsWith("Knowledge")),
    ).toHaveLength(10);
    // A prestige class's saves are its own: a good one +1 at its 1st level, +5 at its 10th; a poor one +0, +3
    expect(seedsOf("Duelist").seed().saves).toEqual({
      fortitude: "prestigePoor",
      reflex: "prestigeGood",
      will: "prestigePoor",
    });
  });

  test("read its features into feats of its Class Feature pool, the feats it grants and its bonus feats' picks", () => {
    const fighter = seedsOf("Fighter");
    expect(fighter.seed().classFeatures).toContainEqual([2, "Bravery (Fighter)"]);
    const bonusFeats = fighter.classFeats().find(({ name }) => name === "Bonus Feats (Fighter)");
    expect(bonusFeats?.modifiers).toEqual([
      { target: "aptitudes.fighterbonusfeat.allowed", operator: "add", value: "1", valueType: "number" },
    ]);
    expect(bonusFeats?.fields).toEqual({ FEAT_SELECTABLE: false, FEAT_STACKABLE: true });
    expect(seedsOf("Wizard").seed().freeFeats).toEqual([[1, "Scribe Scroll", "Wizard Class Feature"]]);
    expect(seedsOf("Monk").seed().freeFeats).toContainEqual([1, "Improved Unarmed Strike", "Monk Class Feature"]);
    // A cleric chooses two domains, and has a domain slot at each spell level she casts
    const domains = seedsOf("Cleric")
      .classFeats()
      .find(({ name }) => name === "Domains (Cleric)");
    expect(domains?.modifiers?.[0]).toEqual({
      target: "aptitudes.clericdomain.allowed",
      operator: "add",
      value: "2",
      valueType: "number",
    });
    expect(domains?.modifiers?.filter(({ target }) => target.startsWith("aptitudes.domainspells."))).toHaveLength(9);
  });

  test("give a monk's and a ranger's bonus feats a pool a tier", () => {
    const monk = seedsOf("Monk");
    expect(monk.bonusFeatLists().map(({ aptitude }) => aptitude)).toEqual([
      "Monk Bonus Feat (1st)",
      "Monk Bonus Feat (6th)",
      "Monk Bonus Feat (10th)",
    ]);
    expect(monk.seed().classFeatures).toContainEqual([14, "Bonus Feat 10th (Monk)"]);
    expect(seedsOf("Ranger").bonusFeatLists()[0].feats).toContain("Rapid Shot");
  });

  test("read a bard's bardic performances off its text, each a feature at its levels", () => {
    const bard = seedsOf("Bard");
    expect(bard.seed().classFeatures).toContainEqual([8, "Dirge of Doom (Bard)"]);
    const courage = bard.classFeats().find(({ name }) => name === "Inspire Courage (Bard)");
    expect(courage?.description).toStartWith("A 1st-level bard can use his performance to inspire courage");
  });

  test("read its spells: a wizard's slots and spellbook, a sorcerer's spells known, a paladin's from the 1st level", () => {
    const wizard = seedsOf("Wizard").seed();
    expect(wizard.links).toEqual({ bonusSpellAbility: "Intelligence" });
    expect(wizard.spells?.slug).toBe("wizardspells");
    expect(wizard.spells?.perDay[0]).toEqual([3, 1]);
    // At 3rd level: every cantrip, as at 1st, five 1st-level spells and two 2nd-level ones
    const known = wizard.spells?.known ?? [];
    expect(known[2]?.[0]).toBe(known[0]?.[0]);
    expect(known[2]?.slice(1)).toEqual([5, 2]);
    const sorcerer = seedsOf("Sorcerer").seed().spells;
    expect(sorcerer?.perDay[0]).toEqual([4, 3]);
    expect(sorcerer?.known?.[0]).toEqual([4, 2]);
    const paladin = seedsOf("Paladin").seed().spells;
    expect(paladin).toMatchObject({ knowAll: true, noCantrips: true });
    expect(paladin?.perDay.slice(2, 5)).toEqual([[], [0], [1]]);
  });

  test("read a prestige class's requirements and the caster levels it adds", () => {
    const duelist = seedsOf("Duelist").seed();
    expect(duelist.requirements).toContainEqual({
      target: "combat.bab",
      operator: "greater_than_or_equal",
      value: "6",
      valueType: "number",
    });
    expect(duelist.requirements).toContainEqual({
      target: "skills.acrobatics.rank",
      operator: "greater_than_or_equal",
      value: "2",
      valueType: "number",
    });
    expect(seedsOf("Mystic Theurge").seed().casterLevelAdvancement).toEqual({
      type: "dual",
      levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
    expect(seedsOf("Arcane Archer").seed().casterLevelAdvancement?.type).toBe("arcane");
  });

  test("name only target paths the engine has", () => {
    const paths = { modifier: enginePaths("modifier"), requirement: enginePaths("requirement") };
    const invalid = [...bookClasses().values()].flatMap((seeds) => {
      const seed = seeds.seed();
      const targets: [string, OperatorKind][] = [
        ...(seed.requirements ?? [])
          .flatMap(targetsOf)
          .map((target): [string, OperatorKind] => [target, "requirement"]),
        ...(seed.modifiers ?? []).flatMap(modifierTargets),
        ...seeds
          .classFeats()
          .flatMap((feat) => [
            ...(feat.modifiers ?? []).flatMap(modifierTargets),
            ...(feat.requirements ?? [])
              .flatMap(targetsOf)
              .map((target): [string, OperatorKind] => [target, "requirement"]),
          ]),
      ];
      return targets
        .filter(([target, kind]) => !paths[kind].has(target) && !ENTITY_PATHS.some((path) => path.test(target)))
        .map(([target]) => `${seed.name}: ${target}`);
    });
    expect(invalid).toEqual([]);
  });

  test("list what they leave unread", () => {
    expect(seedsOf("Expert").unread()).toEqual(["class skill: any 10 skills"]);
    expect(seedsOf("Fighter").unread()).toEqual([]);
  });
});
