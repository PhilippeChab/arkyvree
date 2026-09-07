/**
 * Level-up distribution pipeline.
 *
 * - computePerLevelAptitudeSlots — calculates feat/power slot deltas per level from modifier data
 * - distributePoolSelections — distributes pooled user selections (skills, feats, powers) into per-level payloads
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { distributeSkillPoints } from "@/shared/dnd3.5/skills.ts";

export interface PerLevelDistributionData {
  perLevelSkillPoints: number[];
  perLevelClassSkillIds: string[][];
  perLevelFeatSlots: Record<string, number[]>;
  perLevelPowerSlots: Record<string, Record<string, number>[]>;
  baseCharacterLevel: number;
  /** Map of skillId → { isClassSkill, currentRank } for existing character skills */
  skillContexts: Map<string, { isClassSkill: boolean; currentRank: number }>;
}

export interface DistributedLevel {
  skills: Record<string, number>;
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
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
  rulesetData: CachedRulesetData,
  klassLevelIds: string[],
  allAutoGrantedFeatRecords: { aptitudeId: string; featsInRule: { id: string } }[][],
  featPoolIds: string[],
  powerPoolIds: string[],
  baseCharacterLevel: number,
  baselineAptitudes: Record<string, { id: string; allowed: number; spent: number }>,
): {
  perLevelFeatSlots: Record<string, number[]>;
  perLevelPowerSlots: Record<string, Record<string, number>[]>;
} {
  const perLevelFeatSlots: Record<string, number[]> = {};
  const perLevelPowerSlots: Record<string, Record<string, number>[]> = {};
  for (const aptId of featPoolIds) perLevelFeatSlots[aptId] = [];
  for (const aptId of powerPoolIds) perLevelPowerSlots[aptId] = [];

  // Slug→ID and per-source modifier maps are pre-built on the composed cache.
  const aptitudeSlugToId = rulesetData.aptitudeIdBySlug;
  const modifiersBySourceId = rulesetData.modifiersBySource;

  // Regex for modifier targets
  const featPoolRegex = /^aptitudes\.(\w+)\.allowed$/;
  const spellPoolRegex = /^aptitudes\.(\w+)\.(\d+)\.allowed$/;

  // Find the General aptitude ID
  const generalAptId = aptitudeSlugToId.get("general");
  const generalFormula = (charLevel: number) => charLevel === 0 ? 0 : Math.floor(charLevel / 3) + 1;

  for (let i = 0; i < klassLevelIds.length; i++) {
    const klassLevelId = klassLevelIds[i];
    const charLevel = baseCharacterLevel + i + 1;

    // Accumulate feat slot deltas for this level
    const featDeltas: Record<string, number> = {};
    const powerDeltas: Record<string, Record<string, number>> = {};

    // 1. Klass level modifiers
    const klassLevelMods = modifiersBySourceId.get(klassLevelId) ?? [];
    for (const mod of klassLevelMods) {
      const featMatch = featPoolRegex.exec(mod.target);
      if (featMatch) {
        const aptId = aptitudeSlugToId.get(featMatch[1]);
        if (aptId && perLevelFeatSlots[aptId]) {
          featDeltas[aptId] = (featDeltas[aptId] ?? 0) + Number(mod.value);
        }
        continue;
      }
      const spellMatch = spellPoolRegex.exec(mod.target);
      if (spellMatch) {
        const aptId = aptitudeSlugToId.get(spellMatch[1]);
        if (aptId && perLevelPowerSlots[aptId]) {
          if (!powerDeltas[aptId]) powerDeltas[aptId] = {};
          const spellLevel = spellMatch[2];
          if (mod.operator === "set" && Number(mod.value) === -1) {
            // "All" spells known — use a large number
            powerDeltas[aptId][spellLevel] = 999;
          } else {
            powerDeltas[aptId][spellLevel] = (powerDeltas[aptId][spellLevel] ?? 0) + Number(mod.value);
          }
        }
      }
    }

    // 2. Auto-granted feat modifiers (feats granted at this klass level)
    const autoFeatRecords = allAutoGrantedFeatRecords[i] ?? [];
    for (const rec of autoFeatRecords) {
      const featMods = modifiersBySourceId.get(rec.featsInRule.id) ?? [];
      for (const mod of featMods) {
        const featMatch = featPoolRegex.exec(mod.target);
        if (featMatch) {
          const aptId = aptitudeSlugToId.get(featMatch[1]);
          if (aptId && perLevelFeatSlots[aptId]) {
            featDeltas[aptId] = (featDeltas[aptId] ?? 0) + Number(mod.value);
          }
          continue;
        }
        const spellMatch = spellPoolRegex.exec(mod.target);
        if (spellMatch) {
          const aptId = aptitudeSlugToId.get(spellMatch[1]);
          if (aptId && perLevelPowerSlots[aptId]) {
            if (!powerDeltas[aptId]) powerDeltas[aptId] = {};
            const spellLevel = spellMatch[2];
            if (mod.operator === "set" && Number(mod.value) === -1) {
              powerDeltas[aptId][spellLevel] = 999;
            } else {
              powerDeltas[aptId][spellLevel] = (powerDeltas[aptId][spellLevel] ?? 0) + Number(mod.value);
            }
          }
        }
      }
    }

    // 3. General feat formula delta
    if (generalAptId && perLevelFeatSlots[generalAptId]) {
      const prevGeneral = generalFormula(charLevel - 1);
      const currGeneral = generalFormula(charLevel);
      const generalDelta = currGeneral - prevGeneral;
      if (generalDelta > 0) {
        featDeltas[generalAptId] = (featDeltas[generalAptId] ?? 0) + generalDelta;
      }
    }

    // Push deltas to slot arrays
    for (const aptId of featPoolIds) {
      perLevelFeatSlots[aptId].push(Math.max(0, featDeltas[aptId] ?? 0));
    }
    for (const aptId of powerPoolIds) {
      const slots: Record<string, number> = {};
      if (powerDeltas[aptId]) {
        for (const [sl, delta] of Object.entries(powerDeltas[aptId])) {
          if (delta > 0) slots[sl] = delta;
        }
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
  const levelCount = data.perLevelSkillPoints.length;
  const result: DistributedLevel[] = Array.from({ length: levelCount }, () => ({
    skills: {},
    feats: {},
    powers: {},
  }));

  // ── Distribute skills ──
  const remainingPointsPerLevel = [...data.perLevelSkillPoints];

  for (const [skillId, totalPoints] of Object.entries(skills)) {
    if (totalPoints <= 0) continue;

    const { perLevel } = distributeSkillPoints(
      skillId, totalPoints, data.perLevelClassSkillIds, remainingPointsPerLevel,
    );

    // Enforce intermediate max ranks: walk levels and push overflow forward
    const ctx = data.skillContexts.get(skillId);
    if (ctx) {
      let isClassSoFar = ctx.isClassSkill;
      let cumulativeRank = ctx.currentRank;
      let overflow = 0;

      for (let i = 0; i < levelCount; i++) {
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

    for (let i = 0; i < levelCount; i++) {
      if (perLevel[i] > 0) {
        result[i].skills[skillId] = (result[i].skills[skillId] ?? 0) + perLevel[i];
        remainingPointsPerLevel[i] -= perLevel[i];
      }
    }
  }

  // ── Distribute feats ──
  // First pass: aptitudes with known per-level slots
  const deferredFeatEntries: [string, string[]][] = [];
  const assignedFeatLevels = new Map<string, number>();

  for (const [aptitudeId, featIds] of Object.entries(feats)) {
    const slotsPerLevel = data.perLevelFeatSlots[aptitudeId] ?? [];
    if (!slotsPerLevel.some((s) => s > 0)) {
      deferredFeatEntries.push([aptitudeId, featIds]);
      continue;
    }

    let pickIndex = 0;
    for (let i = 0; i < levelCount && pickIndex < featIds.length; i++) {
      const slots = slotsPerLevel[i] ?? 0;
      if (slots > 0) {
        if (!result[i].feats[aptitudeId]) result[i].feats[aptitudeId] = [];
        for (let s = 0; s < slots && pickIndex < featIds.length; s++) {
          result[i].feats[aptitudeId].push(featIds[pickIndex]);
          assignedFeatLevels.set(featIds[pickIndex], i);
          pickIndex++;
        }
      }
    }
  }

  // Second pass: modifier-created aptitudes — place on the same level as the source feat
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

  // ── Distribute powers ──
  for (const [aptitudeId, powerIds] of Object.entries(powers)) {
    const slotsPerLevel = data.perLevelPowerSlots[aptitudeId] ?? [];

    // Group powers by powerLevel for leveled aptitudes
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
      // Non-leveled aptitude — simple sequential assignment
      let pickIndex = 0;
      for (let i = 0; i < levelCount && pickIndex < powerIds.length; i++) {
        const levelSlots = slotsPerLevel[i] ?? {};
        const totalSlots = Object.values(levelSlots).reduce((sum, n) => sum + n, 0);
        if (totalSlots > 0) {
          if (!result[i].powers[aptitudeId]) result[i].powers[aptitudeId] = [];
          for (let s = 0; s < totalSlots && pickIndex < powerIds.length; s++) {
            result[i].powers[aptitudeId].push(powerIds[pickIndex]);
            pickIndex++;
          }
        }
      }
    } else {
      // Leveled aptitude — assign by spell level
      for (const [plKey, levelPowerIds] of powersByLevel) {
        let pickIndex = 0;
        for (let i = 0; i < levelCount && pickIndex < levelPowerIds.length; i++) {
          const levelSlots = slotsPerLevel[i] ?? {};
          const slots = levelSlots[plKey] ?? 0;
          if (slots > 0) {
            if (!result[i].powers[aptitudeId]) result[i].powers[aptitudeId] = [];
            for (let s = 0; s < slots && pickIndex < levelPowerIds.length; s++) {
              result[i].powers[aptitudeId].push(levelPowerIds[pickIndex]);
              pickIndex++;
            }
          }
        }
      }
    }
  }

  return result;
}
