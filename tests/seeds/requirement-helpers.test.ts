import { describe, expect, test } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import {
  featsInRules,
  itemsInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

// ── Helpers ──

async function getBaseRulesetId() {
  const [r] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  return r.id;
}

async function getFeatByName(rulesetId: string, name: string) {
  const [f] = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, name)));
  return f;
}

async function getRequirements(entityId: string, entityType = "feats") {
  return db
    .select({
      level: requirementsInCustomization.level,
      target: requirementsInCustomization.target,
      operator: requirementsInCustomization.operator,
      value: requirementsInCustomization.value,
      valueType: requirementsInCustomization.valueType,
      chainingOperator: requirementsInCustomization.chainingOperator,
    })
    .from(requirementsInCustomization)
    .where(and(
      eq(requirementsInCustomization.entityId, entityId),
      eq(requirementsInCustomization.entityType, entityType),
    ));
}

// ── Tests ──

describe("seeded requirement format integrity", () => {
  describe("weapons.ts — weapon feats use correct helpers", () => {
    test("Weapon Focus: Longsword requires martial proficiency OR + BAB >= 1", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Weapon Focus: Longsword");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);

      // Should have an OR group for proficiency (martial prof OR per-weapon prof)
      const orGroup = reqs.find((r) => r.chainingOperator === "or" && !r.target);
      expect(orGroup, "should have an OR proficiency group").toBeDefined();

      // Children of the OR: Martial Weapon Proficiency and Martial Weapon Proficiency: Longsword
      const martialProf = reqs.find((r) =>
        r.target === "feats.martialweaponproficiency.possessed" &&
        r.operator === "equal" && r.value === "true" && r.valueType === "boolean",
      );
      expect(martialProf, "should require Martial Weapon Proficiency").toBeDefined();

      const perWeaponProf = reqs.find((r) =>
        r.target === "feats.martialweaponproficiencylongsword.possessed" &&
        r.operator === "equal" && r.value === "true" && r.valueType === "boolean",
      );
      expect(perWeaponProf, "should require Martial Weapon Proficiency: Longsword").toBeDefined();

      // BAB >= 1
      const babReq = reqs.find((r) =>
        r.target === "combat.bab" &&
        r.operator === "greater_than_or_equal" && r.value === "1" && r.valueType === "number",
      );
      expect(babReq, "should require BAB >= 1").toBeDefined();
    });

    test("Weapon Specialization: Longsword requires Weapon Focus + Fighter 4", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Weapon Specialization: Longsword");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);

      const focusReq = reqs.find((r) =>
        r.target === "feats.weaponfocuslongsword.possessed" &&
        r.operator === "equal" && r.value === "true",
      );
      expect(focusReq, "should require Weapon Focus: Longsword").toBeDefined();

      const fighterReq = reqs.find((r) =>
        r.target === "classes.fighter.level" &&
        r.operator === "greater_than_or_equal" && r.value === "4",
      );
      expect(fighterReq, "should require Fighter level 4").toBeDefined();
    });

    test("Greater Weapon Specialization: Greatsword requires 3 feats + Fighter 12", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Greater Weapon Specialization: Greatsword");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);

      const expectedTargets = [
        "feats.weaponfocusgreatsword.possessed",
        "feats.greaterweaponfocusgreatsword.possessed",
        "feats.weaponspecializationgreatsword.possessed",
      ];
      for (const target of expectedTargets) {
        const req = reqs.find((r) => r.target === target && r.operator === "equal" && r.value === "true");
        expect(req, `should require ${target}`).toBeDefined();
      }

      const fighterReq = reqs.find((r) =>
        r.target === "classes.fighter.level" && r.value === "12",
      );
      expect(fighterReq, "should require Fighter level 12").toBeDefined();
    });

    test("Weapon Focus: Longsword has no war domain weapon anti-stacking requirement (v29 removed them)", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Weapon Focus: Longsword");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);

      const antiStackReq = reqs.find((r) =>
        r.target === "feats.wardomainweaponlongsword.possessed" &&
        r.operator === "not_equal" && r.value === "true",
      );
      expect(antiStackReq, "anti-stacking requirement should NOT exist after v29 migration").toBeUndefined();
    });

    test("Weapon Focus: Dagger requires simple proficiency (blanket or per-weapon) + BAB >= 1", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Weapon Focus: Dagger");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);

      // Simple weapons have an OR group: blanket proficiency OR per-weapon proficiency
      const orGroup = reqs.find((r) => r.chainingOperator === "or");
      expect(orGroup, "should have an OR proficiency group").toBeDefined();

      const simpleProf = reqs.find((r) =>
        r.target === "feats.simpleweaponproficiency.possessed" &&
        r.operator === "equal" && r.value === "true",
      );
      expect(simpleProf, "should require Simple Weapon Proficiency").toBeDefined();

      const perWeaponProf = reqs.find((r) =>
        r.target === "feats.simpleweaponproficiencydagger.possessed" &&
        r.operator === "equal" && r.value === "true",
      );
      expect(perWeaponProf, "should require Simple Weapon Proficiency: Dagger").toBeDefined();
    });
  });

  describe("itemCreation.ts — caster level requirements", () => {
    test("Brew Potion requires caster level 3 (arcane OR divine)", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Brew Potion");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(3);

      const orGroup = reqs.find((r) => r.chainingOperator === "or" && !r.target);
      expect(orGroup, "should have an OR group for arcane/divine").toBeDefined();

      const arcaneReq = reqs.find((r) => r.target === "spellcasting.arcane" && r.value === "3");
      expect(arcaneReq, "should require arcane caster level 3").toBeDefined();

      const divineReq = reqs.find((r) => r.target === "spellcasting.divine" && r.value === "3");
      expect(divineReq, "should require divine caster level 3").toBeDefined();
    });

    test("Forge Ring requires caster level 12 (arcane OR divine)", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Forge Ring");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(3);

      const arcaneReq = reqs.find((r) => r.target === "spellcasting.arcane" && r.value === "12");
      expect(arcaneReq, "should require arcane caster level 12").toBeDefined();

      const divineReq = reqs.find((r) => r.target === "spellcasting.divine" && r.value === "12");
      expect(divineReq, "should require divine caster level 12").toBeDefined();
    });
  });

  describe("casterLevelAdvancement.ts — class level requirements", () => {
    test("Advance Wizard Spellcasting requires wizard level 1", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Advance Wizard Spellcasting");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].target).toBe("classes.wizard.level");
      expect(reqs[0].operator).toBe("greater_than_or_equal");
      expect(reqs[0].value).toBe("1");
      expect(reqs[0].valueType).toBe("number");
    });

    test("Advance Bard Spellcasting requires bard level 1", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Advance Bard Spellcasting");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].target).toBe("classes.bard.level");
      expect(reqs[0].value).toBe("1");
    });
  });

  describe("schools.ts — spell focus feats", () => {
    test("Greater Spell Focus: Evocation requires Spell Focus: Evocation", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Greater Spell Focus: Evocation");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].target).toBe("feats.spellfocusevocation.possessed");
      expect(reqs[0].operator).toBe("equal");
      expect(reqs[0].value).toBe("true");
      expect(reqs[0].valueType).toBe("boolean");
    });
  });

  describe("wizardSchools.ts — wizard specialization requirements", () => {
    test("Necromancy Specialist requires wizard level 1", async () => {
      const baseId = await getBaseRulesetId();
      const feat = await getFeatByName(baseId, "Necromancy Specialist");
      expect(feat).toBeDefined();

      const reqs = await getRequirements(feat.id);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].target).toBe("classes.wizard.level");
      expect(reqs[0].operator).toBe("greater_than_or_equal");
      expect(reqs[0].value).toBe("1");
      expect(reqs[0].valueType).toBe("number");
    });
  });

  describe("items/types.ts — item proficiency requirements", () => {
    test("Handaxe requires martial prof OR per-weapon prof", async () => {
      const baseId = await getBaseRulesetId();

      const [item] = await db
        .select({ id: itemsInRules.id })
        .from(itemsInRules)
        .where(and(eq(itemsInRules.rulesetId, baseId), eq(itemsInRules.name, "Handaxe")));
      expect(item).toBeDefined();

      const reqs = await getRequirements(item.id, "items");

      const orGroup = reqs.find((r) => r.chainingOperator === "or" && !r.target);
      expect(orGroup, "Handaxe should have an OR proficiency group").toBeDefined();

      const martialProf = reqs.find((r) => r.target === "feats.martialweaponproficiency.possessed");
      expect(martialProf, "should include Martial Weapon Proficiency").toBeDefined();

      const perWeaponProf = reqs.find((r) => r.target === "feats.martialweaponproficiencyhandaxe.possessed");
      expect(perWeaponProf, "should include Martial Weapon Proficiency: Handaxe").toBeDefined();
    });

    test("Longsword requires martial prof OR per-weapon prof (standard martial)", async () => {
      const baseId = await getBaseRulesetId();

      const [item] = await db
        .select({ id: itemsInRules.id })
        .from(itemsInRules)
        .where(and(eq(itemsInRules.rulesetId, baseId), eq(itemsInRules.name, "Longsword")));
      expect(item).toBeDefined();

      const reqs = await getRequirements(item.id, "items");

      const orGroup = reqs.find((r) => r.chainingOperator === "or");
      expect(orGroup, "Longsword should have an OR proficiency group").toBeDefined();

      const children = reqs.filter((r) => r.target && r.operator === "equal" && r.value === "true");
      expect(children).toHaveLength(2);
    });
  });
});
