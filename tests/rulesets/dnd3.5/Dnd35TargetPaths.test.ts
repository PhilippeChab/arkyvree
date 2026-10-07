import { describe, expect, test } from "bun:test";

import type { Components } from "@/engine/core/types.ts";
import Dnd35TargetPaths from "@/server/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";

const targetPaths = new Dnd35TargetPaths();

/** Components exposing `data` through their getters: `{ skills: {...} }` → `skills.getSkills()`. */
function components(data: Record<string, unknown>): Components {
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
    .traversePathInit(target, components(data))
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
        "items.weapons.Exotic.wielded",
        { weapons: { exotic: { "0_mainhand": { wielded: "mainhand" } } } },
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
        "powers.magicmissile.properties.SPELL_SCHOOL",
        {
          powers: {
            magicmissile: { properties: { SPELL_SCHOOL: "Evocation" } },
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
      [
        "a skill to the subtypes it prefixes",
        "skills.knowledge.rank",
        { skills: { knowledgearcana: { rank: 4 }, knowledgehistory: { rank: 0 }, diplomacy: { rank: 7 } } },
        [4, 0],
      ],
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
      [
        "a feat's name to that feat, not one whose name it starts",
        "feats.dodge.possessed",
        { feats: { dodge: { possessed: false }, dodgebonusswashbuckler: { possessed: true } } },
        [false],
      ],
    ] as const)("%s", (_, target, data, expected) => {
      expect(resolve(target, data)).toEqual([...expected]);
    });

    test("keep the path each value came from", () => {
      const owned = { possessed: true };
      const paths = (target: string, data: Record<string, unknown>) =>
        targetPaths
          .traversePathInit(target, components(data))
          .map((r) => r.resolvedPath)
          .sort();
      expect(paths("abilities.strength.score", { abilities: { strength: { score: 18 } } })).toEqual([
        "abilities.strength.score",
      ]);
      expect(paths("skills.craft.rank", { skills: { craft: { rank: 0 }, craftarmorsmithing: { rank: 1 } } })).toEqual([
        "skills.craft.rank",
        "skills.craftarmorsmithing.rank",
      ]);
      // A feat's name reaches that feat only, not the feats it starts the names of
      expect(
        paths("feats.simpleweaponproficiency.possessed", {
          feats: { simpleweaponproficiency: owned, simpleweaponproficiencydagger: owned },
        }),
      ).toEqual(["feats.simpleweaponproficiency.possessed"]);
      expect(
        paths("skills.craft.rank", { skills: { craftarmorsmithing: { rank: 1 }, craftweaponsmithing: { rank: 2 } } }),
      ).toEqual(["skills.craftarmorsmithing.rank", "skills.craftweaponsmithing.rank"]);
    });
  });

  describe("reports", () => {
    test.each([
      ["an unknown category", "invalidcategory.something", {}, "Unknown category: invalidcategory"],
      ["a missing component", "abilities.strength.score", {}, "Abilities holder not found"],
      ["a missing weapons component", "items.weapons.Longsword.damage", {}, "weapons holder not found"],
      ["a missing armors component", "items.armors.Chainmail.bonus", {}, "armors holder not found"],
      ["a component without data", "abilities.strength.score", { abilities: null }, "Abilities not found"],
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
      // A feat's family is checked by its group: a name starting other feats' is none of them
      [
        "a feat's name others start with",
        "feats.sneakattack.possessed",
        { feats: { sneakattackrogue: { possessed: true } } },
      ],
      // Nothing is left to read in the subtypes.
      ["a prefix as the last element", "skills.craft", { skills: { craftarmorsmithing: { rank: 12 } } }],
      ["a missing spell school", "powers.groups.illusion.*.dc.misc", { powers: {} }],
    ] as const)("%s as not found, without a path", (_, target, data) => {
      const [result] = targetPaths.traversePathInit(target, components(data));
      expect(result).toMatchObject({ error: expect.stringContaining("Element not found"), resolvedPath: null });
    });

    test("a getter that throws, without a component", () => {
      const [result] = targetPaths.traversePathInit("abilities.strength.score", {
        abilities: {
          getAbilities: () => {
            throw new Error("Unexpected error");
          },
        },
      });
      expect(result).toMatchObject({ error: expect.stringContaining("Failed to traverse path"), component: null });
    });
  });
});

describe("toSpellPossessionSlug", () => {
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
    expect(toSpellPossessionSlug(aptitude)).toBe(slug);
  });
});
