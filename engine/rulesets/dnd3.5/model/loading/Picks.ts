/** The character's levels and its picks of skills, feats and powers: saved, granted and projected. */

import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import type {
  CharacterLevel,
  FeatWithAptitudes,
  KlassLevelFeat,
  KlassLevelPower,
  PowerWithAptitudes,
  RulesetSave,
} from "@/shared/relations.ts";

import type { Resolve } from "./DetailedCharacterDataLoader.ts";

/** The character's levels: those it keeps of its saved ones, and every one once the projected join them. */
type Levels = ReturnType<typeof Picks.resolveLevels>;

/**
 * What each saved level's class level grants (`grants`, by class level), attached to the level it's granted at. The
 * class level is the one the view stands for the level's stored one, which `resolveLevels` resolved: on a fork that
 * copied the class after the level was saved, the stored id still names the source's class level, and its copy's
 * grants are the ones the view keys. The view's grants leave out an archived feat or power.
 */
function grantedAt<G, R>(levels: CharacterLevel[], grants: Map<string, G[]>, toRow: (grant: G) => R) {
  return levels.flatMap((level) =>
    (grants.get(level.klassLevelId) ?? []).map((grant) => ({ ...toRow(grant), characterLevelId: level.id })),
  );
}

/**
 * Each saved level's picks (`links`, in the order they were read) with the entity each names (`entityOf`), the level
 * it's picked at and that level's class level. The repository maps a link's references to the ids the view stands for
 * them (a fork's copy, the winner of books' copies), and the view holds every picked entity: deleting one, a fork's
 * deleting an inherited one and unsubscribing its book are refused while a character picks it.
 */
function pickedAt<L extends { characterLevelId: string }, R extends object>(
  links: L[],
  levels: CharacterLevel[],
  entityOf: (link: L) => R | undefined,
) {
  const klassLevelIds = new Map(levels.map((level) => [level.id, level.klassLevelId]));
  return links.flatMap((link) => {
    const entity = entityOf(link);
    const klassLevelId = klassLevelIds.get(link.characterLevelId);
    return entity && klassLevelId ? [{ ...entity, klassLevelId, characterLevelId: link.characterLevelId }] : [];
  });
}

/** A feat as a pick or a grant holds it: the view's, without its pools' links. */
function toFeatRow({ featsAptitudesInRules: _links, ...feat }: FeatWithAptitudes) {
  return feat;
}

/** A class level's granted feat as the build reads it: the feat, then the grant's class level, pool and flag. */
function toGrantedFeat({ featsInRule, ...grant }: KlassLevelFeat & { featsInRule: FeatWithAptitudes }) {
  return {
    ...toFeatRow(featsInRule),
    klassLevelId: grant.klassLevelId,
    aptitudeId: grant.aptitudeId,
    free: grant.free,
    klassLevelFeatId: grant.id,
  };
}

/** A class level's granted power as the build reads it: the power, then the grant's class level, pool and flag. */
function toGrantedPower(
  { powersInRule, ...grant }: KlassLevelPower & { powersInRule: PowerWithAptitudes },
  rulesetData: RulesetData,
) {
  return {
    ...toPowerRow(powersInRule, rulesetData),
    klassLevelId: grant.klassLevelId,
    aptitudeId: grant.aptitudeId,
    free: grant.free,
  };
}

/**
 * A power as a pick or a grant holds it: the view's, without its lists' links or the save its row joins
 * (`savesInRule`), whose name it holds instead.
 */
function toPowerRow(
  {
    powersAptitudesInRules: _links,
    savesInRule: _save,
    ...power
  }: PowerWithAptitudes & { savesInRule?: RulesetSave | null },
  rulesetData: RulesetData,
) {
  return { ...power, saveName: power.saveId ? (rulesetData.savesById.get(power.saveId)?.name ?? null) : null };
}

/** A character's picks and grants, from its rows and the view. */
export default class Picks {
  /** The feats: picked and given (deduped), then projected, in character-level order; and the given per aptitude. */
  static buildFeats(
    picks: CharacterRows["picks"],
    rulesetData: RulesetData,
    projectedData: ProjectedCharacterData | undefined,
    { allCharacterLevels, characterLevels }: Levels,
    resolve: Resolve,
  ) {
    const pickedFeats = pickedAt(resolve(picks.feats), characterLevels, (link) => {
      const feat = rulesetData.featsById.get(link.featId);
      return feat && { ...toFeatRow(feat), aptitudeId: link.aptitudeId };
    });
    const givenFeats = grantedAt(characterLevels, rulesetData.klassLevelFeatsWithFeatsByKlassLevel, toGrantedFeat);
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
    allFeats.sort(
      (a, b) => (levelPosition.get(a.characterLevelId) ?? 0) - (levelPosition.get(b.characterLevelId) ?? 0),
    );
    return { allFeats, klassLevelFeatCountsByAptitudeId };
  }

  /**
   * The character's skills, feats and powers: what its saved levels pick and their class levels grant, as the view
   * composes them; then the projected ones.
   */
  static buildPicks(
    picks: CharacterRows["picks"],
    rulesetData: RulesetData,
    projectedData: ProjectedCharacterData | undefined,
    levels: Levels,
    resolve: Resolve,
  ) {
    const realSkills = pickedAt(resolve(picks.skills), levels.characterLevels, (link) => {
      const skill = rulesetData.skillsById.get(link.skillId);
      return skill && { ...skill, rank: link.rank };
    });
    return {
      skills: projectedData?.skills ? [...realSkills, ...projectedData.skills] : realSkills,
      ...Picks.buildFeats(picks, rulesetData, projectedData, levels, resolve),
      ...Picks.buildPowers(picks, rulesetData, projectedData, levels, resolve),
    };
  }

  /**
   * The powers: picked, given, then projected; and the given (not free) per aptitude. A pick's or a grant's spell level
   * is its composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
   * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
   */
  static buildPowers(
    picks: CharacterRows["picks"],
    rulesetData: RulesetData,
    projectedData: ProjectedCharacterData | undefined,
    { allCharacterLevels, characterLevels }: Levels,
    resolve: Resolve,
  ) {
    const withLevel = <T extends { aptitudeId: string; id: string }>(power: T) => ({
      ...power,
      powerLevel:
        rulesetData.powersById
          .get(power.id)
          ?.powersAptitudesInRules.find((link) => link.aptitudeId === power.aptitudeId)?.level ?? null,
    });
    const pickedPowers = pickedAt(resolve(picks.powers), characterLevels, (link) => {
      const power = rulesetData.powersById.get(link.powerId);
      return power && { ...toPowerRow(power, rulesetData), aptitudeId: link.aptitudeId };
    }).map(withLevel);
    const givenPowers = grantedAt(characterLevels, rulesetData.klassLevelPowersWithPowersByKlassLevel, (grant) =>
      toGrantedPower(grant, rulesetData),
    ).map(withLevel);

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
  static resolveLevels(
    rawCharacterLevels: CharacterLevel[],
    projectedData: ProjectedCharacterData | undefined,
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
      klassLevelIds: allCharacterLevels.map((level) => level.klassLevelId),
    };
  }
}
