import type {
  BabType,
  ClassSeed,
  ModifierSeed,
  RequirementEntry,
  SaveType,
} from "@/database/packages/dnd35/content/types.ts";
import { idOf, type SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { insertAll, insertModifiers, requirementRows } from "@/database/packages/dnd35/seed/customization.ts";
import {
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import {
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
} from "@/shared/dnd3.5/properties/index.ts";
import { stripSeparators } from "@/shared/text.ts";

const BAB: Record<BabType, (level: number) => number> = {
  good: (level) => level,
  medium: (level) => Math.floor((level * 3) / 4),
  poor: (level) => Math.floor(level / 2),
};

const SAVE: Record<SaveType, (level: number) => number> = {
  good: (level) => Math.floor(level / 2) + 2,
  poor: (level) => Math.floor(level / 3),
};

const CASTER_LEVEL_APTITUDES = {
  divine: ["Bonus Divine Caster Level"],
  arcane: ["Bonus Arcane Caster Level"],
  any: ["Bonus Caster Level"],
  dual: ["Bonus Arcane Caster Level", "Bonus Divine Caster Level"],
};

/** What a table (by class level, then spell level) adds at each class level: `delta` more at `spellLevel`. */
function tableGains(table: number[][]) {
  return table.flatMap((row, i) =>
    row.flatMap((count, spellLevel) => {
      const delta = count - (table[i - 1]?.[spellLevel] ?? 0);
      return delta > 0 ? [{ level: i + 1, spellLevel, delta }] : [];
    }),
  );
}

/** The spell levels a table opens at each class level. */
function tableOpenings(table: number[][]) {
  return table.flatMap((row, i) => {
    const opened = table[i - 1]?.length ?? 0;
    return Array.from({ length: Math.max(row.length - opened, 0) }, (_, j) => ({
      level: i + 1,
      spellLevel: opened + j,
    }));
  });
}

/** A spellcaster's slots in one of its lists, gated by its requirements. */
function listSlots(
  spells: NonNullable<ClassSeed["spells"]>,
  list: { slug: string; requirements: RequirementEntry[] },
): (ModifierSeed & { level: number })[] {
  const slot = (spellLevel: number, kind: string) =>
    `aptitudes.${list.slug}.${spellLevel + (spells.noCantrips ? 1 : 0)}.${kind}`;
  const modifier = (level: number, target: string, value: string, operator: string) => ({
    level,
    target,
    value,
    valueType: "number",
    operator,
    ...(list.requirements.length > 0 && { requirements: list.requirements }),
  });
  return [
    ...tableGains(spells.perDay).map((g) => modifier(g.level, slot(g.spellLevel, "uses"), String(g.delta), "add")),
    ...tableGains(spells.known ?? []).map((g) =>
      modifier(g.level, slot(g.spellLevel, "allowed"), String(g.delta), "add"),
    ),
    ...(spells.knowAll
      ? tableOpenings(spells.perDay).map((o) => modifier(o.level, slot(o.spellLevel, "allowed"), "-1", "set"))
      : []),
  ];
}

/**
 * A spellcaster's slots, by class level: its spells a day, and the spells it knows (`known`) or can prepare,
 * all of each level it can cast (`knowAll`). They go to its list, or to each of its `lists` while that one's
 * requirements are met.
 */
function spellSlots(spells: NonNullable<ClassSeed["spells"]>): (ModifierSeed & { level: number })[] {
  const lists = spells.lists ?? [{ slug: spells.slug, requirements: [] }];
  return lists.flatMap((list) => listSlots(spells, list));
}

/** The class level each spell level opens at, by class. */
export function buildClassSpellLevels(classes: ClassSeed[]): Record<string, Record<number, number>> {
  const byClass: Record<string, Record<number, number>> = {};
  for (const { name, spells } of classes) {
    if (!spells) continue;
    const levels: Record<number, number> = {};
    const offset = spells.noCantrips ? 1 : 0;
    for (const [i, row] of spells.perDay.entries()) {
      for (const [j, count] of row.entries()) {
        if (count !== undefined && !(j + offset in levels)) levels[j + offset] = i + 1;
      }
    }
    byClass[name] = levels;
  }
  return byClass;
}

/**
 * Seeds a class and its levels: their base attack, saves and skill points, spell slots, picks and granted feats,
 * and what it takes to reach each. The class's skills and feats must be seeded.
 */
export async function seedClass(db: Db, ctx: SeedContext, def: ClassSeed) {
  const [klass] = await db
    .insert(klassesInRules)
    .values({
      rulesetId: ctx.rulesetId,
      name: def.name,
      description: def.description,
      hd: def.hd,
      kind: def.kind ?? "pc",
    })
    .returning({ id: klassesInRules.id });
  const levels = await db
    .insert(klassLevelsInRules)
    .values(Array.from({ length: def.levels }, (_, i) => ({ klassId: klass.id, level: i + 1 })))
    .returning({ id: klassLevelsInRules.id, level: klassLevelsInRules.level });
  const levelIds: Record<number, string> = Object.fromEntries(levels.map((l) => [l.level, l.id]));

  const bonusSpellAbilityId = def.bonusSpellAbility && ctx.abilityMap[def.bonusSpellAbility];
  await insertAll(db, propertiesInCustomization, [
    ...(bonusSpellAbilityId
      ? [{ entityId: klass.id, entityType: "klasses", type: KLASS_BONUS_SPELL_ABILITY_ID, value: bonusSpellAbilityId }]
      : []),
    ...(def.casterType
      ? [{ entityId: klass.id, entityType: "klasses", type: KLASS_CASTER_TYPE, value: def.casterType }]
      : []),
    ...levels.flatMap(({ id, level }) => [
      { entityId: id, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(BAB[def.bab](level)) },
      { entityId: id, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: String(def.skillPoints) },
    ]),
  ]);

  await insertAll(
    db,
    klassLevelSavesInRules,
    levels.flatMap(({ id, level }) => [
      { klassLevelId: id, saveId: ctx.saveMap["Fortitude"], base: SAVE[def.saves.fortitude](level) },
      { klassLevelId: id, saveId: ctx.saveMap["Reflex"], base: SAVE[def.saves.reflex](level) },
      { klassLevelId: id, saveId: ctx.saveMap["Will"], base: SAVE[def.saves.will](level) },
    ]),
  );

  // Level modifiers: spell slots, the class's own, and one more pick in an aptitude.
  const levelModifiers = [...(def.spells ? spellSlots(def.spells) : []), ...(def.modifiers ?? [])];
  const advancement = def.casterLevelAdvancement;
  const picks = [
    ...(def.aptitudePicks ?? []),
    ...(advancement
      ? CASTER_LEVEL_APTITUDES[advancement.type].map((aptitude) => ({
          levels: advancement.levels,
          target: `aptitudes.${stripSeparators(aptitude)}.allowed`,
        }))
      : []),
  ];
  await insertModifiers(
    db,
    "klass_levels",
    levels.flatMap(({ id, level }) =>
      [
        ...levelModifiers.filter((m) => m.level === level),
        ...picks
          .filter((pick) => pick.levels.includes(level))
          .map((pick) => ({ target: pick.target, value: "1", valueType: "number", operator: "add" })),
      ].map((modifier) => ({ sourceId: id, modifier })),
    ),
  );

  // Each level after the first takes the one before; the first, the class's requirements.
  const classSlug = stripSeparators(def.name);
  await insertAll(db, requirementsInCustomization, [
    ...levels
      .filter(({ level }) => level >= 2)
      .map(({ id, level }) => ({
        entityId: id,
        entityType: "klass_levels",
        level: "1",
        target: `classes.${classSlug}.level`,
        value: String(level - 1),
        valueType: "number",
        operator: "greater_than",
      })),
    ...requirementRows(levelIds[1], "klass_levels", def.requirements),
  ]);

  await insertAll(
    db,
    klassSkillsInRules,
    def.classSkills.map((name) => ({
      klassId: klass.id,
      skillId: idOf(ctx.skillMap, name, `${def.name}'s class skill`),
    })),
  );

  const granted = (level: number, feat: string, aptitude: string, what: string) => ({
    klassLevelId: levelIds[level],
    featId: idOf(ctx.featMap, feat, `${def.name}'s ${what}`),
    aptitudeId: idOf(ctx.aptMap, aptitude, `${def.name}'s ${what}`),
    free: true,
  });
  const featureAptitude = def.classFeatureAptitude;
  await insertAll(db, klassLevelFeatsInRules, [
    ...(featureAptitude
      ? (def.classFeatures ?? []).map(([level, feat]) =>
          granted(level, feat, featureAptitude, `class feature at level ${level}`),
        )
      : []),
    ...(def.proficiencies ?? []).map((feat) => granted(1, feat, "General", "proficiency")),
    ...(def.freeFeats ?? []).map(([level, feat, aptitude]) =>
      granted(level, feat, aptitude, `free feat at level ${level}`),
    ),
  ]);

  return { klassId: klass.id, levelIds };
}
