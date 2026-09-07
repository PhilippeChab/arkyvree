import Dnd35TargetPaths from "@/server/rulesets/dnd3.5/TargetPaths.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import { spellPossessionSlug } from "@/shared/utils.ts";
import { describe, expect, test } from "bun:test";

describe("Dnd35TargetPaths - traversePathInit", () => {
  const targetPaths = new Dnd35TargetPaths();

  describe("combat subcategory handling", () => {
    test("should traverse combat.weapons path with multiple weapon slots", () => {
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({
            longsword: {
              mainhand: { damage: "1d8", bonus: 5 },
              offhand: { damage: "1d8", bonus: 3 },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Longsword.damage", holders);
      expect(results.length).toBe(2);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe("1d8");
      expect(results[1].error).toBeNull();
      expect(results[1].data).toBe("1d8");
    });

    test("should traverse items.armors path as single entry", () => {
      const holders: Holders = {
        armors: {
          getArmors: () => ({
            chainmail: { bonus: 5, maxDex: 2 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.armors.Chain Mail.bonus", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(5);
    });

    test("should traverse items.shields path as single entry", () => {
      const holders: Holders = {
        shields: {
          getShields: () => ({
            heavysteelshield: { bonus: 2, penalty: -2 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.shields.Heavy Steel Shield.bonus", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(2);
    });

    test("should return error when weapons holder is not found", () => {
      const holders: Holders = {};

      const results = targetPaths.traversePathInit("items.weapons.Longsword.damage", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("weapons holder not found");
      expect(results[0].holder).toBeNull();
    });

    test("should return error when armors holder is not found", () => {
      const holders: Holders = {};

      const results = targetPaths.traversePathInit("items.armors.Chainmail.bonus", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("armors holder not found");
    });

    test("should traverse combat.weapons slot path", () => {
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({
            longsword: {
              "0_mainhand": { slot: "mainhand" },
              "1_twohanded": { slot: "twohanded" },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Longsword.slot", holders);
      expect(results.length).toBe(2);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe("mainhand");
      expect(results[1].error).toBeNull();
      expect(results[1].data).toBe("twohanded");
    });

    test("should traverse combat.weapons proficient path", () => {
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({
            longsword: {
              "0_mainhand": { proficient: true },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Longsword.proficient", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(true);
    });

    test("should traverse combat.weapons damage.strmultiplier path", () => {
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({
            longsword: {
              "0_mainhand": { damage: { strmultiplier: 1 } },
              "1_twohanded": { damage: { strmultiplier: 1.5 } },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Longsword.damage.strmultiplier", holders);
      expect(results.length).toBe(2);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(1);
      expect(results[1].error).toBeNull();
      expect(results[1].data).toBe(1.5);
    });

    test("should traverse combat.weapons paths by proficiency category grouping", () => {
      const sharedRef = { slot: "mainhand", strmultiplier: 1 };
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({
            exotic: {
              "0_mainhand": sharedRef,
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Exotic.slot", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe("mainhand");
    });

    test("should return empty results when weapon group is not found", () => {
      const holders: Holders = {
        weapons: {
          getWeapons: () => ({ longsword: { slot1: { damage: 5 } } }),
        },
      };

      const results = targetPaths.traversePathInit("items.weapons.Greataxe.damage", holders);
      expect(results.length).toBe(0);
    });

    test("should return empty results when armor group is not found", () => {
      const holders: Holders = {
        armors: {
          getArmors: () => ({ chainmail: { bonus: 5 } }),
        },
      };

      const results = targetPaths.traversePathInit("items.armors.Platemail.bonus", holders);
      expect(results.length).toBe(0);
    });
  });

  describe("category handling", () => {
    test("should return error for unknown category", () => {
      const holders: Holders = {};

      const results = targetPaths.traversePathInit("invalidcategory.something", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("Unknown category: invalidcategory");
    });

    test("should return error when category holder is not found", () => {
      const holders: Holders = {};

      const results = targetPaths.traversePathInit("abilities.strength.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("Abilities holder not found");
      expect(results[0].holder).toBeNull();
    });

    test("should return error when getter returns no data", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => null,
        },
      };

      const results = targetPaths.traversePathInit("abilities.strength.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("Abilities not found");
    });

    test("should traverse valid category path", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18, modifier: 4 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.strength.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(18);
      expect(results[0].key).toBe("score");
    });

    test("should traverse combat category (non-grouped) path", () => {
      const holders: Holders = {
        combat: {
          getCombat: () => ({
            bab: 5,
            grapple: 7,
          }),
        },
      };

      const results = targetPaths.traversePathInit("combat.bab", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(5);
    });
  });

  describe("traversePath - wildcards", () => {
    test("should handle wildcard path to traverse all entries", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18, modifier: 4 },
            dexterity: { score: 14, modifier: 2 },
            constitution: { score: 16, modifier: 3 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.*.score", holders);
      expect(results.length).toBe(3);
      for (const result of results) {
        expect(result.error).toBeNull();
        expect(result.key).toBe("score");
        expect(typeof result.data).toBe("number");
      }
    });

    test("should return error when wildcard is the last element", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.*", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBe("Wildcard modifier not supported as last element");
    });

    test("should skip null and primitive values during wildcard traversal", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18 },
            total: 42,
            empty: null,
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.*.score", holders);
      // Only "strength" should be traversed (total is number, empty is null)
      expect(results.length).toBe(1);
      expect(results[0].data).toBe(18);
    });

    test("grouping wildcard: feats.weaponfocus.*.possessed", () => {
      const holders: Holders = {
        feats: {
          getFeats: () => ({
            weaponfocus: {
              longsword: { name: "Weapon Focus: Longsword", possessed: true },
              greatsword: { name: "Weapon Focus: Greatsword", possessed: false },
            },
            powercritical: { name: "Power Critical", possessed: true },
          }),
        },
      };

      const results = targetPaths.traversePathInit("feats.weaponfocus.*.possessed", holders);
      expect(results.length).toBe(2);
      expect(results.some((r) => r.data === true)).toBe(true);
      expect(results.some((r) => r.data === false)).toBe(true);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
    });

    test("grouping wildcard expands into group: feats.exoticweaponproficiency.*.possessed", () => {
      const holders: Holders = {
        feats: {
          getFeats: () => ({
            exoticweaponproficiency: {
              bastardsword: { name: "Exotic Weapon Proficiency: Bastard Sword", possessed: true },
              kama: { name: "Exotic Weapon Proficiency: Kama", possessed: false },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("feats.exoticweaponproficiency.*.possessed", holders);
      expect(results.length).toBe(2);
      expect(results.some((r) => r.data === true)).toBe(true);
      expect(results.some((r) => r.data === false)).toBe(true);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
    });

    test("prefix wildcard on group with no matching children returns empty", () => {
      const holders: Holders = {
        feats: {
          getFeats: () => ({
            exoticweaponproficiency: {
              bastardsword: { name: "Exotic Weapon Proficiency: Bastard Sword", possessed: true },
            },
          }),
        },
      };

      // "zzz*" matches nothing
      const results = targetPaths.traversePathInit("feats.zzz*.possessed", holders);
      expect(results.length).toBe(0);
    });
  });

  describe("traversePath - implicit prefix expansion", () => {
    test("exact key not found but is prefix of other keys: skills.craft.rank expands to subtypes", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            craftarmorsmithing: { name: "Craft (Armorsmithing)", rank: 12 },
            craftweaponsmithing: { name: "Craft (Weaponsmithing)", rank: 11 },
            diplomacy: { name: "Diplomacy", rank: 7 },
          }),
        },
      };

      // "craft" doesn't exist as an exact key, but is a prefix of craftarmorsmithing/craftweaponsmithing
      const results = targetPaths.traversePathInit("skills.craft.rank", holders);
      expect(results.length).toBe(2);
      expect(results.some((r) => r.data === 12)).toBe(true);
      expect(results.some((r) => r.data === 11)).toBe(true);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
    });

    test("exact key exists WITH subtypes — returns both (OR semantics in requirements)", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            craft: { name: "Craft", rank: 0 },
            craftarmorsmithing: { name: "Craft (Armorsmithing)", rank: 12 },
            craftweaponsmithing: { name: "Craft (Weaponsmithing)", rank: 11 },
          }),
        },
      };

      // "craft" exists AND has subtypes — return all so OR semantics can find a passing one
      const results = targetPaths.traversePathInit("skills.craft.rank", holders);
      expect(results.length).toBe(3);
      expect(results.some((r) => r.data === 0)).toBe(true);
      expect(results.some((r) => r.data === 12)).toBe(true);
      expect(results.some((r) => r.data === 11)).toBe(true);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
    });

    test("exact key exists WITHOUT subtypes — returns only exact match", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            craft: { name: "Craft", rank: 5 },
            diplomacy: { name: "Diplomacy", rank: 7 },
          }),
        },
      };

      // "craft" exists but no subtypes — just the exact match
      const results = targetPaths.traversePathInit("skills.craft.rank", holders);
      expect(results.length).toBe(1);
      expect(results[0].data).toBe(5);
    });

    test("no prefix matches — returns error", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            diplomacy: { name: "Diplomacy", rank: 7 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("skills.craft.rank", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toContain("Element not found");
    });

    test("prefix expansion for class feature feats: feats.sneakattack.possessed", () => {
      const holders: Holders = {
        feats: {
          getFeats: () => ({
            sneakattackrogue: { name: "Sneak Attack (Rogue)", possessed: true },
            sneakattackassassin: { name: "Sneak Attack (Assassin)", possessed: false },
            sneakattackblackguard: { name: "Sneak Attack (Blackguard)", possessed: false },
            ragebarbarian: { name: "Rage (Barbarian)", possessed: true },
          }),
        },
      };

      const results = targetPaths.traversePathInit("feats.sneakattack.possessed", holders);
      expect(results.length).toBe(3);
      expect(results.some((r) => r.data === true)).toBe(true);
      expect(results.filter((r) => r.data === false).length).toBe(2);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
    });

    test("prefix expansion does not trigger for last element", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            craftarmorsmithing: { name: "Craft (Armorsmithing)", rank: 12 },
          }),
        },
      };

      // "craft" is the last element — no remaining path to traverse into subtypes
      const results = targetPaths.traversePathInit("skills.craft", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toContain("Element not found");
    });
  });

  describe("resolvedPath tracking", () => {
    test("simple path returns resolvedPath matching the target", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.strength.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].resolvedPath).toBe("abilities.strength.score");
    });

    test("subtype expansion returns distinct resolvedPaths per expanded key", () => {
      const holders: Holders = {
        feats: {
          getFeats: () => ({
            simpleweaponproficiency: { name: "Simple Weapon Proficiency", possessed: false },
            simpleweaponproficiencydagger: { name: "Simple Weapon Proficiency: Dagger", possessed: false },
            simpleweaponproficiencymace: { name: "Simple Weapon Proficiency: Mace", possessed: false },
          }),
        },
      };

      const results = targetPaths.traversePathInit("feats.simpleweaponproficiency.possessed", holders);
      expect(results.length).toBe(3);
      const paths = results.map((r) => r.resolvedPath).sort();
      expect(paths).toEqual([
        "feats.simpleweaponproficiency.possessed",
        "feats.simpleweaponproficiencydagger.possessed",
        "feats.simpleweaponproficiencymace.possessed",
      ]);
    });

    test("prefix expansion returns resolvedPaths with matched keys", () => {
      const holders: Holders = {
        skills: {
          getSkills: () => ({
            craftarmorsmithing: { name: "Craft (Armorsmithing)", rank: 12 },
            craftweaponsmithing: { name: "Craft (Weaponsmithing)", rank: 11 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("skills.craft.rank", holders);
      expect(results.length).toBe(2);
      const paths = results.map((r) => r.resolvedPath).sort();
      expect(paths).toEqual([
        "skills.craftarmorsmithing.rank",
        "skills.craftweaponsmithing.rank",
      ]);
    });

    test("error results have null resolvedPath", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.charisma.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).not.toBeNull();
      expect(results[0].resolvedPath).toBeNull();
    });
  });

  describe("traversePath - element not found", () => {
    test("should return error when element does not exist in path", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => ({
            strength: { score: 18 },
          }),
        },
      };

      const results = targetPaths.traversePathInit("abilities.charisma.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toContain("Element not found");
    });
  });

  describe("power groupings handling", () => {
    test("should traverse powers.groups.{school}.*.dc.misc with multiple power entries", () => {
      const dc1 = { base: 10, level: 1, ability: 4, misc: 0, total: 15 };
      const dc2 = { base: 10, level: 1, ability: 4, misc: 0, total: 15 };
      const holders: Holders = {
        powers: {
          getPowers: () => ({
            groups: {
              evocation: {
                magicmissile: { dc: dc1 },
                burninghands: { dc: dc2 },
              },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("powers.groups.evocation.*.dc.misc", holders);
      expect(results.length).toBe(2);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(0);
      expect(results[1].error).toBeNull();
      expect(results[1].data).toBe(0);
    });

    test("should traverse powers.{name}.dc.total for single power (flat entry)", () => {
      const dc = { base: 10, level: 2, ability: 4, misc: 1, total: 17 };
      const holders: Holders = {
        powers: {
          getPowers: () => ({
            scorchingray: {
              power: { name: "Scorching Ray" },
              properties: {},
              dc,
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("powers.scorchingray.dc.total", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(17);
    });

    test("should traverse flat power property paths alongside groupings", () => {
      const holders: Holders = {
        powers: {
          getPowers: () => ({
            magicmissile: {
              power: { name: "Magic Missile" },
              properties: { spellschool: "Evocation" },
            },
            groups: {
              evocation: {
                magicmissile: { dc: { base: 10, level: 1, ability: 4, misc: 0, total: 15 } },
              },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("powers.magicmissile.properties.spellschool", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe("Evocation");
    });

    test("should return error when grouping not found", () => {
      const holders: Holders = {
        powers: {
          getPowers: () => ({}),
        },
      };

      const results = targetPaths.traversePathInit("powers.groups.illusion.*.dc.misc", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toContain("Element not found");
    });
  });

  describe("spell possession path traversal", () => {
    test("should traverse powers.<spell>.<class>.known with short class slug", () => {
      const holders: Holders = {
        powers: {
          getPowers: () => ({
            magicmissile: {
              wizard: { known: true },
              sorcerer: { known: false },
            },
          }),
        },
      };

      const results = targetPaths.traversePathInit("powers.magicmissile.wizard.known", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toBeNull();
      expect(results[0].data).toBe(true);
    });

    test("should traverse multiple class known paths for the same spell", () => {
      const holders: Holders = {
        powers: {
          getPowers: () => ({
            curelightwounds: {
              cleric: { known: true },
              druid: { known: false },
            },
          }),
        },
      };

      const cleric = targetPaths.traversePathInit("powers.curelightwounds.cleric.known", holders);
      expect(cleric.length).toBe(1);
      expect(cleric[0].data).toBe(true);

      const druid = targetPaths.traversePathInit("powers.curelightwounds.druid.known", holders);
      expect(druid.length).toBe(1);
      expect(druid[0].data).toBe(false);
    });
  });

  describe("error handling", () => {
    test("should catch errors and return error result", () => {
      const holders: Holders = {
        abilities: {
          getAbilities: () => {
            throw new Error("Unexpected error");
          },
        },
      };

      const results = targetPaths.traversePathInit("abilities.strength.score", holders);
      expect(results.length).toBe(1);
      expect(results[0].error).toContain("Failed to traverse path");
      expect(results[0].holder).toBeNull();
    });
  });
});

describe("spellPossessionSlug", () => {
  test("strips ' Spells' for class aptitudes", () => {
    expect(spellPossessionSlug("Wizard Spells")).toBe("wizard");
    expect(spellPossessionSlug("Sorcerer Spells")).toBe("sorcerer");
    expect(spellPossessionSlug("Bard Spells")).toBe("bard");
    expect(spellPossessionSlug("Paladin Spells")).toBe("paladin");
  });

  test("strips ' Spells' for domain aptitudes", () => {
    expect(spellPossessionSlug("Knowledge Domain Spells")).toBe("knowledgedomain");
    expect(spellPossessionSlug("War Domain Spells")).toBe("wardomain");
  });

  test("strips ' Spells' for specialist aptitudes", () => {
    expect(spellPossessionSlug("Abjuration Specialist Spells")).toBe("abjurationspecialist");
    expect(spellPossessionSlug("Evocation Specialist Spells")).toBe("evocationspecialist");
  });

  test("keeps full slug for non-spell aptitudes", () => {
    expect(spellPossessionSlug("General")).toBe("general");
    expect(spellPossessionSlug("Turn Undead")).toBe("turnundead");
  });

  test("handles prestige class spell lists", () => {
    expect(spellPossessionSlug("Assassin Spells")).toBe("assassin");
    expect(spellPossessionSlug("Blackguard Spells")).toBe("blackguard");
    expect(spellPossessionSlug("Sublime Chord Spells")).toBe("sublimechord");
  });
});
