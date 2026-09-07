import { PropertyTypesMethods } from "@/server/services/rulesets/customization/PropertyTypesService.ts";
import { AptitudesMethods } from "@/server/services/rulesets/AptitudesService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets, Users } from "@/server/repositories/index.ts";
import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { describe, test, expect } from "bun:test";
import type { EntityType } from "@/shared/customization/properties.ts";
import type { Session } from "@/shared/relations.ts";
import { eq } from "drizzle-orm";
import {
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  DAMAGE_TYPE,
  ITEM_MADE_OF,
  SHIELD_PROFICIENCY,
  SPELL_SCHOOL,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_PROFICIENCY,
} from "@/server/rulesets/dnd3.5/properties/index.ts";

describe("PropertyTypesService", () => {
  function buildSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async function createTestUserAndRuleset() {
    const uniqueId = Math.random().toString(36).substr(2, 9);

    const users = await Users.create(db, {
      username: `testuser-${uniqueId}`,
      emailAddress: `test-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];

    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset for property types testing",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId: user.id,
    });
    const ruleset = rulesets[0];

    return { user, ruleset, session: buildSession(user.id) };
  }

  // Goes through the same service flow the app uses: create a real entity via
  // ItemsService/FeatsService, then attach the property via PropertiesService.
  // Each call gets a uniquely-named entity to avoid the (rulesetId, name)
  // unique constraint.
  async function createCustomProperty(
    session: Session,
    rulesetId: string,
    entityType: EntityType,
    type: string,
    value: string,
    description?: string,
  ) {
    const name = `seed-${type}-${value}-${crypto.randomUUID()}`;
    let entityId: string;
    if (entityType === "items") {
      const item = await ItemsMethods.createRulesetItem(session, rulesetId, { name });
      entityId = item.id;
    } else if (entityType === "feats") {
      const aptitude = await AptitudesMethods.createRulesetAptitude(session, rulesetId, {
        name: `apt-${name}`,
      });
      const feat = await FeatsMethods.createRulesetFeat(session, rulesetId, {
        name,
        aptitudeIds: [aptitude.id],
      });
      entityId = feat.id;
    } else {
      throw new Error(`createCustomProperty test helper does not support entityType=${entityType}`);
    }

    return await PropertiesMethods.createEntityProperty(session, rulesetId, entityType, entityId, {
      type,
      value,
      description,
    });
  }

  describe("getStaticPropertyTypes", () => {
    test("should return all static property types", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id);

      expect(staticTypes).toBeDefined();
      expect(Array.isArray(staticTypes)).toBe(true);
      expect(staticTypes.length).toBeGreaterThan(0);

      // Check that all have required fields
      for (const type of staticTypes) {
        expect(type.value).toBeDefined();
        expect(type.isStatic).toBe(true);
        expect(type.description).toBeDefined();
      }
    });

    test("should include all expected static property types", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id);
      const values = staticTypes.map((t) => t.value);

      expect(values).toContain(WEAPON_PROFICIENCY);
      expect(values).toContain(WEAPON_BASE_DAMAGE);
      expect(values).toContain(WEAPON_CRITICAL_RANGE);
      expect(values).toContain(WEAPON_CRITICAL_MULTIPLIER);
      expect(values).toContain(ARMOR_PROFICIENCY);
      expect(values).toContain(ARMOR_MAX_DEX);
      expect(values).toContain(SHIELD_PROFICIENCY);
      expect(values).toContain(DAMAGE_TYPE);
      expect(values).toContain(ITEM_MADE_OF);
    });

    test("should have descriptions for all static types", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id);

      for (const type of staticTypes) {
        expect(type.description).toBeDefined();
        expect(type.description!.length).toBeGreaterThan(0);
      }
    });

    test("should return only item-related types for items entityType", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id, "items");
      const values = staticTypes.map((t) => t.value);

      expect(values).toContain(WEAPON_PROFICIENCY);
      expect(values).toContain(ARMOR_PROFICIENCY);
      expect(values).toContain(SHIELD_PROFICIENCY);
      expect(values).toContain(DAMAGE_TYPE);
      expect(values).toContain(ITEM_MADE_OF);
      expect(values).not.toContain(SPELL_SCHOOL);
    });

    test("should return only spell-related types for powers entityType", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id, "powers");
      const values = staticTypes.map((t) => t.value);

      expect(values).toContain(SPELL_SCHOOL);
      expect(values).not.toContain(WEAPON_PROFICIENCY);
      expect(values).not.toContain(ARMOR_PROFICIENCY);
    });

    test("should return ruleset property types", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id, "rulesets");
      expect(staticTypes.length).toBe(1);
    });

    test("should return empty for entity types with no static properties", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      for (const entityType of ["races"] as const) {
        const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id, entityType);
        expect(staticTypes.length).toBe(0);
      }
    });

    test("should return klass_level property types", async () => {
      const { ruleset } = await createTestUserAndRuleset();
      const staticTypes = await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id, "klass_levels");
      expect(staticTypes.length).toBe(2);
    });
  });

  describe("getCustomPropertyTypes", () => {
    test("should not return any non-seed custom properties by default", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const customTypes = await PropertyTypesMethods.getCustomPropertyTypes(
        ruleset.id,
      );

      const staticKeys = new Set(
        (await PropertyTypesMethods.getStaticPropertyTypes(ruleset.id)).map((t) => t.value),
      );
      const nonSeedCustom = customTypes.filter(
        (t) => !staticKeys.has(t.value),
      );

      expect(nonSeedCustom).toBeDefined();
      expect(Array.isArray(nonSeedCustom)).toBe(true);
      expect(nonSeedCustom.length).toBe(0);
    });

    test("should return custom property types grouped by type and entityType", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create multiple properties with same type
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_material",
        "steel",
      );
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_material",
        "iron",
      );
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_rarity",
        "common",
      );

      const customTypes = await PropertyTypesMethods.getCustomPropertyTypes(
        ruleset.id,
      );

      expect(customTypes.length).toBeGreaterThanOrEqual(2);

      // Find the custom_material type
      const materialType = customTypes.find((t) => t.value === "custom_material");
      expect(materialType).toBeDefined();
      expect(materialType?.isStatic).toBe(false);
      expect(materialType?.entityType).toBe("items");
      expect(materialType?.usageCount).toBe(2);

      // Find the custom_rarity type
      const rarityType = customTypes.find((t) => t.value === "custom_rarity");
      expect(rarityType).toBeDefined();
      expect(rarityType?.usageCount).toBe(1);
    });

    test("should filter by entityType when provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create properties for different entity types
      await createCustomProperty(session, ruleset.id, "items", "item_property", "value1");
      await createCustomProperty(session, ruleset.id, "feats", "feat_property", "value2");

      const itemTypes = await PropertyTypesMethods.getCustomPropertyTypes(
        ruleset.id,
        "items",
      );

      expect(itemTypes.length).toBeGreaterThanOrEqual(1);
      for (const type of itemTypes) {
        expect(type.entityType).toBe("items");
      }
    });

    test("should exclude deleted properties", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a property and then soft delete it
      const property = await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "deleted_property",
        "value",
      );

      await db
        .update(propertiesInCustomization)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(propertiesInCustomization.id, property.id));

      const customTypes = await PropertyTypesMethods.getCustomPropertyTypes(
        ruleset.id,
      );

      const deletedType = customTypes.find((t) => t.value === "deleted_property");
      expect(deletedType).toBeUndefined();
    });

    test("should order by usage count descending, then by type ascending", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create properties with different usage counts
      await createCustomProperty(session, ruleset.id, "items", "type_a", "value1");
      await createCustomProperty(session, ruleset.id, "items", "type_b", "value1");
      await createCustomProperty(session, ruleset.id, "items", "type_b", "value2");
      await createCustomProperty(session, ruleset.id, "items", "type_c", "value1");
      await createCustomProperty(session, ruleset.id, "items", "type_c", "value2");
      await createCustomProperty(session, ruleset.id, "items", "type_c", "value3");

      const customTypes = await PropertyTypesMethods.getCustomPropertyTypes(
        ruleset.id,
        "items",
      );

      // Find our test types
      const typeA = customTypes.find((t) => t.value === "type_a");
      const typeB = customTypes.find((t) => t.value === "type_b");
      const typeC = customTypes.find((t) => t.value === "type_c");

      expect(typeA?.usageCount).toBe(1);
      expect(typeB?.usageCount).toBe(2);
      expect(typeC?.usageCount).toBe(3);

      // Verify ordering (higher usage count comes first)
      const indexA = customTypes.findIndex((t) => t.value === "type_a");
      const indexB = customTypes.findIndex((t) => t.value === "type_b");
      const indexC = customTypes.findIndex((t) => t.value === "type_c");

      expect(indexC).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexA);
    });
  });

  describe("getPropertyTypes", () => {
    test("should return both static and custom property types", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a custom property
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_type",
        "value1",
      );

      const allTypes = await PropertyTypesMethods.getPropertyTypes(ruleset.id);

      expect(allTypes).toBeDefined();
      expect(Array.isArray(allTypes)).toBe(true);

      // Should have static types
      const hasStaticTypes = allTypes.some((t) => t.isStatic);
      expect(hasStaticTypes).toBe(true);

      // Should have custom types
      const hasCustomTypes = allTypes.some((t) => !t.isStatic);
      expect(hasCustomTypes).toBe(true);

      // Should include our custom type
      const customType = allTypes.find((t) => t.value === "custom_type");
      expect(customType).toBeDefined();
      expect(customType?.isStatic).toBe(false);
    });

    test("should filter both static and custom types by entityType", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create properties for different entity types
      await createCustomProperty(session, ruleset.id, "items", "item_custom", "value1");
      await createCustomProperty(session, ruleset.id, "feats", "feat_custom", "value2");

      const types = await PropertyTypesMethods.getPropertyTypes(
        ruleset.id,
        "items",
      );

      // Should have item-related static types only
      const staticTypes = types.filter((t) => t.isStatic);
      expect(staticTypes.length).toBeGreaterThan(0);
      const staticValues = staticTypes.map((t) => t.value);
      expect(staticValues).toContain(WEAPON_PROFICIENCY);
      expect(staticValues).not.toContain(SPELL_SCHOOL);

      // Should only have custom types for items
      const customTypes = types.filter((t) => !t.isStatic);
      for (const type of customTypes) {
        expect(type.entityType).toBe("items");
      }
    });
  });

  describe("searchPropertyTypes", () => {
    test("should search static types by value", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "weapon",
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // Should find weapon-related static types
      const weaponTypes = results.filter((t) =>
        t.value.toLowerCase().includes("weapon")
      );
      expect(weaponTypes.length).toBeGreaterThan(0);
    });

    test("should search static types by description", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "damage",
      );

      expect(results.length).toBeGreaterThan(0);

      // Should include types with 'damage' in description
      const damageRelated = results.some((t) =>
        t.description?.toLowerCase().includes("damage")
      );
      expect(damageRelated).toBe(true);
    });

    test("should search custom types by value", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create custom properties
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_enchantment",
        "value1",
      );
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_material",
        "value2",
      );

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "enchantment",
      );

      const enchantmentType = results.find((t) => t.value === "custom_enchantment");
      expect(enchantmentType).toBeDefined();
      expect(enchantmentType?.isStatic).toBe(false);
    });

    test("should be case insensitive", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "CustomType",
        "value1",
      );

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "customtype",
      );

      const foundType = results.find((t) => t.value === "CustomType");
      expect(foundType).toBeDefined();
    });

    test("should filter by entityType when provided", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(session, ruleset.id, "items", "item_special", "value1");
      await createCustomProperty(session, ruleset.id, "feats", "feat_special", "value2");

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "special",
        "items",
      );

      const customTypes = results.filter((t) => !t.isStatic);
      for (const type of customTypes) {
        expect(type.entityType).toBe("items");
      }
    });

    test("should return all matching custom results", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      for (let i = 0; i < 10; i++) {
        await createCustomProperty(
          session,
          ruleset.id,
          "items",
          `searchable_type_${i}`,
          "value",
        );
      }

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "searchable",
      );

      const customTypes = results.filter((t) => !t.isStatic);
      expect(customTypes.length).toBe(10);
    });

    test("should return both static and custom results", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create a custom type that matches a common search term
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_type_test",
        "value1",
      );

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "type",
      );

      const hasStatic = results.some((t) => t.isStatic);
      const hasCustom = results.some((t) => !t.isStatic);

      expect(hasStatic).toBe(true);
      expect(hasCustom).toBe(true);
    });

    test("should handle empty query string", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const results = await PropertyTypesMethods.searchPropertyTypes(
        ruleset.id,
        "",
      );

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("getCompletions", () => {
    test("should return completions with proper format", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_property",
        "value1",
      );

      const result = await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "custom",
        { limit: 100, page: 1 },
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);

      for (const completion of result.items) {
        expect(completion.label).toBeDefined();
        expect(completion.value).toBeDefined();
        expect(completion.kind).toBeDefined();
        expect(["engine", "custom"]).toContain(completion.kind);
      }
    });

    test("should set kind to 'engine' for static types", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "weapon",
        { limit: 100, page: 1 },
      )).items;

      const staticCompletions = completions.filter((c) =>
        c.value.toLowerCase().includes("weapon") && c.kind === "engine"
      );

      expect(staticCompletions.length).toBeGreaterThan(0);
      for (const completion of staticCompletions) {
        expect(completion.kind).toBe("engine");
        expect(completion.detail).toBeDefined();
      }
    });

    test("should set kind to 'custom' for custom types", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "custom_completion_test",
        "value1",
      );

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "completion_test",
        { limit: 100, page: 1 },
      )).items;

      const customCompletion = completions.find((c) =>
        c.value === "custom_completion_test"
      );

      expect(customCompletion).toBeDefined();
      expect(customCompletion?.kind).toBe("custom");
    });

    test("should include usage count in detail for custom types", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      // Create same type multiple times
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "used_multiple",
        "value1",
      );
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "used_multiple",
        "value2",
      );
      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "used_multiple",
        "value3",
      );

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "used_multiple",
        { limit: 100, page: 1 },
      )).items;

      const completion = completions.find((c) => c.value === "used_multiple");
      expect(completion).toBeDefined();
      expect(completion?.detail).toContain("3 times");
    });

    test("should use singular 'time' for usage count of 1", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(
        session,
        ruleset.id,
        "items",
        "used_once",
        "value1",
      );

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "used_once",
        { limit: 100, page: 1 },
      )).items;

      const completion = completions.find((c) => c.value === "used_once");
      expect(completion).toBeDefined();
      expect(completion?.detail).toContain("1 time");
      expect(completion?.detail).not.toContain("times");
    });

    test("should include entityType in detail for custom types", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(
        session,
        ruleset.id,
        "feats",
        "feat_property",
        "value1",
      );

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "feat_property",
        { limit: 100, page: 1 },
      )).items;

      const completion = completions.find((c) => c.value === "feat_property");
      expect(completion).toBeDefined();
      expect(completion?.detail).toContain("in feats");
      expect(completion?.entityType).toBe("feats");
    });

    test("should use static description for detail on static types", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        WEAPON_PROFICIENCY,
        { limit: 100, page: 1 },
      )).items;

      const weaponTypeCompletion = completions.find((c) =>
        c.value === WEAPON_PROFICIENCY
      );

      expect(weaponTypeCompletion).toBeDefined();
      expect(weaponTypeCompletion?.detail).toBe("Weapon proficiency classification (Simple, Martial, Exotic)");
    });

    test("should set label and value to same type value", async () => {
      const { ruleset } = await createTestUserAndRuleset();

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "weapon",
        { limit: 100, page: 1 },
      )).items;

      for (const completion of completions) {
        expect(completion.label).toBe(completion.value);
      }
    });

    test("should filter results by entityType parameter", async () => {
      const { ruleset, session } = await createTestUserAndRuleset();

      await createCustomProperty(session, ruleset.id, "items", "filtered_item", "value1");
      await createCustomProperty(session, ruleset.id, "feats", "filtered_feat", "value2");

      const completions = (await PropertyTypesMethods.getCompletions(
        ruleset.id,
        "filtered",
        { limit: 100, page: 1 },
        "items",
      )).items;

      const customCompletions = completions.filter((c) => c.kind === "custom");
      for (const completion of customCompletions) {
        expect(completion.entityType).toBe("items");
      }
    });
  });
});
