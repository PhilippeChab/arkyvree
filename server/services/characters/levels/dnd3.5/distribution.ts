/**
 * Level-up distribution pipeline.
 *
 * - computePerLevelAptitudeSlots — calculates feat/power slot deltas per level from modifier data
 * - buildPowerLevelLookup, getDeferredAptitudeSources, buildSkillContexts — what the distribution reads of the ruleset and character
 * - distributePoolSelections — distributes pooled user selections (skills, feats, powers) into per-level payloads
 */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { ALLOWED_ALL, Dnd35LevelsRules, type Dnd35LevelUpProjector } from "@/server/rulesets/dnd3.5/index.ts";
import { parseLiteralValue } from "@/server/rulesets/engine/paths/literalValue.ts";
import { distributeSkillPoints } from "@/shared/dnd3.5/skills.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Modifier, Skill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

interface DistributedLevel {
  skills: Record<string, number>;
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
}
type FeatSlots = Record<string, number[]>;

type PowerSlots = Record<string, Record<string, number>[]>;

/** A planned level's slot deltas: per feat pool, and per power pool and spell level. */
interface SlotDeltas {
  feats: Record<string, number>;
  powers: Record<string, Record<string, number>>;
}

export interface PerLevelDistributionData {
  perLevelSkillPoints: number[];
  perLevelClassSkillIds: string[][];
  perLevelFeatSlots: FeatSlots;
  perLevelPowerSlots: PowerSlots;
  baseCharacterLevel: number;
  /** Map of skillId → { isClassSkill, currentRank } for existing character skills */
  skillContexts: Map<string, { isClassSkill: boolean; currentRank: number }>;
}

/** The slots an all-known spell level counts as: every spell of its level. */
const ALL_KNOWN_SLOTS = 999;

const FEAT_POOL_TARGET = /^aptitudes\.(\w+)\.allowed$/;
const SPELL_POOL_TARGET = /^aptitudes\.(\w+)\.(\d+)\.allowed$/;

/**
 * Adds what modifiers targeting a pool's `aptitudes.<slug>.allowed` (a feat pool) or `aptitudes.<slug>.<level>.allowed`
 * (a power pool's spell level) give a level. Setting a spell level's to -1, "all spells known", counts as all of them.
 */
function addModifierDeltas(
  deltas: SlotDeltas,
  modifiers: Modifier[],
  aptitudeSlugToId: Map<string, string>,
  perLevelFeatSlots: FeatSlots,
  perLevelPowerSlots: PowerSlots,
) {
  for (const mod of modifiers) {
    // A pool's slots take a literal: an add, or a spell level's set to -1 (the paths allow nothing else)
    const value = parseLiteralValue(mod.value, "number");
    if (typeof value !== "number") continue;
    const featMatch = FEAT_POOL_TARGET.exec(mod.target);
    if (featMatch) {
      const aptId = aptitudeSlugToId.get(featMatch[1]);
      if (aptId && perLevelFeatSlots[aptId]) {
        deltas.feats[aptId] = (deltas.feats[aptId] ?? 0) + value;
      }
      continue;
    }
    const spellMatch = SPELL_POOL_TARGET.exec(mod.target);
    if (spellMatch) {
      const aptId = aptitudeSlugToId.get(spellMatch[1]);
      if (aptId && perLevelPowerSlots[aptId]) {
        if (!deltas.powers[aptId]) deltas.powers[aptId] = {};
        const spellLevel = spellMatch[2];
        if (mod.operator === "set" && value === -1) {
          deltas.powers[aptId][spellLevel] = ALL_KNOWN_SLOTS;
        } else {
          deltas.powers[aptId][spellLevel] = (deltas.powers[aptId][spellLevel] ?? 0) + value;
        }
      }
    }
  }
}

/** The spell levels whose spells the character knows all of already, by `aptitudeId:level`. */
function allKnownLevels(aptitudes: Record<string, { id: string } & Record<string, unknown>>): Set<string> {
  const known = new Set<string>();
  for (const aptitude of Object.values(aptitudes)) {
    for (const [level, entry] of Object.entries(aptitude)) {
      if (/^\d+$/.test(level) && isRecord(entry) && entry.allowed === ALLOWED_ALL) known.add(`${aptitude.id}:${level}`);
    }
  }
  return known;
}

/**
 * Caps a skill's points at what each level can take: the ranks its max rank leaves (a cross-class rank costs two
 * points) and the points it has left. What goes over moves on to the next level.
 */
function capAtMaxRanks(
  data: PerLevelDistributionData,
  skillId: string,
  perLevel: number[],
  remainingPointsPerLevel: number[],
) {
  const ctx = data.skillContexts.get(skillId);
  if (!ctx) return;

  let isClassSoFar = ctx.isClassSkill;
  let cumulativeRank = ctx.currentRank;
  let overflow = 0;
  for (let i = 0; i < perLevel.length; i++) {
    perLevel[i] += overflow;
    overflow = 0;

    if (data.perLevelClassSkillIds[i].includes(skillId)) {
      isClassSoFar = true;
    }
    if (perLevel[i] === 0) continue;

    const charLevelAtI = data.baseCharacterLevel + i + 1;
    const maxRank = isClassSoFar ? charLevelAtI + 3 : (charLevelAtI + 3) / 2;
    const isClassForLevel = data.perLevelClassSkillIds[i].includes(skillId);
    const headroom = maxRank - cumulativeRank;
    const maxPointsByRank = Math.max(0, Math.floor(isClassForLevel ? headroom : headroom * 2));
    const maxPointsByBudget = remainingPointsPerLevel[i];
    const maxPoints = Math.min(maxPointsByRank, maxPointsByBudget);

    if (perLevel[i] > maxPoints) {
      overflow = perLevel[i] - maxPoints;
      perLevel[i] = maxPoints;
    }
    const actualRank = isClassForLevel ? perLevel[i] : perLevel[i] * 0.5;
    cumulativeRank += actualRank;
  }
}

/**
 * Puts each pool's feats into the levels' slots. A pool with no slots, one a feat's modifier created, goes on the
 * level its source feat went to (the first when that's unknown).
 */
function distributeFeats(
  data: PerLevelDistributionData,
  feats: Record<string, string[]>,
  deferredAptitudeSources: Map<string, string>,
  result: DistributedLevel[],
) {
  const deferredFeatEntries: [string, string[]][] = [];
  const assignedFeatLevels = new Map<string, number>();

  for (const [aptitudeId, featIds] of Object.entries(feats)) {
    const slotsPerLevel = data.perLevelFeatSlots[aptitudeId] ?? [];
    if (!slotsPerLevel.some((s) => s > 0)) {
      deferredFeatEntries.push([aptitudeId, featIds]);
      continue;
    }

    fillSlots(
      result.length,
      featIds,
      (i) => slotsPerLevel[i] ?? 0,
      (i, featId) => {
        (result[i].feats[aptitudeId] ??= []).push(featId);
        assignedFeatLevels.set(featId, i);
      },
    );
  }

  for (const [aptitudeId, featIds] of deferredFeatEntries) {
    let targetLevel = 0;
    const sourceFeatId = deferredAptitudeSources.get(aptitudeId);
    if (sourceFeatId) {
      const lvl = assignedFeatLevels.get(sourceFeatId);
      if (lvl !== undefined) targetLevel = lvl;
    }

    if (!result[targetLevel].feats[aptitudeId]) result[targetLevel].feats[aptitudeId] = [];
    for (const featId of featIds) {
      result[targetLevel].feats[aptitudeId].push(featId);
    }
  }
}

/**
 * Puts each pool's powers into the levels' slots: in order for an unleveled pool, by spell level for a leveled one
 * (a power's level per pool from `powerLevelLookup`).
 */
function distributePowers(
  data: PerLevelDistributionData,
  powers: Record<string, string[]>,
  powerLevelLookup: Map<string, number | null>,
  result: DistributedLevel[],
) {
  for (const [aptitudeId, powerIds] of Object.entries(powers)) {
    const slotsPerLevel = data.perLevelPowerSlots[aptitudeId] ?? [];
    const place = (i: number, powerId: string) => (result[i].powers[aptitudeId] ??= []).push(powerId);

    const powersByLevel = new Map<string, string[]>();
    let hasLevels = false;
    for (const powerId of powerIds) {
      const pl = powerLevelLookup.get(`${powerId}:${aptitudeId}`);
      const key = String(pl ?? 0);
      if (pl !== undefined && pl !== null) hasLevels = true;
      if (!powersByLevel.has(key)) powersByLevel.set(key, []);
      powersByLevel.get(key)!.push(powerId);
    }

    if (!hasLevels) {
      const totalSlotsAt = (i: number) => Object.values(slotsPerLevel[i] ?? {}).reduce((sum, n) => sum + n, 0);
      fillSlots(result.length, powerIds, totalSlotsAt, place);
    } else {
      for (const [plKey, levelPowerIds] of powersByLevel) {
        fillSlots(result.length, levelPowerIds, (i) => (slotsPerLevel[i] ?? {})[plKey] ?? 0, place);
      }
    }
  }
}

/** Spreads each skill's points over the levels, within each level's points and max ranks. */
function distributeSkills(data: PerLevelDistributionData, skills: Record<string, number>, result: DistributedLevel[]) {
  const remainingPointsPerLevel = [...data.perLevelSkillPoints];

  for (const [skillId, totalPoints] of Object.entries(skills)) {
    if (totalPoints <= 0) continue;

    const { perLevel } = distributeSkillPoints(
      skillId,
      totalPoints,
      data.perLevelClassSkillIds,
      remainingPointsPerLevel,
    );
    capAtMaxRanks(data, skillId, perLevel, remainingPointsPerLevel);

    for (let i = 0; i < result.length; i++) {
      if (perLevel[i] > 0) {
        result[i].skills[skillId] = (result[i].skills[skillId] ?? 0) + perLevel[i];
        remainingPointsPerLevel[i] -= perLevel[i];
      }
    }
  }
}

/** Hands `ids` out in order to the levels' slots, as many to a level as `slotsAt` gives it. */
function fillSlots(
  levelCount: number,
  ids: string[],
  slotsAt: (level: number) => number,
  place: (level: number, id: string) => void,
) {
  let pickIndex = 0;
  for (let i = 0; i < levelCount && pickIndex < ids.length; i++) {
    const slots = slotsAt(i);
    for (let s = 0; s < slots && pickIndex < ids.length; s++) {
      place(i, ids[pickIndex]);
      pickIndex++;
    }
  }
}

/**
 * A planned level's slot deltas: its klass level's modifiers, the modifiers of the feats granted there, and the
 * general feat every third character level.
 */
function levelDeltas(
  rulesetData: RulesetData,
  klassLevelId: string,
  autoFeatRecords: { featsInRule: { id: string } }[],
  charLevel: number,
  perLevelFeatSlots: FeatSlots,
  perLevelPowerSlots: PowerSlots,
): SlotDeltas {
  const deltas: SlotDeltas = { feats: {}, powers: {} };
  const aptitudeSlugToId = rulesetData.aptitudeIdBySlug;
  const modifiersBySourceId = rulesetData.modifiersBySource;
  const add = (modifiers: Modifier[]) =>
    addModifierDeltas(deltas, modifiers, aptitudeSlugToId, perLevelFeatSlots, perLevelPowerSlots);

  add(modifiersBySourceId.get(klassLevelId) ?? []);
  for (const rec of autoFeatRecords) {
    add(modifiersBySourceId.get(rec.featsInRule.id) ?? []);
  }

  const generalAptId = aptitudeSlugToId.get(Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG);
  if (generalAptId && perLevelFeatSlots[generalAptId]) {
    const generalDelta =
      Dnd35LevelsRules.countGeneralFeats(charLevel) - Dnd35LevelsRules.countGeneralFeats(charLevel - 1);
    if (generalDelta > 0) {
      deltas.feats[generalAptId] = (deltas.feats[generalAptId] ?? 0) + generalDelta;
    }
  }
  return deltas;
}

/**
 * The spell level of each of these powers in each pool it's linked to, by `powerId:aptitudeId`: a spell can be at
 * different levels in different pools (Wizard 1, Bard 0).
 */
export function buildPowerLevelLookup(rulesetData: RulesetData, powerIds: string[]) {
  const lookup = new Map<string, number | null>();
  for (const powerId of powerIds) {
    const power = rulesetData.powersById.get(powerId);
    if (!power) continue;
    for (const pa of power.powersAptitudesInRules) {
      lookup.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
    }
  }
  return lookup;
}

/** Each skill's current rank, and whether it's a class skill: innate to the character, or a planned class's. */
export function buildSkillContexts(
  levelUpProjector: Dnd35LevelUpProjector,
  skills: Skill[],
  classSkillIds: Set<string>,
) {
  const characterSkills = levelUpProjector.getCharacterSkills();
  const contexts = new Map<string, { isClassSkill: boolean; currentRank: number }>();
  for (const skill of skills) {
    const skillData = characterSkills[stripSeparators(skill.name)] as { innate?: boolean; rank?: number } | undefined;
    contexts.set(skill.id, {
      isClassSkill: skillData?.innate ?? classSkillIds.has(skill.id),
      currentRank: skillData?.rank || 0,
    });
  }
  return contexts;
}

/**
 * Computes per-level feat and power slot deltas from modifier data directly,
 * without incremental DetailedCharacter builds. Used by both getLevelUpPreview
 * and finalizeLevelUp.
 *
 * For each planned level, the delta comes from:
 * 1. Klass level modifiers targeting `aptitudes.<slug>.allowed`
 * 2. Auto-granted feat modifiers targeting aptitudes
 * 3. Auto-granted feat/power counts per aptitude
 * 4. General feat formula: `floor(charLevel/3) + 1`
 *
 * Baseline unspent slots (e.g., Human racial bonus) are captured by the
 * full character build and added to the first level's delta.
 */
export function computePerLevelAptitudeSlots(
  rulesetData: RulesetData,
  klassLevelIds: string[],
  allAutoGrantedFeatRecords: { aptitudeId: string; featsInRule: { id: string } }[][],
  featPoolIds: string[],
  powerPoolIds: string[],
  baseCharacterLevel: number,
  // The character's aptitudes as its sheet has them: a pool's counts, and a power pool's spell levels by number
  baselineAptitudes: Record<string, { id: string; allowed: number; spent: number } & Record<string, unknown>>,
): {
  perLevelFeatSlots: FeatSlots;
  perLevelPowerSlots: PowerSlots;
} {
  const perLevelFeatSlots: FeatSlots = {};
  const perLevelPowerSlots: PowerSlots = {};
  for (const aptId of featPoolIds) perLevelFeatSlots[aptId] = [];
  for (const aptId of powerPoolIds) perLevelPowerSlots[aptId] = [];
  // A spell level all known (the character's already, or a planned level's set -1) takes no slot from a later add:
  // the sheet's count, and the class tables'
  const allKnown = allKnownLevels(baselineAptitudes);

  for (let i = 0; i < klassLevelIds.length; i++) {
    const deltas = levelDeltas(
      rulesetData,
      klassLevelIds[i],
      allAutoGrantedFeatRecords[i] ?? [],
      baseCharacterLevel + i + 1,
      perLevelFeatSlots,
      perLevelPowerSlots,
    );
    for (const aptId of featPoolIds) {
      perLevelFeatSlots[aptId].push(Math.max(0, deltas.feats[aptId] ?? 0));
    }
    for (const aptId of powerPoolIds) {
      const slots: Record<string, number> = {};
      for (const [sl, delta] of Object.entries(deltas.powers[aptId] ?? {})) {
        const key = `${aptId}:${sl}`;
        if (allKnown.has(key)) continue;
        if (delta >= ALL_KNOWN_SLOTS) allKnown.add(key);
        if (delta > 0) slots[sl] = Math.min(delta, ALL_KNOWN_SLOTS);
      }
      perLevelPowerSlots[aptId].push(slots);
    }
  }

  // Add baseline unspent slots to the first level (e.g., Human racial bonus feat)
  for (const [, apt] of Object.entries(baselineAptitudes)) {
    const baselineAvailable = apt.allowed - apt.spent;
    if (baselineAvailable > 0 && perLevelFeatSlots[apt.id]?.[0] !== undefined) {
      perLevelFeatSlots[apt.id][0] += baselineAvailable;
    }
  }

  return { perLevelFeatSlots, perLevelPowerSlots };
}

/**
 * Distributes pool-level selections into per-level payloads using the
 * per-level slot/point data computed by computePerLevelAptitudeSlots.
 */
export function distributePoolSelections(
  data: PerLevelDistributionData,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
  /** Map of powerId:aptitudeId → powerLevel for leveled aptitude distribution */
  powerLevelLookup: Map<string, number | null>,
  /** Map of aptitudeId → source featId that created it via modifier */
  deferredAptitudeSources: Map<string, string>,
): DistributedLevel[] {
  const result: DistributedLevel[] = Array.from({ length: data.perLevelSkillPoints.length }, () => ({
    skills: {},
    feats: {},
    powers: {},
  }));
  distributeSkills(data, skills, result);
  distributeFeats(data, feats, deferredAptitudeSources, result);
  distributePowers(data, powers, powerLevelLookup, result);
  return result;
}

/**
 * The feat each pool with no slots of its own comes from: a pool a feat's modifier creates (`aptitudes.<slug>….allowed`)
 * goes with the first-pass feat that targets it.
 */
export function getDeferredAptitudeSources(
  rulesetData: RulesetData,
  feats: Record<string, string[]>,
  perLevelFeatSlots: FeatSlots,
) {
  const hasSlots = (aptId: string) => (perLevelFeatSlots[aptId] ?? []).some((s) => s > 0);
  const deferredAptitudeIds = Object.keys(feats).filter((aptId) => !hasSlots(aptId));
  const sources = new Map<string, string>();
  if (deferredAptitudeIds.length === 0) return sources;

  const deferredAptIdSet = new Set(deferredAptitudeIds);
  const firstPassFeatIds = Object.entries(feats)
    .filter(([aptId]) => hasSlots(aptId))
    .flatMap(([, ids]) => ids);
  for (const featId of firstPassFeatIds) {
    const mods = rulesetData.modifiersBySource.get(featId);
    if (!mods) continue;
    for (const mod of mods) {
      const match = mod.target.match(/^aptitudes\.(\w+)\..*allowed/);
      if (!match) continue;
      const aptId = rulesetData.aptitudeIdBySlug.get(match[1]);
      if (aptId && deferredAptIdSet.has(aptId)) {
        sources.set(aptId, mod.sourceId);
      }
    }
  }
  return sources;
}
