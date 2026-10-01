import { describe, expect, test } from "bun:test";

import Dnd35TargetPaths from "@/server/rulesets/dnd3.5/TargetPaths.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import { spellPossessionSlug } from "@/shared/utils.ts";

const targetPaths = new Dnd35TargetPaths();

/** Holders exposing `data` through their getters: `{ skills: {...} }` → `skills.getSkills()`. */
function holders(data: Record<string, unknown>): Holders {
  return Object.fromEntries(
    Object.entries(data).map(([name, value]) => [
      name,
      { [`get${name[0].toUpperCase()}${name.slice(1)}`]: () => value },
    ]),
  );
}

/** What a target resolves to: each result's value, or its error. */
function resolve(target: string, data: Record<string, unknown>) {
  return targetPaths
    .traversePathInit(target, holders(data))
    .map((r) => (r.error === null ? r.data : { error: r.error }));
}

describe("Dnd35TargetPaths.traversePathInit", () => {
  describe("reads", () => {
    test.each([
      ["a category's value", "abilities.strength.score", { abilities: { strength: { score: 18 } } }, [18]],
      ["combat values", "combat.bab", { combat: { bab: 5, grapple: 7 } }, [5]],
      [
        "a weapon group, once per weapon slot",
        "items.weapons.Longsword.damage",
        { weapons: { longsword: { mainhand: { damage: "1d8" }, offhand: { damage: "1d6" } } } },
        ["1d8", "1d6"],
      ],
      [
        "weapon slots' nested values",
        "items.weapons.Longsword.damage.strmultiplier",
        {
          weapons: {
            longsword: {
              "0_mainhand": { damage: { strmultiplier: 1 } },
              "1_twohanded": { damage: { strmultiplier: 1.5 } },
            },
          },
        },
        [1, 1.5],
      ],
      [
        "a weapon's slot and proficiency",
        "items.weapons.Longsword.proficient",
        { weapons: { longsword: { "0_mainhand": { proficient: true } } } },
        [true],
      ],
      [
        "a proficiency category grouping",
        "items.weapons.Exotic.slot",
        { weapons: { exotic: { "0_mainhand": { slot: "mainhand" } } } },
        ["mainhand"],
      ],
      [
        "armor and shields, by their type's name",
        "items.armors.Chain Mail.bonus",
        { armors: { chainmail: { bonus: 5 } } },
        [5],
      ],
      ["shields", "items.shields.Heavy Steel Shield.bonus", { shields: { heavysteelshield: { bonus: 2 } } }, [2]],
      [
        "nothing for a weapon or armor the character doesn't have",
        "items.weapons.Greataxe.damage",
        { weapons: { longsword: { mainhand: { damage: 5 } } } },
        [],
      ],
      ["nothing for missing armor", "items.armors.Platemail.bonus", { armors: { chainmail: { bonus: 5 } } }, []],
      [
        "a spell's DC",
        "powers.scorchingray.dc.total",
        { powers: { scorchingray: { power: {}, properties: {}, dc: { total: 17 } } } },
        [17],
      ],
      [
        "a spell's properties next to its groupings",
        "powers.magicmissile.properties.spellschool",
        {
          powers: {
            magicmissile: { properties: { spellschool: "Evocation" } },
            groups: { evocation: { magicmissile: {} } },
          },
        },
        ["Evocation"],
      ],
      [
        "a spell's possession by a class",
        "powers.curelightwounds.druid.known",
        { powers: { curelightwounds: { cleric: { known: true }, druid: { known: false } } } },
        [false],
      ],
    ] as const)("%s", (_, target, data, expected) => {
      expect(resolve(target, data)).toEqual([...expected]);
    });
  });

  describe("expands", () => {
    const feats = {
      weaponfocus: { longsword: { possessed: true }, greatsword: { possessed: false } },
      powercritical: { possessed: true },
      sneakattackrogue: { possessed: true },
      sneakattackassassin: { possessed: false },
      ragebarbarian: { possessed: true },
    };
    test.each([
      [
        "a wildcard over every entry, skipping plain values",
        "abilities.*.score",
        { abilities: { strength: { score: 18 }, dexterity: { score: 14 }, total: 42, empty: null } },
        [18, 14],
      ],
      ["a wildcard within a grouping", "feats.weaponfocus.*.possessed", { feats }, [true, false]],
      [
        "a spell school grouping",
        "powers.groups.evocation.*.dc.misc",
        { powers: { groups: { evocation: { magicmissile: { dc: { misc: 0 } }, burninghands: { dc: { misc: 1 } } } } } },
        [0, 1],
      ],
      ["a key to the entries it prefixes", "feats.sneakattack.possessed", { feats }, [true, false]],
      [
        "a key to itself and the subtypes it prefixes",
        "skills.craft.rank",
        { skills: { craft: { rank: 0 }, craftarmorsmithing: { rank: 12 }, diplomacy: { rank: 7 } } },
        [0, 12],
      ],
      [
        "a key without subtypes to itself only",
        "skills.craft.rank",
        { skills: { craft: { rank: 5 }, diplomacy: { rank: 7 } } },
        [5],
      ],
      ["a wildcard prefix matching nothing to nothing", "feats.zzz*.possessed", { feats }, []],
    ] as const)("%s", (_, target, data, expected) => {
      expect(resolve(target, data)).toEqual([...expected]);
    });

    test("keep the path each value came from", () => {
      const owned = { possessed: true };
      const paths = (target: string, data: Record<string, unknown>) =>
        targetPaths
          .traversePathInit(target, holders(data))
          .map((r) => r.resolvedPath)
          .sort();
      expect(paths("abilities.strength.score", { abilities: { strength: { score: 18 } } })).toEqual([
        "abilities.strength.score",
      ]);
      expect(
        paths("feats.simpleweaponproficiency.possessed", {
          feats: {
            simpleweaponproficiency: owned,
            simpleweaponproficiencydagger: owned,
            simpleweaponproficiencymace: owned,
          },
        }),
      ).toEqual([
        "feats.simpleweaponproficiency.possessed",
        "feats.simpleweaponproficiencydagger.possessed",
        "feats.simpleweaponproficiencymace.possessed",
      ]);
      expect(
        paths("skills.craft.rank", { skills: { craftarmorsmithing: { rank: 1 }, craftweaponsmithing: { rank: 2 } } }),
      ).toEqual(["skills.craftarmorsmithing.rank", "skills.craftweaponsmithing.rank"]);
    });
  });

  describe("reports", () => {
    test.each([
      ["an unknown category", "invalidcategory.something", {}, "Unknown category: invalidcategory"],
      ["a missing holder", "abilities.strength.score", {}, "Abilities holder not found"],
      ["a missing weapons holder", "items.weapons.Longsword.damage", {}, "weapons holder not found"],
      ["a missing armors holder", "items.armors.Chainmail.bonus", {}, "armors holder not found"],
      ["a holder without data", "abilities.strength.score", { abilities: null }, "Abilities not found"],
      [
        "a wildcard at the end",
        "abilities.*",
        { abilities: { strength: { score: 18 } } },
        "Wildcard modifier not supported as last element",
      ],
    ] as const)("%s", (_, target, data, error) => {
      expect(resolve(target, data)).toEqual([{ error }]);
    });

    test.each([
      ["a missing element", "abilities.charisma.score", { abilities: { strength: { score: 18 } } }],
      ["a key no entry starts with", "skills.craft.rank", { skills: { diplomacy: { rank: 7 } } }],
      // Nothing is left to read in the subtypes.
      ["a prefix as the last element", "skills.craft", { skills: { craftarmorsmithing: { rank: 12 } } }],
      ["a missing spell school", "powers.groups.illusion.*.dc.misc", { powers: {} }],
    ] as const)("%s as not found, without a path", (_, target, data) => {
      const [result] = targetPaths.traversePathInit(target, holders(data));
      expect(result).toMatchObject({ error: expect.stringContaining("Element not found"), resolvedPath: null });
    });

    test("a getter that throws, without a holder", () => {
      const [result] = targetPaths.traversePathInit("abilities.strength.score", {
        abilities: {
          getAbilities: () => {
            throw new Error("Unexpected error");
          },
        },
      });
      expect(result).toMatchObject({ error: expect.stringContaining("Failed to traverse path"), holder: null });
    });
  });
});

describe("spellPossessionSlug", () => {
  test.each([
    ["Wizard Spells", "wizard"],
    ["Paladin Spells", "paladin"],
    ["Blackguard Spells", "blackguard"],
    ["Sublime Chord Spells", "sublimechord"],
    ["War Domain Spells", "wardomain"],
    ["Evocation Specialist Spells", "evocationspecialist"],
    ["General", "general"],
    ["Turn Undead", "turnundead"],
  ])("makes %s %s", (aptitude, slug) => {
    expect(spellPossessionSlug(aptitude)).toBe(slug);
  });
});
