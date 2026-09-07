import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets, Users } from "@/server/repositories/index.ts";
import { TargetPathsMethods } from "@/server/services/rulesets/customization/TargetPathsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

function createTestSession(userId: string): Session {
  return {
    id: `session-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("TargetPathsService", () => {
  // Helper to create test user
  async function createTestUser() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    return { user };
  }

  // Helper to get or create DnD 3.5 ruleset
  async function getDnd35Ruleset() {
    // Try to get existing DnD 3.5 ruleset from seed data
    const existingRuleset = await Rulesets.findOne(db, {
      name: DND35_RULESET_NAME,
    });

    if (existingRuleset) {
      return existingRuleset;
    }

    // If not found, create a test ruleset
    const { user } = await createTestUser();
    const rulesets = await Rulesets.create(db, {
      name: "Test DnD 3.5 Ruleset",
      description: "Test ruleset for target paths testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });

    return rulesets[0];
  }

  describe("getTargetPaths", () => {
    test("should return target paths for a valid ruleset with modifier kind", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;

      expect(paths).toBeDefined();
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);

      // Verify path structure
      const firstPath = paths[0];
      expect(firstPath).toHaveProperty("path");
      expect(firstPath).toHaveProperty("category");
      expect(firstPath).toHaveProperty("description");
      expect(firstPath).toHaveProperty("valueType");
      expect(firstPath).toHaveProperty("operators");
      expect(Array.isArray(firstPath.operators)).toBe(true);
    });

    test("should return target paths for a valid ruleset with requirement kind", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "requirement",)).paths;

      expect(paths).toBeDefined();
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    test("should include leveled aptitude paths for spell aptitudes", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;

      // Spell aptitudes (e.g., Wizard Spells) should have per-level paths like aptitudes.wizardspells.0.uses
      const leveledAptitudePaths = paths.filter(
        (p) => p.category === "aptitudes" && /aptitudes\.\w+\.\d+\./.test(p.path),
      );

      expect(leveledAptitudePaths.length).toBeGreaterThan(0);

      // Verify the structure includes wizard spell paths
      const wizardPaths = leveledAptitudePaths.filter((p) => p.path.startsWith("aptitudes.wizardspells."));
      expect(wizardPaths.length).toBeGreaterThan(0);

      // Should have paths for at least level 0 (cantrips)
      const level0Paths = wizardPaths.filter((p) => p.path.includes(".0."));
      expect(level0Paths.length).toBeGreaterThan(0);
    });

    test("should include leveled aptitude paths in forked ruleset", async () => {
      const ruleset = await getDnd35Ruleset();
      const { user } = await createTestUser();
      const session = createTestSession(user.id);

      // Fork the ruleset
      const { RulesetsMethods } = await import("@/server/services/RulesetsService.ts");
      const forked = await RulesetsMethods.forkRuleset(session, ruleset.id, {
        name: `Fork-${Math.random().toString(36).substr(2, 6)}`,
        private: false,
      });

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(forked.id,
        "modifier",)).paths;

      // Forked ruleset should also have leveled aptitude paths
      const leveledAptitudePaths = paths.filter(
        (p) => p.category === "aptitudes" && /aptitudes\.\w+\.\d+\./.test(p.path),
      );

      expect(leveledAptitudePaths.length).toBeGreaterThan(0);

      // Verify wizard spell paths exist in fork
      const wizardPaths = leveledAptitudePaths.filter((p) => p.path.startsWith("aptitudes.wizardspells."));
      expect(wizardPaths.length).toBeGreaterThan(0);
    });

    test("should throw error for non-existent ruleset", async () => {
      const fakeRulesetId = "00000000-0000-0000-0000-000000000000";

      await expect(
        TargetPathsMethods.getTargetPathsWithLabels(fakeRulesetId, "modifier"),
      ).rejects.toThrow();
    });

    test("should include paths from expected categories", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;

      const categories = [...new Set(paths.map((p) => p.category))];

      // DnD 3.5 should have some of these core categories
      // (Not all may be present in test data depending on what's seeded)
      const coreCategories = ["abilities", "skills", "saves", "combat", "identity"];

      for (const expectedCategory of coreCategories) {
        expect(categories).toContain(expectedCategory);
      }

      // At minimum, should have multiple categories
      expect(categories.length).toBeGreaterThan(3);
    });
  });

  describe("validatePath", () => {
    test("should validate a correct path", async () => {
      const ruleset = await getDnd35Ruleset();

      // Get a valid path first
      const allPaths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;
      expect(allPaths.length).toBeGreaterThan(0);

      const validPath = allPaths[0].path;

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        validPath,
        "modifier",
      );

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.suggestions.length).toBe(0);
    });

    test("should return error for empty path", async () => {
      const ruleset = await getDnd35Ruleset();

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        "",
        "modifier",
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Empty string splits to [""] which is treated as invalid category
      expect(result.errors[0].code).toBe("INVALID_CATEGORY");
      expect(result.errors[0].severity).toBe("error");
    });

    test("should return error for invalid category", async () => {
      const ruleset = await getDnd35Ruleset();

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        "invalidcategory.something",
        "modifier",
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe("INVALID_CATEGORY");
      expect(result.errors[0].severity).toBe("error");
      expect(result.errors[0].message).toContain("Unknown category");
    });

    test("should suggest similar categories for invalid category", async () => {
      const ruleset = await getDnd35Ruleset();

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        "abil.something",
        "modifier",
      );

      expect(result.isValid).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions).toContain("abilities");
    });

    test("should return warning for incomplete path", async () => {
      const ruleset = await getDnd35Ruleset();

      // Get a valid path and use only part of it
      const allPaths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;
      const fullPath = allPaths.find((p) => p.path.split(".").length > 1);

      if (fullPath) {
        const segments = fullPath.path.split(".");
        const partialPath = segments.slice(0, -1).join(".");

        const result = await TargetPathsMethods.validatePath(
          ruleset.id,
          partialPath,
          "modifier",
        );

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe("INCOMPLETE_PATH");
        expect(result.errors[0].severity).toBe("warning");
        expect(result.suggestions.length).toBeGreaterThan(0);
      }
    });

    test("should return error for completely invalid path", async () => {
      const ruleset = await getDnd35Ruleset();

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        "abilities.nonexistent.path",
        "modifier",
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const hasInvalidPathError = result.errors.some(
        (e) => e.code === "INVALID_PATH" || e.code === "INCOMPLETE_PATH",
      );
      expect(hasInvalidPathError).toBe(true);
    });

    test("should default to modifier kind when not specified", async () => {
      const ruleset = await getDnd35Ruleset();

      const result = await TargetPathsMethods.validatePath(
        ruleset.id,
        "abilities.strength.score",
      );

      expect(result).toBeDefined();
      expect(result.isValid).toBeDefined();
    });
  });


  describe("getSegmentLabels", () => {
    test("should return labels for all categories", async () => {
      const ruleset = await getDnd35Ruleset();

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      expect(labels).toBeDefined();
      expect(labels.abilities).toBe("Abilities");
      expect(labels.skills).toBe("Skills");
      expect(labels.saves).toBe("Saving Throws");
      expect(labels.combat).toBe("Combat");
      expect(labels.classes).toBe("Classes");
      expect(labels.feats).toBe("Feats");
      expect(labels.powers).toBe("Spells");
      expect(labels.identity).toBe("Identity");
      expect(labels.aptitudes).toBe("Aptitudes");
    });

    test("should return correct labels for abbreviation segments", async () => {
      const ruleset = await getDnd35Ruleset();

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      expect(labels.ac).toBe("Armor Class");
      expect(labels.hp).toBe("Hit Points");
      expect(labels.bab).toBe("Base Attack Bonus");
      expect(labels.xp).toBe("Experience Points");
    });

    test("should return correct labels for concatenated segments", async () => {
      const ruleset = await getDnd35Ruleset();

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      expect(labels.checkpenalty).toBe("Check Penalty");
      expect(labels.spellfailure).toBe("Spell Failure");
      expect(labels.maxdex).toBe("Maximum Dexterity");
    });

    test("should return entity names as labels", async () => {
      const ruleset = await getDnd35Ruleset();

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      // Seed data should have at least some abilities
      expect(labels.strength).toBeDefined();
      expect(labels.dexterity).toBeDefined();
    });

    test("should not have numeric keys colliding with spell levels in segment labels", async () => {
      const ruleset = await getDnd35Ruleset();

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      // Numeric property values (e.g., ARMOR_CHECK_PENALTY "-1" → key "1")
      // should not clobber spell level segment labels
      for (const [key, value] of Object.entries(labels)) {
        if (/^\d+$/.test(key)) {
          expect(value).not.toMatch(/^-\d/);
        }
      }
    });

    test("should have a label for every segment in every generated path", async () => {
      const ruleset = await getDnd35Ruleset();

      const { paths, segmentLabels: labels } = await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier");

      const missingLabels = new Set<string>();

      for (const path of paths) {
        for (const segment of path.path.split(".")) {
          // Skip wildcard segments and numeric segments (spell levels)
          if (segment === "*" || /^\d+$/.test(segment)) continue;
          if (!(segment in labels)) {
            missingLabels.add(segment);
          }
        }
      }

      expect(
        missingLabels.size,
        `Missing labels for segments: ${[...missingLabels].join(", ")}`,
      ).toBe(0);
    });

    test("should capitalize grouping names in combat path descriptions", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;

      const combatPaths = paths.filter((p) => p.category === "combat");

      for (const path of combatPaths) {
        // Description should start with a capital letter
        expect(path.description[0]).toBe(path.description[0].toUpperCase());
      }
    });

    test("should format property types in power descriptions", async () => {
      const ruleset = await getDnd35Ruleset();

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id,
        "modifier",)).paths;

      // Power property paths like powers.magicmissile.properties.SPELL_SCHOOL
      const propertyPaths = paths.filter((p) => p.path.includes(".properties."));

      expect(propertyPaths.length).toBeGreaterThan(0);

      for (const path of propertyPaths) {
        // Description should not contain UPPER_SNAKE_CASE property types
        expect(path.description).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      }
    });
  });

  describe("requirementOnly filtering", () => {
    test("total fields should not appear in modifier paths", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).paths;

      const totalPaths = paths.filter((p) => p.path.endsWith(".total"));
      expect(totalPaths.length).toBe(0);
    });

    test("total fields should appear in requirement paths", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "requirement")).paths;

      const totalPaths = paths.filter((p) => p.path.endsWith(".total"));
      expect(totalPaths.length).toBeGreaterThan(0);

      // Should have totals for combat, skills, saves, abilities
      expect(totalPaths.some((p) => p.path.startsWith("combat.ac"))).toBe(true);
      expect(totalPaths.some((p) => p.path.startsWith("combat.hp"))).toBe(true);
      expect(totalPaths.some((p) => p.path.startsWith("skills."))).toBe(true);
      expect(totalPaths.some((p) => p.path.startsWith("saves."))).toBe(true);
      expect(totalPaths.some((p) => p.path.startsWith("abilities."))).toBe(true);
    });
  });

  describe("entityType filtering", () => {
    test("aptitude uses/allowed paths should appear for klass_levels", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "klass_levels")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBeGreaterThan(0);
    });

    test("aptitude uses/allowed paths should appear for feats", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "feats")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBeGreaterThan(0);
    });

    test("aptitude uses/allowed paths should appear for races", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "races")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBeGreaterThan(0);
    });

    test("aptitude uses/allowed paths should NOT appear for items", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "items")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBe(0);
    });

    test("aptitude uses/allowed paths should NOT appear for powers", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "powers")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBe(0);
    });

    test("non-aptitude paths should appear regardless of entityType", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier", "items")).paths;

      // Combat, abilities, skills etc. should still be available
      expect(paths.some((p) => p.category === "combat")).toBe(true);
      expect(paths.some((p) => p.category === "abilities")).toBe(true);
      expect(paths.some((p) => p.category === "skills")).toBe(true);
    });

    test("no entityType returns all paths including aptitude uses/allowed", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).paths;

      const aptUsesAllowed = paths.filter((p) =>
        p.category === "aptitudes" && (p.path.endsWith(".uses") || p.path.endsWith(".allowed")),
      );
      expect(aptUsesAllowed.length).toBeGreaterThan(0);
    });
  });

  describe("spell known paths", () => {
    test("spell known paths should use short class slugs", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "requirement")).paths;

      const knownPaths = paths.filter((p) => p.path.endsWith(".known") && p.category === "powers");
      expect(knownPaths.length).toBeGreaterThan(0);

      // Should have short slugs like "wizard" not "wizardspells"
      const wizardKnown = knownPaths.filter((p) => p.path.includes(".wizard."));
      expect(wizardKnown.length).toBeGreaterThan(0);

      // Should NOT have old-style "wizardspells" slugs
      const oldStylePaths = knownPaths.filter((p) => p.path.includes("spells.known"));
      expect(oldStylePaths.length).toBe(0);
    });

    test("domain/specialist aptitudes should not generate known paths", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "requirement")).paths;

      const knownPaths = paths.filter((p) => p.path.endsWith(".known") && p.category === "powers");

      // No domain or specialist slugs in known paths
      const domainKnown = knownPaths.filter((p) => p.path.includes("domain"));
      expect(domainKnown.length).toBe(0);

      const specialistKnown = knownPaths.filter((p) => p.path.includes("specialist"));
      expect(specialistKnown.length).toBe(0);
    });
  });

  describe("wildcard labels and descriptions", () => {
    test("wildcard segment should have 'All' label", async () => {
      const ruleset = await getDnd35Ruleset();
      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      expect(labels["*"]).toBe("All");
    });

    test("wildcard modifier paths should use 'All' in descriptions", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).paths;

      const wildcardPaths = paths.filter((p) => p.path.includes(".*"));
      expect(wildcardPaths.length).toBeGreaterThan(0);

      // Modifier wildcard descriptions should say "All" not "Any"
      for (const p of wildcardPaths) {
        if (p.description.includes("Any") || p.description.includes("any")) {
          throw new Error(`Modifier wildcard path "${p.path}" has "Any" in description: "${p.description}"`);
        }
      }
    });

    test("wildcard requirement paths should use 'Any' in descriptions", async () => {
      const ruleset = await getDnd35Ruleset();
      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "requirement")).paths;

      // Feat family wildcards should use "Any"
      const featWildcards = paths.filter((p) => p.category === "feats" && p.path.includes(".*"));
      expect(featWildcards.length).toBeGreaterThan(0);

      for (const p of featWildcards) {
        expect(p.description).toMatch(/^Any /);
      }
    });

    test("spell possession slug labels should strip 'Spells' suffix", async () => {
      const ruleset = await getDnd35Ruleset();
      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(ruleset.id, "modifier")).segmentLabels;

      // "wizard" should map to "Wizard" (not "Wizard Spells")
      expect(labels.wizard).toBe("Wizard");
    });
  });

  describe("COW fork", () => {
    test("should return target paths for a forked ruleset that inherits parent entities", async () => {
      const parentRuleset = await getDnd35Ruleset();

      const { user } = await createTestUser();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork for target paths",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      const paths = (await TargetPathsMethods.getTargetPathsWithLabels(childRuleset.id, "modifier")).paths;

      expect(paths).toBeDefined();
      expect(paths.length).toBeGreaterThan(0);

      // Should include inherited entity paths (abilities, skills, etc.)
      const abilityPaths = paths.filter((p) => p.path.startsWith("abilities."));
      expect(abilityPaths.length).toBeGreaterThan(0);
    });

    test("should return segment labels for a forked ruleset", async () => {
      const parentRuleset = await getDnd35Ruleset();

      const { user } = await createTestUser();
      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${Math.random().toString(36).substr(2, 9)}`,
        description: "COW fork for segment labels",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: user.id,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      const labels = (await TargetPathsMethods.getTargetPathsWithLabels(childRuleset.id, "modifier")).segmentLabels;

      expect(labels).toBeDefined();
      expect(Object.keys(labels).length).toBeGreaterThan(0);
    });
  });
});
