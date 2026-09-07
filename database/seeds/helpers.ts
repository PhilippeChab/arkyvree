import { and, eq, isNull } from "drizzle-orm";
import {
  abilitiesInRules,
  type alignment,
  aptitudesInRules,
  characterAbilitiesInCharacter,
  charactersInCharacter,
  featsInRules,
  type gender,
  inventoryInCharacter,
  itemsInRules,
  klassesInRules,
  type location,
  klassLevelsInRules,
  languagesInCharacter,
  languagesInRules,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelSkillsInCharacter,
  levelsInCharacter,
  powersInRules,
  racesInRules,
  rulesetsInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export const SEED_USER_ID = "00000000-0000-4000-8000-000000000456";

/**
 * Group kinded rows (races, klasses) by kind, then by name. Callers spell out
 * which kind they want (`ctx.raceMap.pc["Human"]`, `ctx.raceMap.familiar["Owl"]`)
 * so name collisions between e.g. familiar-kind and animalcompanion-kind rows
 * resolve unambiguously at the call site.
 */
function buildKindMap(rows: { name: string; id: string; kind: string }[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    (out[row.kind] ??= {})[row.name] = row.id;
  }
  return out;
}

export type SeedContext = {
  rulesetId: string;
  abilityMap: Record<string, string>;
  skillMap: Record<string, string>;
  featMap: Record<string, string>;
  aptMap: Record<string, string>;
  langMap: Record<string, string>;
  /** Race id by kind, then name. Use `raceMap.pc["Human"]`, `raceMap.familiar["Owl"]`. */
  raceMap: Record<string, Record<string, string>>;
  /** Klass id by kind, then name. Use `klassMap.pc["Fighter"]`, `klassMap.familiar["Familiar"]`. */
  klassMap: Record<string, Record<string, string>>;
  powerMap: Record<string, string>;
  itemMap: Record<string, string>;
};

export async function getSeedContext(db: Db): Promise<SeedContext> {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));

  const rulesetId = ruleset.id;

  const [abilities, skills, feats, aptitudes, langs, races, klasses, powers, items] =
    await Promise.all([
      db
        .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
        .from(abilitiesInRules)
        .where(and(eq(abilitiesInRules.rulesetId, rulesetId), isNull(abilitiesInRules.deletedAt))),
      db
        .select({ id: skillsInRules.id, name: skillsInRules.name })
        .from(skillsInRules)
        .where(eq(skillsInRules.rulesetId, rulesetId)),
      db
        .select({ id: featsInRules.id, name: featsInRules.name })
        .from(featsInRules)
        .where(eq(featsInRules.rulesetId, rulesetId)),
      db
        .select({ id: aptitudesInRules.id, name: aptitudesInRules.name })
        .from(aptitudesInRules)
        .where(eq(aptitudesInRules.rulesetId, rulesetId)),
      db
        .select({ id: languagesInRules.id, name: languagesInRules.name })
        .from(languagesInRules)
        .where(eq(languagesInRules.rulesetId, rulesetId)),
      db
        .select({ id: racesInRules.id, name: racesInRules.name, kind: racesInRules.kind })
        .from(racesInRules)
        .where(eq(racesInRules.rulesetId, rulesetId)),
      db
        .select({ id: klassesInRules.id, name: klassesInRules.name, kind: klassesInRules.kind })
        .from(klassesInRules)
        .where(eq(klassesInRules.rulesetId, rulesetId)),
      db
        .select({ id: powersInRules.id, name: powersInRules.name })
        .from(powersInRules)
        .where(eq(powersInRules.rulesetId, rulesetId)),
      db
        .select({ id: itemsInRules.id, name: itemsInRules.name })
        .from(itemsInRules)
        .where(eq(itemsInRules.rulesetId, rulesetId)),
    ]);

  return {
    rulesetId,
    abilityMap: Object.fromEntries(abilities.map((a) => [a.name, a.id])),
    skillMap: Object.fromEntries(skills.map((s) => [s.name, s.id])),
    featMap: Object.fromEntries(feats.map((f) => [f.name, f.id])),
    aptMap: Object.fromEntries(aptitudes.map((a) => [a.name, a.id])),
    langMap: Object.fromEntries(langs.map((l) => [l.name, l.id])),
    raceMap: buildKindMap(races),
    klassMap: buildKindMap(klasses),
    powerMap: Object.fromEntries(powers.map((p) => [p.name, p.id])),
    itemMap: Object.fromEntries(items.map((i) => [i.name, i.id])),
  };
}

export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: {
    raceName: string;
    name: string;
    xp: number;
    alignment: (typeof alignment.enumValues)[number];
    age: number;
    gender: (typeof gender.enumValues)[number];
    height: string;
    weight: string;
    description: string;
    abilities: Record<string, number>;
    languages: string[];
    /** Override the ruleset (e.g., to place the character in a fork that subscribes to an extension). Defaults to seed. */
    rulesetId?: string;
  },
) {
  const [character] = await db
    .insert(charactersInCharacter)
    .values({
      userId: SEED_USER_ID,
      rulesetId: data.rulesetId ?? ctx.rulesetId,
      raceId: ctx.raceMap.pc[data.raceName],
      name: data.name,
      xp: data.xp,
      alignment: data.alignment,
      age: data.age,
      gender: data.gender,
      height: data.height,
      weight: data.weight,
      description: data.description,
    })
    .returning({ id: charactersInCharacter.id });

  await db.insert(characterAbilitiesInCharacter).values(
    Object.entries(data.abilities).map(([name, score]) => ({
      characterId: character.id,
      abilityId: ctx.abilityMap[name],
      score,
    })),
  );

  for (const lang of data.languages) {
    await db.insert(languagesInCharacter).values({
      characterId: character.id,
      languageId: ctx.langMap[lang],
    });
  }

  return character.id;
}

export async function addClassLevels(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  className: string,
  levels: number[],
  hpPerLevel: number[],
) {
  const klassId = ctx.klassMap.pc[className];
  const levelIds: string[] = [];

  for (let i = 0; i < levels.length; i++) {
    const [klassLevel] = await db
      .select({ id: klassLevelsInRules.id })
      .from(klassLevelsInRules)
      .where(and(eq(klassLevelsInRules.klassId, klassId), eq(klassLevelsInRules.level, levels[i])));

    const [charLevel] = await db
      .insert(levelsInCharacter)
      .values({ characterId, klassLevelId: klassLevel.id, hp: hpPerLevel[i] })
      .returning({ id: levelsInCharacter.id });

    levelIds.push(charLevel.id);
  }

  return levelIds;
}

export async function addSkills(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  skills: { levelIndex: number; skillName: string; rank: number }[],
) {
  for (const s of skills) {
    await db.insert(levelSkillsInCharacter).values({
      characterLevelId: charLevelIds[s.levelIndex],
      skillId: ctx.skillMap[s.skillName],
      rank: s.rank,
    });
  }
}

export async function addFeats(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  feats: { levelIndex: number; featName: string; aptitude: string }[],
) {
  if (feats.length === 0) return;
  await db.insert(levelFeatsInCharacter).values(
    feats.map((f) => ({
      characterLevelId: charLevelIds[f.levelIndex],
      featId: ctx.featMap[f.featName],
      aptitudeId: ctx.aptMap[f.aptitude],
    })),
  );
}

export async function addPowers(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  powers: { levelIndex: number; powerName: string; aptitude: string }[],
) {
  if (powers.length === 0) return;
  await db.insert(levelPowersInCharacter).values(
    powers.map((p) => ({
      characterLevelId: charLevelIds[p.levelIndex],
      powerId: ctx.powerMap[p.powerName],
      aptitudeId: ctx.aptMap[p.aptitude],
    })),
  );
}

export async function addInventory(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  items: { name: string; quantity: number; equipped?: boolean; location?: (typeof location.enumValues)[number]; weaponSet?: number }[],
) {
  if (items.length === 0) return;
  await db.insert(inventoryInCharacter).values(
    items.map((item) => ({
      characterId,
      itemId: ctx.itemMap[item.name],
      quantity: item.quantity,
      equipped: item.equipped ?? false,
      location: item.location,
      weaponSet: item.weaponSet,
    })),
  );
}
