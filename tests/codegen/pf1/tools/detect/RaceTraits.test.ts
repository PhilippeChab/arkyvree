import { describe, expect, test } from "bun:test";

import RaceTraits from "@/codegen/pf1/tools/detect/RaceTraits.ts";
import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import type { RaceEntry } from "@/codegen/pf1/tools/types/races.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { grantFeat } from "@/content/pf1/builders/feats/possession.ts";
import { grantLanguage } from "@/content/pf1/builders/languages/knowledge.ts";
import { LANGUAGES } from "@/content/pf1/data/coreRules.ts";
import { Engine } from "@/engine/index.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { RACE_BASE_SPEED, RACE_SIZE, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/vocabulary/pf1/fields/index.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";
import { ALL_WEAPONS } from "@/vocabulary/pf1/weapons.ts";

/** The Core Rulebook's race `name`, as its reference stores it. */
function coreRace(name: string): RaceEntry {
  const entry = new BookSeeds(CORE_BOOK).reference("race")?.raw.find((race) => race.name === name);
  if (!entry) throw new Error(`The Core Rulebook has no race ${name}`);
  return entry;
}

/**
 * Whether a race's modifier can target `path`: one of the Pathfinder engine's book paths, or a ruleset's own (an
 * aptitude's pool, a weapon's proficiency feat, a core language).
 */
function isRaceTarget(path: string): boolean {
  const names = { abilities: ABILITY_NAMES, saves: [...SAVE_NAMES], skills: [...SKILL_NAMES] };
  const bookPaths = Engine.forRules(PF1_BASE_RULES)
    .listBookTargetPaths(names, "modifier")
    .map((tp) => tp.path);
  const proficiencies = ALL_WEAPONS.flatMap((weapon) =>
    ["Simple", "Martial", "Exotic"].map((group) => grantFeat(`${group} Weapon Proficiency: ${weapon}`).target),
  );
  const languages = LANGUAGES.map(({ name }) => grantLanguage(name).target);
  const pools = ["aptitudes.general.allowed", "aptitudes.racialabilityscore.allowed"];
  return [...bookPaths, ...proficiencies, ...languages, ...pools].includes(path);
}

/** The race `name` read: its fields, its modifiers and the traits left unread, in the order a seed reads them. */
function read(name: string) {
  const traits = new RaceTraits(coreRace(name));
  return { fields: traits.fields(), modifiers: traits.modifiers(), unread: traits.unread() };
}

describe("A race's traits", () => {
  test("give its size, its base speed, and whether armor and load leave its speed", () => {
    expect(read("Dwarf").fields).toEqual({
      [RACE_SIZE]: "Medium",
      [RACE_BASE_SPEED]: 20,
      [RACE_SPEED_IGNORES_ENCUMBRANCE]: true,
    });
    expect(read("Halfling").fields).toEqual({ [RACE_SIZE]: "Small", [RACE_BASE_SPEED]: 20 });
  });

  test("give its fixed ability adjustments, its unconditional skill and save bonuses, and its languages", () => {
    expect(read("Halfling").modifiers).toEqual([
      bonus("abilities.dexterity.misc", 2),
      bonus("abilities.charisma.misc", 2),
      bonus("abilities.strength.misc", -2),
      bonus("skills.perception.misc", 2),
      bonus("skills.acrobatics.misc", 2),
      bonus("skills.climb.misc", 2),
      bonus("saves.fortitude.misc", 1),
      bonus("saves.reflex.misc", 1),
      bonus("saves.will.misc", 1),
      grantFeat("Simple Weapon Proficiency: Sling"),
      grantLanguage("Common"),
      grantLanguage("Halfling"),
    ]);
  });

  test("give its weapon familiarity's proficiencies, a weapon's composite kind included", () => {
    const feats = read("Elf").modifiers.filter(({ target }) => target.startsWith("feats."));
    expect(feats).toEqual(
      ["Longbow", "Composite Longbow", "Longsword", "Rapier", "Shortbow", "Composite Shortbow"].map((weapon) =>
        grantFeat(`Martial Weapon Proficiency: ${weapon}`),
      ),
    );
  });

  test("give a human a pick of the ability its +2 goes to, one more general feat, one more skill rank a level, and only Common to speak", () => {
    expect(read("Human").modifiers).toEqual([
      bonus("aptitudes.racialabilityscore.allowed", 1),
      bonus("aptitudes.general.allowed", 1),
      bonus("skills.budget.perlevel", 1),
      grantLanguage("Common"),
    ]);
  });

  test("leave to the table a conditional bonus and what no modifier is, the ability score of the player's choice read as a pick", () => {
    expect(read("Human").unread).toEqual([]);
    expect(read("Half-Elf").modifiers.some(({ target }) => target.startsWith("abilities."))).toBe(false);
    expect(read("Half-Orc").modifiers).toContainEqual(bonus("aptitudes.racialabilityscore.allowed", 1));
    expect(read("Dwarf").unread).toEqual([
      "Darkvision",
      "Defensive Training",
      "Greed",
      "Hatred",
      "Hardy",
      "Stability",
      "Stonecunning",
    ]);
  });

  test("of every Core Rulebook race target a path the Pathfinder rules declare", () => {
    const races = new BookSeeds(CORE_BOOK).reference("race")?.raw ?? [];
    const targets = races.flatMap(({ name }) => read(name).modifiers.map(({ target }) => target));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !isRaceTarget(target))).toEqual([]);
  });
});
