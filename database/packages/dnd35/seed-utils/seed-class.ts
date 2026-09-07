import {
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelsInRules,
  klassLevelSavesInRules,
  klassSkillsInRules,
} from "@/drizzle/schema.ts";
import {
  modifiersInCustomization,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE, KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { buildRequirements, computeDeltas, goodSave, mediumBab, newSpellLevels, poorBab, poorSave } from "@/database/packages/dnd35/seed-utils/helpers.ts";
import type { BabType, ClassContext, ClassSeed, SaveType } from "@/database/packages/dnd35/seed-utils/types.ts";

const babFn: Record<BabType, (level: number) => number> = {
  good: (level) => level,
  medium: mediumBab,
  poor: poorBab,
};

const saveFn: Record<SaveType, (level: number) => number> = {
  good: goodSave,
  poor: poorSave,
};

export async function seedClass(
  db: Db, rulesetId: string, def: ClassSeed, ctx: ClassContext,
): Promise<{ klassId: string; levelIds: Record<number, string> }> {
  const { saveMap, skillMap, featMap, aptMap } = ctx;
  const classSlug = stripSeparators(def.name);

  // 1. Insert klass
  const [klass] = await db
    .insert(klassesInRules)
    .values({ rulesetId, name: def.name, description: def.description, hd: def.hd, kind: def.kind ?? "pc" })
    .returning({ id: klassesInRules.id });

  // 2. Bonus spell ability property
  if (def.bonusSpellAbility) {
    const abilityId = ctx.abilityMap[def.bonusSpellAbility];
    if (abilityId) {
      await db.insert(propertiesInCustomization).values({
        entityId: klass.id, entityType: "klasses",
        type: KLASS_BONUS_SPELL_ABILITY_ID, value: abilityId,
      });
    }
  }

  // 2b. Caster type property
  if (def.casterType) {
    await db.insert(propertiesInCustomization).values({
      entityId: klass.id, entityType: "klasses",
      type: KLASS_CASTER_TYPE, value: def.casterType,
    });
  }

  // 3. Pre-compute spell data
  let perDayDeltas: { level: number; spellLevel: number; delta: number }[] = [];
  let knownDeltas: { level: number; spellLevel: number; delta: number }[] = [];
  let spellNewLevels: { level: number; spellLevel: number }[] = [];
  if (def.spells) {
    perDayDeltas = computeDeltas(def.spells.perDay);
    if (def.spells.known) {
      knownDeltas = computeDeltas(def.spells.known);
    }
    if (def.spells.knowAll) {
      spellNewLevels = newSpellLevels(def.spells.perDay);
    }
  }

  // 3. Merge casterLevelAdvancement into aptitude picks
  const allAptitudePicks = [...(def.aptitudePicks ?? [])];
  if (def.casterLevelAdvancement) {
    if (def.casterLevelAdvancement.type === "dual") {
      allAptitudePicks.push({
        levels: def.casterLevelAdvancement.levels,
        target: `aptitudes.${stripSeparators("Bonus Arcane Caster Level")}.allowed`,
      });
      allAptitudePicks.push({
        levels: def.casterLevelAdvancement.levels,
        target: `aptitudes.${stripSeparators("Bonus Divine Caster Level")}.allowed`,
      });
    } else {
      const aptName = def.casterLevelAdvancement.type === "divine"
        ? "Bonus Divine Caster Level"
        : def.casterLevelAdvancement.type === "arcane"
        ? "Bonus Arcane Caster Level"
        : "Bonus Caster Level";
      allAptitudePicks.push({
        levels: def.casterLevelAdvancement.levels,
        target: `aptitudes.${stripSeparators(aptName)}.allowed`,
      });
    }
  }

  // 4. Insert levels
  const levelIds: Record<number, string> = {};
  for (let level = 1; level <= def.levels; level++) {
    const [klassLevel] = await db
      .insert(klassLevelsInRules)
      .values({ klassId: klass.id, level })
      .returning({ id: klassLevelsInRules.id });

    levelIds[level] = klassLevel.id;

    // BAB + skill points
    await db.insert(propertiesInCustomization).values([
      { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(babFn[def.bab](level)) },
      { entityId: klassLevel.id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: String(def.skillPoints) },
    ]);

    // Saves
    await db.insert(klassLevelSavesInRules).values([
      { klassLevelId: klassLevel.id, saveId: saveMap["Fortitude"], base: saveFn[def.saves.fortitude](level) },
      { klassLevelId: klassLevel.id, saveId: saveMap["Reflex"], base: saveFn[def.saves.reflex](level) },
      { klassLevelId: klassLevel.id, saveId: saveMap["Will"], base: saveFn[def.saves.will](level) },
    ]);

    // Spell modifiers
    if (def.spells) {
      const offset = def.spells.noCantrips ? 1 : 0;
      const slug = def.spells.slug;

      // Per-day (uses)
      for (const d of perDayDeltas.filter((d) => d.level === level)) {
        await db.insert(modifiersInCustomization).values({
          sourceId: klassLevel.id, sourceType: "klass_levels",
          target: `aptitudes.${slug}.${d.spellLevel + offset}.uses`,
          value: String(d.delta), valueType: "number", operator: "add",
        });
      }

      // Known (allowed) — wizard/sorcerer/bard pattern
      if (def.spells.known) {
        for (const d of knownDeltas.filter((d) => d.level === level)) {
          await db.insert(modifiersInCustomization).values({
            sourceId: klassLevel.id, sourceType: "klass_levels",
            target: `aptitudes.${slug}.${d.spellLevel + offset}.allowed`,
            value: String(d.delta), valueType: "number", operator: "add",
          });
        }
      }

      // Know-all (allowed = -1) — cleric/druid/paladin/ranger pattern
      if (def.spells.knowAll) {
        for (const n of spellNewLevels.filter((n) => n.level === level)) {
          await db.insert(modifiersInCustomization).values({
            sourceId: klassLevel.id, sourceType: "klass_levels",
            target: `aptitudes.${slug}.${n.spellLevel + offset}.allowed`,
            value: "-1", valueType: "number", operator: "set",
          });
        }
      }
    }

    // Custom modifiers
    if (def.modifiers) {
      for (const m of def.modifiers.filter((m) => m.level === level)) {
        await db.insert(modifiersInCustomization).values({
          sourceId: klassLevel.id, sourceType: "klass_levels",
          target: m.target, value: m.value, valueType: m.valueType, operator: m.operator,
        });
      }
    }

    // Aptitude picks
    if (allAptitudePicks.length > 0) {
      for (const pick of allAptitudePicks) {
        if (pick.levels.includes(level)) {
          await db.insert(modifiersInCustomization).values({
            sourceId: klassLevel.id, sourceType: "klass_levels",
            target: pick.target, value: "1", valueType: "number", operator: "add",
          });
        }
      }
    }

    // Level ≥ 2 progression requirement
    if (level >= 2) {
      await db.insert(requirementsInCustomization).values({
        entityId: klassLevel.id, entityType: "klass_levels", level: "1",
        target: `classes.${classSlug}.level`, value: String(level - 1), valueType: "number", operator: "greater_than",
      });
    }

    // Prestige class requirements on L1
    if (level === 1 && def.requirements) {
      const reqs = buildRequirements(klassLevel.id, "klass_levels", def.requirements);
      if (reqs.length > 0) {
        await db.insert(requirementsInCustomization).values(reqs);
      }
    }
  }

  // 4. Class skills
  for (const name of def.classSkills) {
    if (!skillMap[name]) throw new Error(`[${def.name}] classSkill: skill "${name}" not found in skillMap`);
    await db.insert(klassSkillsInRules).values({ klassId: klass.id, skillId: skillMap[name] });
  }

  // 5. Class features
  if (def.classFeatures && def.classFeatureAptitude) {
    const aptId = aptMap[def.classFeatureAptitude];
    for (const [level, featName] of def.classFeatures) {
      if (!featMap[featName]) throw new Error(`[${def.name}] classFeature L${level}: feat "${featName}" not found in featMap`);
      await db.insert(klassLevelFeatsInRules).values({
        klassLevelId: levelIds[level], featId: featMap[featName], aptitudeId: aptId, free: true,
      });
    }
  }

  // 6. Proficiencies (General aptitude, L1)
  if (def.proficiencies) {
    const generalAptId = aptMap["General"];
    for (const name of def.proficiencies) {
      if (!featMap[name]) throw new Error(`[${def.name}] proficiency: feat "${name}" not found in featMap`);
      await db.insert(klassLevelFeatsInRules).values({
        klassLevelId: levelIds[1], featId: featMap[name], aptitudeId: generalAptId, free: true,
      });
    }
  }

  // 7. Free feats (specific aptitude + level)
  if (def.freeFeats) {
    for (const [level, featName, aptName] of def.freeFeats) {
      if (!featMap[featName]) throw new Error(`[${def.name}] freeFeat L${level}: feat "${featName}" not found in featMap`);
      await db.insert(klassLevelFeatsInRules).values({
        klassLevelId: levelIds[level], featId: featMap[featName], aptitudeId: aptMap[aptName], free: true,
      });
    }
  }

  return { klassId: klass.id, levelIds };
}
