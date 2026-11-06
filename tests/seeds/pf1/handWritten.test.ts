import { describe, expect, test } from "bun:test";

import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { specialistSpells } from "@/content/pf1/builders/aptitudes/names.ts";
import type { BondContent } from "@/content/pf1/builders/bonds/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { ANIMAL_COMPANIONS } from "@/content/pf1/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/content/pf1/data/bonds/familiars.ts";
import { BONDED_MOUNTS } from "@/content/pf1/data/bonds/mounts.ts";
import { SKILLS } from "@/content/pf1/data/coreRules.ts";
import { buildCoreFeats } from "@/content/pf1/data/feats/coreFeats.ts";
import { WIZARD_SCHOOLS } from "@/content/pf1/data/wizardSchools.ts";
import Modules from "@/engine/api/Modules.ts";
import { Engine } from "@/engine/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { BONDED_RACE_STATS, FAMILIAR_MASTER_BONUSES } from "@/vocabulary/pf1/bondedCreatures.ts";
import { BONDED_KINDS } from "@/vocabulary/pf1/bondedKinds.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

const BONDS: BondContent[] = [FAMILIARS, ANIMAL_COMPANIONS, BONDED_MOUNTS];
const CORE_FEATS = buildCoreFeats();
const FEATS = [...CORE_FEATS, ...BONDS.flatMap((bond) => bond.feats)];
/** The aptitudes the hand-written content names: its feats', its bonds', and the arcane schools' specialist lists. */
const APTITUDES = new Set([
  ...FEATS.flatMap((feat) => feat.aptitudes),
  ...BONDS.flatMap((bond) => bond.aptitudes),
  ...WIZARD_SCHOOLS.map((school) => specialistSpells(school.name)),
]);

/** A requirement's checks, a group's children's among them. */
function checksOf(requirements: RequirementEntry[] = []): { operator: string; target: string }[] {
  return requirements.flatMap((r) => ("chainingOperator" in r ? checksOf(r.children) : [r]));
}

/** Why the PF1 engine wouldn't take a target with its operator, or undefined when it would. */
function findTargetError(kind: "modifier" | "requirement", target: string, operator: string) {
  const names = { abilities: ABILITY_NAMES, saves: SAVE_NAMES, skills: [...SKILL_NAMES] };
  const offered = Engine.forRules(PF1_BASE_RULES)
    .listBookTargetPaths(names, kind)
    .find((path) => path.path === target);
  if (offered) return offered.operators.includes(operator) ? undefined : `${target} takes no ${operator}`;
  const [category, slug] = target.split(".");
  const feats = new Set(FEATS.map((feat) => stripSeparators(feat.name)));
  const aptitudes = new Set([...APTITUDES].map(stripSeparators));
  if (/^feats\.\w+\.possessed$/.test(target)) return feats.has(slug) ? undefined : `${target} names no feat`;
  if (/^aptitudes\.\w+\.allowed$/.test(target)) return aptitudes.has(slug) ? undefined : `${target} names no aptitude`;
  if (/^classes\.\w+\.level$/.test(target) && kind === "requirement") return undefined;
  if (/^bonded\.\w+\.race$/.test(target))
    return BONDED_KINDS.some((b) => b.slug === slug) ? undefined : `${target} names no bonded kind`;

  return `${target} is no path of ${category}`;
}

/** The hand-written content's modifiers and requirements, each with its owner. */
function listCustomizations(feats: FeatSeed[]) {
  return feats.flatMap(({ modifiers = [], name, requirements }) => [
    ...modifiers.flatMap((m: ModifierSeed) => [
      { name, kind: "modifier" as const, target: m.target, operator: m.operator, value: m.value },
      ...checksOf(m.requirements).map((r) => ({ name, kind: "requirement" as const, ...r, value: undefined })),
    ]),
    ...checksOf(requirements).map((r) => ({ name, kind: "requirement" as const, ...r, value: undefined })),
  ]);
}

describe("The hand-written Pathfinder content", () => {
  test("targets the paths the Pathfinder engine offers, with operators it offers there", () => {
    const errors = listCustomizations(FEATS).flatMap(({ kind, name, operator, target }) => {
      const error = findTargetError(kind, target, operator);
      return error ? [`${name}: ${error}`] : [];
    });
    expect(errors).toEqual([]);
  });

  test("grants a feat as the engine takes a grant: one feat, set true", () => {
    const targetPaths = Modules.of(PF1_BASE_RULES).targetPaths;
    const errors = listCustomizations(FEATS).flatMap(({ kind, name, target, value }) => {
      const error = kind === "modifier" && value !== undefined ? targetPaths.findGrantError(target, value) : undefined;
      return error ? [`${name}: ${error}`] : [];
    });
    expect(errors).toEqual([]);
  });

  test("names each feat once, by a slug of its own", () => {
    const slugs = FEATS.map((feat) => stripSeparators(feat.name));
    expect(slugs.filter((slug, i) => slugs.indexOf(slug) !== i)).toEqual([]);
  });

  test("gives every weapon its proficiency, and the cleric's favored weapon the weapon's", () => {
    const names = new Set(CORE_FEATS.map((feat) => feat.name));
    const favored = CORE_FEATS.filter((feat) => feat.name.startsWith("Deity's Favored Weapon: "));
    const missing = favored.flatMap(({ modifiers = [] }) =>
      modifiers.filter(
        ({ target }) => ![...names].some((name) => target === `feats.${stripSeparators(name)}.possessed`),
      ),
    );
    expect(favored.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  test("has the Core Rulebook's arcane schools: eight specialties opposing two schools each, and the universalist", () => {
    const names = new Set(CORE_FEATS.map((feat) => feat.name));
    const specialties = WIZARD_SCHOOLS.filter((school) => school.prohibitedSchoolCount > 0);
    expect(specialties.map((school) => school.prohibitedSchoolCount)).toEqual(Array(8).fill(2));
    expect(
      specialties.every(({ name }) => names.has(`${name} Specialist`) && names.has(`Opposition School: ${name}`)),
    ).toBe(true);
    expect(names.has("Universalist")).toBe(true);
    expect(names.has("Universalist Specialist")).toBe(false);
  });
});

describe("The Pathfinder bonded creatures", () => {
  test.each(BONDS.map((bond) => [bond.klass.name, bond] as const))(
    "%s: its class is its kind's, its races have stat blocks, its features are its own feats",
    (_, bond) => {
      const kind = BONDED_KINDS.find((b) => b.className === bond.klass.name);
      const feats = new Set(bond.feats.map((feat) => feat.name));
      expect(bond.klass.partition).toBe(kind?.slug ?? "none");
      expect(bond.races.every((race) => race.partition === kind?.slug && BONDED_RACE_STATS[race.name])).toBe(true);
      expect((bond.klass.classFeatures ?? []).filter(([, feat]) => !feats.has(feat))).toEqual([]);
      expect(bond.klass.classSkills.filter((skill) => !SKILLS.some((s) => s.name === skill))).toEqual([]);
    },
  );

  test("a familiar gives its master its table's bonus, one limited to some checks only described", () => {
    const pick = (race: string) => FAMILIARS.feats.find((feat) => feat.name === `${race} Familiar`)!;
    expect(Object.keys(FAMILIAR_MASTER_BONUSES).sort()).toEqual(FAMILIARS.races.map((race) => race.name).sort());
    expect(pick("Cat").modifiers).toContainEqual(
      expect.objectContaining({ target: "skills.stealth.misc", value: "3" }),
    );
    expect(pick("Rat").modifiers).toContainEqual(
      expect.objectContaining({ target: "saves.fortitude.misc", value: "2" }),
    );
    expect(pick("Toad").modifiers).toContainEqual(expect.objectContaining({ target: "combat.hp.misc", value: "3" }));
    expect(pick("Hawk").modifiers).toEqual([
      expect.objectContaining({ target: "bonded.familiar.race", value: "Hawk" }),
    ]);
  });
});
