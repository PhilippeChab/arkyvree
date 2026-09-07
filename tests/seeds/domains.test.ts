import { describe, expect, test } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import {
  aptitudesInRules,
  featsAptitudesInRules,
  featsInRules,
  klassesInRules,
  klassLevelsInRules,
  powersAptitudesInRules,
  powersInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import {
  modifiersInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35/v1/domains/data.ts";
import { stripSeparators } from "@/shared/utils.ts";

async function getRulesetId() {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  return ruleset.id;
}

describe("Cleric Domains (dnd35 v2)", () => {
  describe("aptitudes", () => {
    test("Cleric Domain aptitude exists", async () => {
      const rulesetId = await getRulesetId();
      const [apt] = await db
        .select({ id: aptitudesInRules.id })
        .from(aptitudesInRules)
        .where(and(eq(aptitudesInRules.rulesetId, rulesetId), eq(aptitudesInRules.name, "Cleric Domain")));
      expect(apt).toBeDefined();
    });

    test("each domain has a spell aptitude", async () => {
      const rulesetId = await getRulesetId();
      for (const domain of ALL_DOMAINS) {
        const name = `${domain.name} Domain Spells`;
        const [apt] = await db
          .select({ id: aptitudesInRules.id })
          .from(aptitudesInRules)
          .where(and(eq(aptitudesInRules.rulesetId, rulesetId), eq(aptitudesInRules.name, name)));
        expect(apt, `Missing aptitude: ${name}`).toBeDefined();
      }
    });
  });

  describe("domain feats", () => {
    test("all domain feats exist", async () => {
      const rulesetId = await getRulesetId();
      const domainFeats = await db
        .select({ id: featsInRules.id, name: featsInRules.name })
        .from(featsInRules)
        .where(eq(featsInRules.rulesetId, rulesetId));

      const domainFeatNames = domainFeats
        .filter((f) => f.name.endsWith(" Domain"))
        .map((f) => f.name);

      expect(domainFeatNames).toHaveLength(ALL_DOMAINS.length);
      for (const domain of ALL_DOMAINS) {
        expect(domainFeatNames).toContain(`${domain.name} Domain`);
      }
    });

    test("all base domain feats are linked to Cleric Domain aptitude", async () => {
      const rulesetId = await getRulesetId();
      const [clericDomainApt] = await db
        .select({ id: aptitudesInRules.id })
        .from(aptitudesInRules)
        .where(and(eq(aptitudesInRules.rulesetId, rulesetId), eq(aptitudesInRules.name, "Cleric Domain")));

      const links = await db
        .select({ featId: featsAptitudesInRules.featId })
        .from(featsAptitudesInRules)
        .innerJoin(featsInRules, eq(featsAptitudesInRules.featId, featsInRules.id))
        .where(and(
          eq(featsAptitudesInRules.aptitudeId, clericDomainApt.id),
          eq(featsInRules.rulesetId, rulesetId),
        ));

      expect(links).toHaveLength(ALL_DOMAINS.length);
    });

    test("all domain feats are linked to Cleric Domain aptitude (no feat-level requirements)", async () => {
      const rulesetId = await getRulesetId();
      for (const domain of ALL_DOMAINS) {
        const [feat] = await db
          .select({ id: featsInRules.id })
          .from(featsInRules)
          .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, `${domain.name} Domain`)));

        expect(feat, `${domain.name} Domain should exist`).toBeDefined();

        // Domain feats should have no feat-level requirements (gated by Cleric Domain aptitude)
        const reqs = await db
          .select()
          .from(requirementsInCustomization)
          .where(and(eq(requirementsInCustomization.entityId, feat.id), eq(requirementsInCustomization.entityType, "feats")));

        expect(reqs, `${domain.name} Domain should have no feat-level requirements`).toHaveLength(0);
      }
    });

  });

  describe("domain selection", () => {
    test("cleric level 1 grants 2 domain picks", async () => {
      const rulesetId = await getRulesetId();
      const [cleric] = await db
        .select({ id: klassesInRules.id })
        .from(klassesInRules)
        .where(and(eq(klassesInRules.rulesetId, rulesetId), eq(klassesInRules.name, "Cleric")));

      const [level1] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, cleric.id), eq(klassLevelsInRules.level, 1)));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(
          and(
            eq(modifiersInCustomization.sourceId, level1.id),
            eq(modifiersInCustomization.sourceType, "klass_levels"),
            eq(modifiersInCustomization.target, "aptitudes.clericdomain.allowed"),
          ),
        );

      expect(mods).toHaveLength(1);
      expect(mods[0].value).toBe("2");
      expect(mods[0].operator).toBe("add");
    });
  });

  describe("domain spell slot modifiers", () => {
    test("each domain feat grants 9 spell slot uses and 9 allowed modifiers", async () => {
      const rulesetId = await getRulesetId();
      for (const domain of ALL_DOMAINS) {
        const [feat] = await db
          .select({ id: featsInRules.id })
          .from(featsInRules)
          .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, `${domain.name} Domain`)));

        const mods = await db
          .select()
          .from(modifiersInCustomization)
          .where(and(eq(modifiersInCustomization.sourceId, feat.id), eq(modifiersInCustomization.sourceType, "feats")));

        const slug = stripSeparators(domain.name) + "domainspells";
        const usesMods = mods.filter((m) => m.target.startsWith(`aptitudes.${slug}.`) && m.target.endsWith(".uses"));
        const allowedMods = mods.filter((m) => m.target.startsWith(`aptitudes.${slug}.`) && m.target.endsWith(".allowed"));

        expect(usesMods, `${domain.name} Domain should have 9 spell slot uses modifiers`).toHaveLength(9);
        expect(allowedMods, `${domain.name} Domain should have 9 spell allowed modifiers`).toHaveLength(9);

        for (const m of usesMods) {
          expect(m.value).toBe("1");
          expect(m.operator).toBe("add");
        }
        for (const m of allowedMods) {
          expect(m.value).toBe("-1");
          expect(m.operator).toBe("set");
        }
      }
    });

    test("domain spell modifiers for levels 2-9 require matching cleric level", async () => {
      const rulesetId = await getRulesetId();
      const SPELL_LEVEL_OPENS_AT: Record<number, number> = {
        2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 15, 9: 17,
      };

      // Check one domain as representative
      const [feat] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, "War Domain")));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(and(eq(modifiersInCustomization.sourceId, feat.id), eq(modifiersInCustomization.sourceType, "feats")));

      const slug = "wardomainspells";

      for (const [spellLevel, requiredClericLevel] of Object.entries(SPELL_LEVEL_OPENS_AT)) {
        const usesMod = mods.find((m) => m.target === `aptitudes.${slug}.${spellLevel}.uses`);
        const allowedMod = mods.find((m) => m.target === `aptitudes.${slug}.${spellLevel}.allowed`);
        expect(usesMod, `Missing uses modifier for spell level ${spellLevel}`).toBeDefined();
        expect(allowedMod, `Missing allowed modifier for spell level ${spellLevel}`).toBeDefined();

        for (const mod of [usesMod!, allowedMod!]) {
          const reqs = await db
            .select()
            .from(requirementsInCustomization)
            .where(and(eq(requirementsInCustomization.entityId, mod.id), eq(requirementsInCustomization.entityType, "modifiers")));

          expect(reqs, `Modifier ${mod.target} should have 1 requirement`).toHaveLength(1);
          expect(reqs[0].target).toBe("classes.cleric.level");
          expect(reqs[0].operator).toBe("greater_than_or_equal");
          expect(reqs[0].value).toBe(String(requiredClericLevel));
        }
      }

      // Spell level 1 modifiers should have NO extra requirements (gated by feat requirement)
      const usesL1 = mods.find((m) => m.target === `aptitudes.${slug}.1.uses`);
      const allowedL1 = mods.find((m) => m.target === `aptitudes.${slug}.1.allowed`);
      for (const mod of [usesL1!, allowedL1!]) {
        const reqs = await db
          .select()
          .from(requirementsInCustomization)
          .where(and(eq(requirementsInCustomization.entityId, mod.id), eq(requirementsInCustomization.entityType, "modifiers")));
        expect(reqs, `Spell level 1 modifier ${mod.target} should have no extra requirements`).toHaveLength(0);
      }
    });
  });

  describe("class skill modifiers", () => {
    test("Animal domain grants Knowledge (Nature) as class skill", async () => {
      const rulesetId = await getRulesetId();
      const [feat] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, "Animal Domain")));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(
          and(
            eq(modifiersInCustomization.sourceId, feat.id),
            eq(modifiersInCustomization.sourceType, "feats"),
            eq(modifiersInCustomization.target, "skills.knowledgenature.innate"),
          ),
        );

      expect(mods).toHaveLength(1);
      expect(mods[0].operator).toBe("set");
      expect(mods[0].value).toBe("true");
      expect(mods[0].valueType).toBe("boolean");
    });

    test("Knowledge domain grants all 11 Knowledge skills as class skills", async () => {
      const rulesetId = await getRulesetId();
      const [feat] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, "Knowledge Domain")));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(and(eq(modifiersInCustomization.sourceId, feat.id), eq(modifiersInCustomization.sourceType, "feats")));

      const skillMods = mods.filter((m) => m.target.startsWith("skills.knowledge") && m.target.endsWith(".innate"));
      expect(skillMods).toHaveLength(11);

      const expectedSlugs = [
        "knowledgearcana", "knowledgearchitectureandengineering", "knowledgedungeoneering",
        "knowledgegeography", "knowledgehistory", "knowledgelocal", "knowledgenature",
        "knowledgenobilityandroyalty", "knowledgepsionics", "knowledgereligion", "knowledgetheplanes",
      ];
      for (const slug of expectedSlugs) {
        const mod = skillMods.find((m) => m.target === `skills.${slug}.innate`);
        expect(mod, `Missing class skill modifier for ${slug}`).toBeDefined();
      }
    });

    test("Travel domain grants Survival as class skill", async () => {
      const rulesetId = await getRulesetId();
      const [feat] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, "Travel Domain")));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(
          and(
            eq(modifiersInCustomization.sourceId, feat.id),
            eq(modifiersInCustomization.sourceType, "feats"),
            eq(modifiersInCustomization.target, "skills.survival.innate"),
          ),
        );

      expect(mods).toHaveLength(1);
      expect(mods[0].value).toBe("true");
    });

    test("Trickery domain grants Bluff, Disguise, and Hide as class skills", async () => {
      const rulesetId = await getRulesetId();
      const [feat] = await db
        .select({ id: featsInRules.id })
        .from(featsInRules)
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, "Trickery Domain")));

      const mods = await db
        .select()
        .from(modifiersInCustomization)
        .where(and(eq(modifiersInCustomization.sourceId, feat.id), eq(modifiersInCustomization.sourceType, "feats")));

      const skillMods = mods.filter((m) => m.target.endsWith(".innate"));
      expect(skillMods).toHaveLength(3);

      for (const slug of ["bluff", "disguise", "hide"]) {
        const mod = skillMods.find((m) => m.target === `skills.${slug}.innate`);
        expect(mod, `Missing class skill modifier for ${slug}`).toBeDefined();
      }
    });
  });

  describe("domain spells", () => {
    test("each domain has spells linked to its spell aptitude matching data definition", async () => {
      const rulesetId = await getRulesetId();
      for (const domain of ALL_DOMAINS) {
        const [apt] = await db
          .select({ id: aptitudesInRules.id })
          .from(aptitudesInRules)
          .where(and(eq(aptitudesInRules.rulesetId, rulesetId), eq(aptitudesInRules.name, `${domain.name} Domain Spells`)));

        const links = await db
          .select({ powerId: powersAptitudesInRules.powerId, level: powersAptitudesInRules.level })
          .from(powersAptitudesInRules)
          .innerJoin(powersInRules, eq(powersAptitudesInRules.powerId, powersInRules.id))
          .where(and(eq(powersAptitudesInRules.aptitudeId, apt.id), eq(powersInRules.rulesetId, rulesetId)));

        const expectedCount = domain.spells.length;
        expect(links, `${domain.name} Domain Spells should have ${expectedCount} spell links`).toHaveLength(expectedCount);

        // Verify spell levels match the data definition
        const levels = links.map((l) => l.level).sort((a, b) => (a ?? 0) - (b ?? 0));
        const expectedLevels = domain.spells.map((s) => s.level).sort((a, b) => (a ?? 0) - (b ?? 0));
        expect(levels).toEqual(expectedLevels);
      }
    });

    test("domain spells reference existing powers", async () => {
      const rulesetId = await getRulesetId();
      const allPowers = await db
        .select({ id: powersInRules.id, name: powersInRules.name })
        .from(powersInRules)
        .where(eq(powersInRules.rulesetId, rulesetId));
      const powerMap = new Map(allPowers.map((p) => [p.name.toLowerCase(), p.id]));

      for (const domain of ALL_DOMAINS) {
        for (const spell of domain.spells) {
          expect(powerMap.get(spell.name.toLowerCase()), `Spell "${spell.name}" from ${domain.name} Domain not found`).toBeDefined();
        }
      }
    });

  });
});
