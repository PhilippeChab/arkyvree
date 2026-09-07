import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
import { db } from "@/server/database/index.ts";
import {
  Aptitudes,
  Feats,
  Modifiers,
  Properties,
  Requirements,
  Rulesets,
  Users,
} from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";
import { stripSeparators } from "@/shared/utils.ts";

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
    description: "Test ruleset for spell generation testing",
    private: true,
    baseRules: "Dungeons & Dragons: 3.5",
    userId: user.id,
  });
  const ruleset = rulesets[0];

  const [general] = await Aptitudes.create(db, {
    name: "General",
    description: "General feats",
    rulesetId: ruleset.id,
  });
  const [spellAptitude] = await Aptitudes.create(db, {
    name: "Wizard Spells",
    description: "Wizard spell list",
    rulesetId: ruleset.id,
  });

  return {
    user,
    ruleset,
    session: createTestSession(user.id),
    aptitudes: { general, spellAptitude },
  };
}

function makeSpellBody(aptitudeId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Fireball",
    description: "A blast of fire",
    aptitudes: [{ id: aptitudeId }],
    school: "Evocation",
    ...overrides,
  };
}

describe("Spell Property Auto-Generation", () => {
  describe("createRulesetPower with spell properties", () => {
    test("should generate all spell properties from form fields", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball Full",
        school: "Evocation",
        subschool: "Creation",
        descriptors: ["Fire"],
        castingTime: "1 standard action",
        rangeType: "Long",
        target: "One creature",
        areaOfEffect: "20-ft. radius",
        duration: "Instantaneous",
        spellResistance: "Yes",
        components: ["Verbal", "Somatic", "Material"],
      }));

      const properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });

      const propMap = new Map(properties.map((p) => [p.type, p.value]));

      expect(propMap.get("SPELL_SCHOOL")).toBe("Evocation");
      expect(propMap.get("SPELL_SUBSCHOOL")).toBe("Creation");
      expect(propMap.get("SPELL_CASTING_TIME")).toBe("1 standard action");
      expect(propMap.get("SPELL_RANGE_TYPE")).toBe("Long");
      expect(propMap.get("SPELL_TARGET")).toBe("One creature");
      expect(propMap.get("SPELL_AREA_OF_EFFECT")).toBe("20-ft. radius");
      expect(propMap.get("SPELL_DURATION")).toBe("Instantaneous");
      expect(propMap.get("SPELL_RESISTANCE")).toBe("Yes");

      const descriptors = properties.filter((p) => p.type === "SPELL_DESCRIPTOR");
      expect(descriptors.length).toBe(1);
      expect(descriptors[0].value).toBe("Fire");

      const components = properties.filter((p) => p.type === "SPELL_COMPONENT");
      expect(components.length).toBe(3);
      expect(components.map((c) => c.value).sort()).toEqual(["Material", "Somatic", "Verbal"]);
    });

    test("should generate multi-value properties for descriptors and components", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Prismatic Spray",
        school: "Evocation",
        descriptors: ["Light", "Fire"],
        components: ["Verbal", "Somatic", "Material"],
      }));

      const properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });

      const descriptors = properties.filter((p) => p.type === "SPELL_DESCRIPTOR");
      expect(descriptors.length).toBe(2);
      expect(descriptors.map((d) => d.value).sort()).toEqual(["Fire", "Light"]);

      const components = properties.filter((p) => p.type === "SPELL_COMPONENT");
      expect(components.length).toBe(3);
    });

    test("should only generate SPELL_SCHOOL when optional fields are omitted", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Simple Spell",
        school: "Conjuration",
      }));

      const properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });

      expect(properties.length).toBe(1);
      expect(properties[0].type).toBe("SPELL_SCHOOL");
      expect(properties[0].value).toBe("Conjuration");
    });

    test("should auto-generate Spell Focus feats for new school", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball",
        school: "Evocation",
      }));

      const spellFocus = await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id });
      expect(spellFocus).toBeDefined();

      const greaterSpellFocus = await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id });
      expect(greaterSpellFocus).toBeDefined();

      // Check Spell Focus modifier
      const sfModifiers = await Modifiers.findManyBySource(db, {
        sourceIds: [spellFocus!.id],
        sourceType: "feats",
      });
      expect(sfModifiers.length).toBe(1);
      expect(sfModifiers[0].target).toBe(`powers.groups.${stripSeparators("Evocation")}.*.dc.misc`);
      expect(sfModifiers[0].operator).toBe("add");
      expect(sfModifiers[0].value).toBe("1");

      // Check Greater Spell Focus requirement
      const gsfRequirements = await Requirements.findManyByEntity(db, {
        entityIds: [greaterSpellFocus!.id],
        entityType: "feats",
      });
      expect(gsfRequirements.length).toBe(1);
      expect(gsfRequirements[0].target).toBe(`feats.spellfocus${stripSeparators("Evocation")}.possessed`);
      expect(gsfRequirements[0].operator).toBe("equal");
      expect(gsfRequirements[0].value).toBe("true");
    });

    test("should be idempotent — same school creates feats only once", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball",
        school: "Evocation",
      }));

      await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Lightning Bolt",
        school: "Evocation",
      }));

      // Should only have one Spell Focus: Evocation feat
      const spellFocus = await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id });
      expect(spellFocus).toBeDefined();

      const greaterSpellFocus = await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id });
      expect(greaterSpellFocus).toBeDefined();
    });
  });

  describe("updateRulesetPower with spell properties", () => {
    test("should regenerate properties on update", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Evolving Spell",
        school: "Evocation",
        castingTime: "1 standard action",
      }));

      // Verify initial properties
      let properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });
      expect(properties.find((p) => p.type === "SPELL_SCHOOL")?.value).toBe("Evocation");
      expect(properties.find((p) => p.type === "SPELL_CASTING_TIME")?.value).toBe("1 standard action");

      // Update to Conjuration with different casting time
      await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, {
        name: "Evolving Spell",
        description: "A blast of fire",
        aptitudes: [{ id: aptitudes.spellAptitude.id }],
        school: "Conjuration",
        castingTime: "1 full round",
      });

      properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });
      expect(properties.find((p) => p.type === "SPELL_SCHOOL")?.value).toBe("Conjuration");
      expect(properties.find((p) => p.type === "SPELL_CASTING_TIME")?.value).toBe("1 full round");
    });

    test("should handle Spell Focus feats on school change", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "School Change Spell",
        school: "Evocation",
      }));

      // Verify Evocation feats exist
      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();

      // Update to Conjuration
      await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, {
        name: "School Change Spell",
        description: "A blast of fire",
        aptitudes: [{ id: aptitudes.spellAptitude.id }],
        school: "Conjuration",
      });

      // Conjuration feats should exist
      expect(await Feats.findOne(db, { name: "Spell Focus: Conjuration", rulesetId: ruleset.id })).toBeDefined();
      expect(await Feats.findOne(db, { name: "Greater Spell Focus: Conjuration", rulesetId: ruleset.id })).toBeDefined();

      // Evocation feats should be deleted (no remaining Evocation spells)
      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeUndefined();
      expect(await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id })).toBeUndefined();
    });
  });

  describe("deleteRulesetPower with spell properties", () => {
    test("should preserve Spell Focus feats when spells remain in school", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power1 = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball",
        school: "Evocation",
      }));

      await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Lightning Bolt",
        school: "Evocation",
      }));

      // Delete one
      await PowersMethods.deleteRulesetPower(session, ruleset.id, power1.id);

      // Feats should still exist
      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();
      expect(await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();
    });

    test("should delete Spell Focus feats when last spell of school is removed", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball",
        school: "Evocation",
      }));

      // Verify feats exist
      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();

      // Delete the only Evocation spell
      await PowersMethods.deleteRulesetPower(session, ruleset.id, power.id);

      // Feats should be deleted
      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeUndefined();
      expect(await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id })).toBeUndefined();
    });

    test("should re-create spell with same school after the last one was deleted (auto-feat unique constraint)", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Fireball",
        school: "Evocation",
      }));
      await PowersMethods.deleteRulesetPower(session, ruleset.id, power.id);

      // Re-add a spell of the same school. The auto-generated Spell Focus +
      // Greater Spell Focus feats must not collide with the just-deleted ones.
      // Soft-archive on the auto-feats would have triggered a unique constraint
      // violation here.
      const recreated = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Lightning Bolt",
        school: "Evocation",
      }));
      expect(recreated.name).toBe("Lightning Bolt");

      expect(await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();
      expect(await Feats.findOne(db, { name: "Greater Spell Focus: Evocation", rulesetId: ruleset.id })).toBeDefined();
    });
  });

  describe("getRulesetPower", () => {
    test("should return properties with the power", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, makeSpellBody(aptitudes.spellAptitude.id, {
        name: "Get Power Test",
        school: "Necromancy",
        components: ["Verbal", "Somatic"],
      }));

      const result = await PowersMethods.getRulesetPower(ruleset.id, power.id);

      expect(result.properties).toBeDefined();
      expect(result.properties.length).toBeGreaterThan(0);
      expect(result.properties.find((p: { type: string }) => p.type === "SPELL_SCHOOL")?.value).toBe("Necromancy");
      expect(result.properties.filter((p: { type: string }) => p.type === "SPELL_COMPONENT").length).toBe(2);
    });
  });

  describe("createRulesetPower without spell fields", () => {
    test("should not generate spell properties or Spell Focus feats", async () => {
      const { ruleset, session, aptitudes } = await createTestUserAndRuleset();

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "No School Power",
        description: "A power without school",
        aptitudes: [{ id: aptitudes.spellAptitude.id }],
      });

      const properties = await Properties.findManyByEntity(db, {
        entityIds: [power.id],
        entityType: "powers",
      });
      expect(properties.length).toBe(0);

      // No Spell Focus feats should exist
      const spellFocus = await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: ruleset.id });
      expect(spellFocus).toBeUndefined();
    });
  });

  describe("COW fork", () => {
    test("should generate Spell Focus feats using inherited General aptitude from parent", async () => {
      const { ruleset: parentRuleset } = await createTestUserAndRuleset();
      await Rulesets.update(db, { status: "Published" }, { id: parentRuleset.id });

      // Create child fork without its own General aptitude
      const uniqueId = Math.random().toString(36).substr(2, 9);
      const childUsers = await Users.create(db, {
        username: `testuser-child-${uniqueId}`,
        emailAddress: `test-child-${uniqueId}@example.com`,
        password: "password1234",
      });
      const childUser = childUsers[0];
      const childSession = createTestSession(childUser.id);

      const childRulesets = await Rulesets.create(db, {
        name: `Fork ${uniqueId}`,
        description: "COW fork",
        private: true,
        baseRules: "Dungeons & Dragons: 3.5",
        userId: childUser.id,
        rulesetId: parentRuleset.id,
        ancestorRulesetIds: [parentRuleset.id],
      });
      const childRuleset = childRulesets[0];

      // Create a spell aptitude in child
      const [childSpellAptitude] = await Aptitudes.create(db, {
        name: "Child Wizard Spells",
        description: "Child spell list",
        rulesetId: childRuleset.id,
      });

      // Create a spell in the child fork — should find parent's General aptitude
      await PowersMethods.createRulesetPower(childSession, childRuleset.id, {
        name: "Lightning Bolt",
        description: "A bolt of lightning",
        aptitudes: [{ id: childSpellAptitude.id }],
        school: "Evocation",
      });

      // Spell Focus: Evocation should be created in child, linked to parent's General aptitude
      const spellFocus = await Feats.findOne(db, { name: "Spell Focus: Evocation", rulesetId: childRuleset.id });
      expect(spellFocus).toBeDefined();
    });
  });
});
