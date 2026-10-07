/** The character's levels and its picks of skills, feats and powers: saved, granted and projected. */

import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Feats, Powers, Skills } from "@/server/repositories/index.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import type { CharacterLevel } from "@/shared/relations.ts";

import type { Resolve } from "./DetailedCharacterDataLoader.ts";
import { refreshEntityData } from "./refreshEntityData.ts";

/** The feats: picked and given (deduped), then projected, in character-level order; and the given per aptitude. */
export function buildFeats(
  picks: Awaited<ReturnType<typeof fetchPicks>>,
  rulesetFeats: RulesetData["feats"],
  projectedData: Dnd35ProjectedCharacterData | undefined,
  allCharacterLevels: CharacterLevel[],
  resolve: Resolve,
) {
  const pickedFeats = refreshEntityData(resolve(picks.pickedFeats), rulesetFeats, [
    "name",
    "description",
    "stackable",
    "selectable",
  ]);
  const givenFeats = refreshEntityData(resolve(picks.givenFeats), rulesetFeats, [
    "name",
    "description",
    "stackable",
    "selectable",
  ]);
  const allGivenFeats = projectedData?.givenFeats ? [...givenFeats, ...projectedData.givenFeats] : givenFeats;

  const pickedFeatIds = new Set(pickedFeats.filter((f) => !f.stackable).map((f) => f.id));
  const seenGivenFeatIds = new Set<string>();
  const dedupedGivenFeats = allGivenFeats.filter((feat) => {
    if (!feat.stackable) {
      if (pickedFeatIds.has(feat.id)) return false;
      if (seenGivenFeatIds.has(feat.id)) return false;
      seenGivenFeatIds.add(feat.id);
    }
    return true;
  });

  const characterLevelIdSet = new Set(allCharacterLevels.map((l) => l.id));
  const klassLevelFeatCountsByAptitudeId = dedupedGivenFeats.reduce(
    (acc, feat) => {
      if (characterLevelIdSet.has(feat.characterLevelId)) acc[feat.aptitudeId] = (acc[feat.aptitudeId] || 0) + 1;

      return acc;
    },
    {} as Record<string, number>,
  );

  const realFeats = [...pickedFeats, ...dedupedGivenFeats];
  const allFeats = projectedData?.feats ? [...realFeats, ...projectedData.feats] : realFeats;

  // Apply feat modifiers in character-level order so later selections win
  // for `set` targets (e.g. bonded.familiar.race). SQL joins don't preserve
  // pick order, and an edited earlier level is appended in projectedData.
  const levelPosition = new Map(allCharacterLevels.map((level) => [level.id, level.position]));
  allFeats.sort((a, b) => (levelPosition.get(a.characterLevelId) ?? 0) - (levelPosition.get(b.characterLevelId) ?? 0));
  return { allFeats, klassLevelFeatCountsByAptitudeId };
}

/** The character's skills, feats and powers: saved picks and grants, COW-resolved, then the projected ones. */
export function buildPicks(
  picks: Awaited<ReturnType<typeof fetchPicks>>,
  rulesetData: RulesetData,
  projectedData: Dnd35ProjectedCharacterData | undefined,
  allCharacterLevels: CharacterLevel[],
  resolve: Resolve,
) {
  const realSkills = resolve(picks.skills);
  return {
    skills: projectedData?.skills ? [...realSkills, ...projectedData.skills] : realSkills,
    ...buildFeats(picks, rulesetData.feats, projectedData, allCharacterLevels, resolve),
    ...buildPowers(picks, rulesetData, projectedData, allCharacterLevels, resolve),
  };
}

/**
 * The powers: picked, given, then projected; and the given (not free) per aptitude. A pick's or a grant's spell level
 * is its composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
 * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
 */
export function buildPowers(
  picks: Awaited<ReturnType<typeof fetchPicks>>,
  rulesetData: RulesetData,
  projectedData: Dnd35ProjectedCharacterData | undefined,
  allCharacterLevels: CharacterLevel[],
  resolve: Resolve,
) {
  const withLevel = <T extends { aptitudeId: string; id: string }>(power: T) => ({
    ...power,
    powerLevel:
      rulesetData.powersById.get(power.id)?.powersAptitudesInRules.find((link) => link.aptitudeId === power.aptitudeId)
        ?.level ?? null,
  });
  const pickedPowers = refreshEntityData(resolve(picks.pickedPowers), rulesetData.powers, ["name", "description"]).map(
    withLevel,
  );
  const givenPowers = refreshEntityData(resolve(picks.givenPowers), rulesetData.powers, ["name", "description"]).map(
    withLevel,
  );

  const characterLevelIdSet = new Set(allCharacterLevels.map((l) => l.id));
  const klassLevelPowerCountsByAptitudeId = givenPowers.reduce(
    (acc, power) => {
      if (!power.free && characterLevelIdSet.has(power.characterLevelId))
        acc[power.aptitudeId] = (acc[power.aptitudeId] || 0) + 1;

      return acc;
    },
    {} as Record<string, number>,
  );

  const allPowers = projectedData?.powers
    ? [...pickedPowers, ...givenPowers, ...projectedData.powers]
    : [...pickedPowers, ...givenPowers];
  return { allPowers, klassLevelPowerCountsByAptitudeId };
}

/** The character's levels: the saved ones (but those a projection leaves out), then the projected ones. */
export function resolveLevels(
  rawCharacterLevels: CharacterLevel[],
  projectedData: Dnd35ProjectedCharacterData | undefined,
  resolve: Resolve,
) {
  const resolvedCharacterLevels = resolve(rawCharacterLevels).toSorted((a, b) => a.position - b.position);
  const excludeIds = projectedData?.excludeCharacterLevelIds ? new Set(projectedData.excludeCharacterLevelIds) : null;
  const characterLevels = excludeIds
    ? resolvedCharacterLevels.filter((l) => !excludeIds.has(l.id))
    : resolvedCharacterLevels;
  // A new projected level goes after every saved one, an edited level's stand-in where the edited level was
  let nextPosition = (resolvedCharacterLevels.at(-1)?.position ?? 0) + 1;
  const projectedLevels: CharacterLevel[] = (projectedData?.characterLevels ?? []).map((level) => ({
    ...level,
    position: level.position ?? nextPosition++,
  }));
  const allCharacterLevels =
    projectedLevels.length > 0
      ? [...characterLevels, ...projectedLevels].toSorted((a, b) => a.position - b.position)
      : characterLevels;
  return {
    characterLevels,
    allCharacterLevels,
    realCharacterLevelIds: characterLevels.map((level) => level.id),
    klassLevelIds: allCharacterLevels.map((level) => level.klassLevelId),
  };
}

/** Round 4: character-scoped queries (5); ruleset-scoped lookups resolve from cache. */
export async function fetchPicks(database: Db, realCharacterLevelIds: string[], characterLevels: CharacterLevel[]) {
  const skills = await Skills.findPicks(database, {
    characterLevelIds: realCharacterLevelIds,
  });
  const pickedFeats = await Feats.findPicks(database, {
    characterLevelIds: realCharacterLevelIds,
  });
  // A saved level's class level, copied (copy-on-write) or not; a projected level's grants come with it
  const givenFeats = await Feats.findGrants(database, { levels: characterLevels });
  const pickedPowers = await Powers.findPicks(database, {
    characterLevelIds: realCharacterLevelIds,
  });
  const givenPowers = await Powers.findGrants(database, { levels: characterLevels });
  return { skills, pickedFeats, givenFeats, pickedPowers, givenPowers };
}
