import { describe, expect, test } from "bun:test";

import { ClassEntries } from "@/codegen/dnd5.2/tools/seeds/classes/ClassEntries.ts";
import { ClassProgression } from "@/codegen/dnd5.2/tools/seeds/classes/ClassProgression.ts";
import type { ClassLevel, ClassReference } from "@/codegen/dnd5.2/tools/types/classes.ts";

/** A level of the test's class: its features by name, its own counts, its spellcasting. */
interface LevelFixture {
  counts?: Record<string, number>;
  features: string[];
  spellcasting?: Record<string, number>;
}

/** Each feature's text, by its name. */
const TEXTS: Record<string, string> = {
  Expertise: "You gain Expertise in two of your skill proficiencies of your choice.",
  "Weapon Mastery": "You can use the mastery properties of two kinds of weapons of your choice.",
};

/** A class reference of `levels`, in order from level 1, each feature's text its `TEXTS`' or its name. */
function classOf(levels: LevelFixture[], overrides?: ClassReference["overrides"]): ClassReference {
  const ref = (name: string) => ({ index: name.toLowerCase(), name });
  const names = [...new Set(levels.flatMap(({ features }) => features))];
  const classLevels: ClassLevel[] = levels.map(({ counts, features, spellcasting }, index) => ({
    class: ref("Tester"),
    features: features.map(ref),
    index: `tester-${index + 1}`,
    level: index + 1,
    name: `Tester ${index + 1}`,
    ...(counts ? { class_specific: counts } : {}),
    ...(spellcasting ? { spellcasting } : {}),
  }));
  return {
    _meta: { book: "srd", scrapedAt: "", sourceUrls: {}, type: "class" },
    ...(overrides ? { overrides } : {}),
    raw: {
      class: {
        hit_die: 8,
        index: "tester",
        multi_classing: {
          prerequisites: [{ ability_score: ref("STR"), minimum_score: 13 }],
          prerequisite_options: {
            choose: 1,
            type: "ability-scores",
            from: {
              option_set_type: "options_array",
              options: [
                { ability_score: ref("DEX"), minimum_score: 13 },
                { ability_score: ref("WIS"), minimum_score: 13 },
              ],
            },
          },
        },
        name: "Tester",
        primary_ability: { ability_scores: [], desc: "Strength" },
        proficiencies: [],
        proficiency_choices: [],
        saving_throws: [],
        starting_equipment_options: [],
        subclasses: [],
      },
      features: names.map((name) => ({
        class: ref("Tester"),
        description: TEXTS[name] ?? name,
        index: name.toLowerCase(),
        level: ref("Tester 1"),
        name,
      })),
      levels: classLevels,
      subclasses: [],
    },
  };
}

/** A class reference's progression. */
function progressionOf(ref: ClassReference): ClassProgression {
  return new ClassProgression(new ClassEntries(ref));
}

/** A spellcasting's counts: its cantrips, its prepared spells, and its slots by spell level from level 1. */
function spellcastingOf(cantrips: number, prepared: number, slots: number[]): Record<string, number> {
  return {
    cantrips_known: cantrips,
    prepared_spells: prepared,
    ...Object.fromEntries(slots.map((count, index) => [`spell_slots_level_${index + 1}`, count])),
  };
}

describe("A class's progression", () => {
  test("gives its features' rooms at their levels: its subclass's at its pick, its feats', its Expertise's", () => {
    const progression = progressionOf(
      classOf([
        { features: ["Expertise"] },
        { features: ["Tester Subclass"] },
        { features: ["Ability Score Improvement", "Tester Subclass"] },
      ]),
    );
    expect(progression.modifiers().map(({ level, target, value }) => [level, target, value])).toEqual([
      [1, "aptitudes.expertise.allowed", "2"],
      [2, "aptitudes.testersubclass.allowed", "1"],
      [3, "aptitudes.abilityscoreimprovement.allowed", "1"],
    ]);
  });

  test("gives its Weapon Mastery's kinds by its levels' counts, or its text without them", () => {
    const counted = classOf([
      { features: ["Weapon Mastery"], counts: { weapon_mastery: 3 } },
      { features: [], counts: { weapon_mastery: 3 } },
      { features: [], counts: { weapon_mastery: 4 } },
    ]);
    expect(
      progressionOf(counted)
        .modifiers()
        .map(({ level, value }) => [level, value]),
    ).toEqual([
      [1, "3"],
      [3, "1"],
    ]);
    const read = classOf([{ features: ["Weapon Mastery"] }]);
    expect(
      progressionOf(read)
        .modifiers()
        .map(({ target, value }) => [target, value]),
    ).toEqual([["aptitudes.weaponmastery.allowed", "2"]]);
  });

  test("files each level's new prepared spells at the highest level its slots reach, its cantrips at 0", () => {
    const spells = progressionOf(
      classOf([
        { features: ["Spellcasting"], spellcasting: spellcastingOf(2, 2, [2]) },
        { features: [], spellcasting: spellcastingOf(2, 3, [3]) },
        { features: [], spellcasting: spellcastingOf(3, 5, [4, 2]) },
      ]),
    ).spells();
    expect(spells?.list).toBe("Tester Spells");
    expect(spells?.known.map((row) => row.slice(0, 3))).toEqual([
      [2, 2, 0],
      [2, 3, 0],
      [3, 3, 2],
    ]);
  });

  test("reads a level as its override corrects it", () => {
    const levels = [
      { features: ["Spellcasting"], spellcasting: spellcastingOf(2, 2, [2]) },
      { features: [], spellcasting: spellcastingOf(4, 3, [3]) },
    ];
    const corrected = classOf(levels, { "Tester 2": { spellcasting: spellcastingOf(3, 3, [3]) } });
    expect(progressionOf(corrected).spells()?.known[1].slice(0, 2)).toEqual([3, 3]);
  });

  test("counts all its levels toward a multiclass's slots, half when its slots stop short of level 9, none apart", () => {
    const castingTo = (slots: number[], feature = "Spellcasting") =>
      progressionOf(classOf([{ features: [feature], spellcasting: spellcastingOf(0, 2, slots) }])).multiclassSlots();
    expect(castingTo([4, 3, 3, 3, 3, 2, 2, 1, 1])).toBe("All its levels");
    expect(castingTo([2])).toBe("Half its levels");
    // A warlock's Pact Magic isn't the Spellcasting feature, and a class without spells has neither
    expect(castingTo([1], "Pact Magic")).toBe("Its levels don't count");
    expect(progressionOf(classOf([{ features: ["Rage"] }])).multiclassSlots()).toBe("Its levels don't count");
  });

  test("gives each level's new spell slots on its list, at their spell levels", () => {
    const progression = progressionOf(
      classOf([
        { features: ["Spellcasting"], spellcasting: spellcastingOf(2, 2, [2]) },
        { features: [], spellcasting: spellcastingOf(2, 3, [3]) },
        { features: [], spellcasting: spellcastingOf(2, 4, [4, 2]) },
      ]),
    );
    const slots = progression.modifiers().filter(({ target }) => target.endsWith(".uses"));
    expect(slots.map(({ level, target, value }) => [level, target, value])).toEqual([
      [1, "aptitudes.testerspells.1.uses", "2"],
      [2, "aptitudes.testerspells.1.uses", "1"],
      [3, "aptitudes.testerspells.1.uses", "1"],
      [3, "aptitudes.testerspells.2.uses", "2"],
    ]);
  });

  test("gives a warlock's levels its Pact Magic slots and their level, no slot on its list", () => {
    const progression = progressionOf(
      classOf([
        { features: ["Pact Magic"], spellcasting: spellcastingOf(2, 2, [1]) },
        { features: [], spellcasting: spellcastingOf(2, 3, [2]) },
        { features: [], spellcasting: spellcastingOf(2, 4, [0, 2]) },
      ]),
    );
    const slots = progression
      .modifiers()
      .filter(({ target }) => target.startsWith("spellcasting.") || target.endsWith(".uses"));
    expect(slots.map(({ level, target, value }) => [level, target, value])).toEqual([
      [1, "spellcasting.pact.slots", "1"],
      [1, "spellcasting.pact.level", "1"],
      [2, "spellcasting.pact.slots", "1"],
      [3, "spellcasting.pact.level", "1"],
    ]);
  });

  test("refuses a table whose slots go down", () => {
    const levels = [
      { features: ["Spellcasting"], spellcasting: spellcastingOf(2, 2, [3]) },
      { features: [], spellcasting: spellcastingOf(2, 3, [2]) },
    ];
    expect(() => progressionOf(classOf(levels)).modifiers()).toThrow("Tester 2: its level 1 slots go down");
  });

  test("requires a multiclass's scores: each of its prerequisites, one of its alternatives", () => {
    expect(progressionOf(classOf([{ features: [] }])).requirements()).toEqual([
      { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" },
      {
        chainingOperator: "or",
        children: [
          { target: "abilities.dexterity.total", operator: "greater_than_or_equal", value: "13", valueType: "number" },
          { target: "abilities.wisdom.total", operator: "greater_than_or_equal", value: "13", valueType: "number" },
        ],
      },
    ]);
  });
});
