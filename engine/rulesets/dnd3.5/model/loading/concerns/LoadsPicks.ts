import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type {
  LoadedCharacterData,
  Resolve,
} from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CharacterLevels, HeldFeat, HeldPower } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import PowersComponent from "@/engine/rulesets/dnd3.5/model/powers/PowersComponent.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type {
  CharacterLevel,
  FeatWithAptitudes,
  KlassLevelFeat,
  KlassLevelPower,
  PowerWithAptitudes,
  RulesetSave,
} from "@/shared/relations.ts";

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
  return { ...power, saveName: PowersComponent.saveNameOf(power, rulesetData) };
}

/** The character's levels and its picks of skills, feats and powers: picked, and granted by their class levels. */
export function LoadsPicks<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class LoadingPicks extends Base {
    /** The feats: picked and given (deduped), in character-level order; and the given per aptitude. */
    private buildFeats(
      picks: CharacterRows["picks"],
      rulesetData: RulesetData,
      { characterLevels }: CharacterLevels,
      resolve: Resolve,
    ) {
      const pickedFeats = pickedAt(resolve(picks.feats), characterLevels, (link) => {
        const feat = rulesetData.featsById.get(link.featId);
        return feat && { ...toFeatRow(feat), aptitudeId: link.aptitudeId };
      });
      const givenFeats = grantedAt(characterLevels, rulesetData.klassLevelFeatsWithFeatsByKlassLevel, toGrantedFeat);

      const pickedFeatIds = new Set(pickedFeats.filter((f) => !f.stackable).map((f) => f.id));
      const seenGivenFeatIds = new Set<string>();
      const dedupedGivenFeats = givenFeats.filter((feat) => {
        if (!feat.stackable) {
          if (pickedFeatIds.has(feat.id)) return false;
          if (seenGivenFeatIds.has(feat.id)) return false;
          seenGivenFeatIds.add(feat.id);
        }
        return true;
      });

      const klassLevelFeatCountsByAptitudeId = dedupedGivenFeats.reduce(
        (acc, feat) => {
          acc[feat.aptitudeId] = (acc[feat.aptitudeId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const allFeats: HeldFeat[] = [...pickedFeats, ...dedupedGivenFeats];

      // Apply feat modifiers in character-level order so later selections win for `set` targets (e.g.
      // bonded.familiar.race): SQL joins don't preserve pick order, and a level a level-up replaces keeps its place.
      const levelPosition = new Map(characterLevels.map((level) => [level.id, level.position]));
      allFeats.sort(
        (a, b) => (levelPosition.get(a.characterLevelId) ?? 0) - (levelPosition.get(b.characterLevelId) ?? 0),
      );
      return { allFeats, klassLevelFeatCountsByAptitudeId };
    }

    /**
     * The powers: picked, then given; and the given (not free) per aptitude. A pick's or a grant's spell level
     * is its composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
     * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
     */
    private buildPowers(
      picks: CharacterRows["picks"],
      rulesetData: RulesetData,
      { characterLevels }: CharacterLevels,
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

      const klassLevelPowerCountsByAptitudeId = givenPowers.reduce(
        (acc, power) => {
          if (!power.free) acc[power.aptitudeId] = (acc[power.aptitudeId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const allPowers: HeldPower[] = [...pickedPowers, ...givenPowers];
      return { allPowers, klassLevelPowerCountsByAptitudeId };
    }

    /**
     * The character's skills, feats and powers: what its levels pick and their class levels grant, as the view composes
     * them.
     */
    protected buildPicks(
      picks: CharacterRows["picks"],
      rulesetData: RulesetData,
      levels: CharacterLevels,
      resolve: Resolve,
    ) {
      const realSkills = pickedAt(resolve(picks.skills), levels.characterLevels, (link) => {
        const skill = rulesetData.skillsById.get(link.skillId);
        return skill && { ...skill, rank: link.rank };
      });
      return {
        skills: realSkills,
        ...this.buildFeats(picks, rulesetData, levels, resolve),
        ...this.buildPowers(picks, rulesetData, levels, resolve),
      };
    }

    /** The character's levels as the view reads them, in the order it took them, and their class levels. */
    protected resolveLevels(rawCharacterLevels: CharacterLevel[], resolve: Resolve): CharacterLevels {
      const characterLevels = resolve(rawCharacterLevels).toSorted((a, b) => a.position - b.position);
      return { characterLevels, klassLevelIds: characterLevels.map((level) => level.klassLevelId) };
    }
  }

  return LoadingPicks;
}
