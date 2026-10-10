import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Constructor } from "@/lib/mixins.ts";

type FeatRecord = { id: string; name: string; stackable: boolean };

/** The level's hit points, ability and selections a check reads, with its class and class level. */
interface LevelChecked {
  abilityId: string | null;
  feats: Record<string, string[]>;
  hp: number;
  klass: { hd: number };
  klassLevel: { id: string };
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords =
  RulesetData["klassLevelFeatsWithFeatsByKlassLevel"] extends Map<string, infer R> ? R : never;

/** A level's selections checked against the ruleset: theirs, linked to their pools, and not taken twice. */
export function ChecksSelections<B extends Constructor<LevelUpState>>(Base: B) {
  abstract class CheckingSelections extends Base {
    /**
     * A level's hit points, ability and selections checked, for both the level save and the level-up's: each selection
     * the ruleset's and linked to its pool, no non-stackable feat picked twice. Answers the feats picked and what the
     * level is granted, which whether a feat is already on the character reads (`checkNotTaken`).
     */
    private checkLevelSelections(level: LevelChecked) {
      const { klass, klassLevel, hp, abilityId, skills, feats, powers } = level;

      if (hp < 1 || hp > klass.hd) throw new RulesError("invalid", `HP must be between 1 and ${klass.hd}`);

      // A cache hit means the entity is in the composed view of the character's ruleset
      // (the cache's arrays are already COW-resolved and sibling-filtered).
      if (abilityId && !this.rulesetData.abilitiesById.has(abilityId))
        throw new RulesError("invalid", "Ability does not belong to the character's ruleset");

      // Submitted ids can repeat, e.g. a non-stackable feat picked under two aptitude pools: caught by checkRepeatedPicks.
      const featIds = Object.values(feats).flat();
      const { fetchedFeats } = this.fetchSelections(skills, feats, powers);
      this.checkRepeatedPicks(featIds, fetchedFeats);
      this.checkLinks(feats, powers);

      // What the class level grants, which a non-stackable pick can't be
      const autoGrantedRecords = this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];

      return { autoGrantedRecords, fetchedFeats };
    }

    /** Throws when a feat or a power isn't linked to the pool it's picked under. */
    private checkLinks(feats: Record<string, string[]>, powers: Record<string, string[]>) {
      for (const [aptitudeId, ids] of Object.entries(feats)) {
        for (const featId of ids) {
          const links = this.rulesetData.featsById.get(featId)?.featsAptitudesInRules ?? [];
          if (!links.some((fa) => fa.aptitudeId === aptitudeId))
            throw new RulesError("invalid", "Feat is not linked to the specified aptitude");
        }
      }

      for (const [aptitudeId, ids] of Object.entries(powers)) {
        for (const powerId of ids) {
          const links = this.rulesetData.powersById.get(powerId)?.powersAptitudesInRules ?? [];
          if (!links.some((pa) => pa.aptitudeId === aptitudeId))
            throw new RulesError("invalid", "Power is not linked to the specified aptitude");
        }
      }
    }

    /**
     * Throws when a non-stackable feat picked (`feats`) is already on the character: picked at its other levels
     * (`pickedFeatIds`, read in the save's scope: the ids the view stands for them), granted by their class levels, or
     * granted at this one (`autoGrantedRecords`).
     */
    private checkNotTaken(
      feats: FeatRecord[],
      pickedFeatIds: string[],
      otherLevels: { klassLevelId: string }[],
      autoGrantedRecords: { featsInRule: { id: string } }[],
    ) {
      const existingFeatIds = new Set(pickedFeatIds);
      // The feats the other levels' class levels and this one grant, as the view composes them
      const grants = otherLevels.flatMap(
        (level) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(level.klassLevelId) ?? [],
      );
      for (const rec of [...grants, ...autoGrantedRecords]) existingFeatIds.add(rec.featsInRule.id);

      for (const feat of feats) {
        if (!feat.stackable && existingFeatIds.has(feat.id))
          throw new RulesError("invalid", `Non-stackable feat "${feat.name}" is already on this character`);
      }
    }

    /** Throws when a non-stackable feat is picked more than once in the level (under two pools). */
    private checkRepeatedPicks(featIds: string[], fetchedFeats: FeatRecord[]) {
      const submittedFeatCounts = new Map<string, number>();
      for (const id of featIds) submittedFeatCounts.set(id, (submittedFeatCounts.get(id) ?? 0) + 1);
      for (const feat of fetchedFeats) {
        if (!feat.stackable && (submittedFeatCounts.get(feat.id) ?? 0) > 1)
          throw new RulesError("invalid", `Non-stackable feat "${feat.name}" cannot be picked more than once`);
      }
    }

    /** The rows of these ids, deduplicated, from the character's ruleset; throws when one isn't in it. */
    private fetchAll<T>(ids: string[], byId: Map<string, T>, what: string): T[] {
      const uniqueIds = [...new Set(ids)];
      const fetched = uniqueIds.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
      if (fetched.length !== uniqueIds.length) throw new RulesError("invalid", `One or more ${what} not found`);
      return fetched;
    }

    /** The submitted skills, feats and powers, from the character's ruleset; throws when one, or a pool, isn't in it. */
    private fetchSelections(
      skills: Record<string, number>,
      feats: Record<string, string[]>,
      powers: Record<string, string[]>,
    ) {
      const { aptitudesById, featsById, powersById, skillsById } = this.rulesetData;
      const skillIds = Object.keys(skills).filter((id) => skills[id] > 0);
      const fetchedSkills = this.fetchAll(skillIds, skillsById, "skills");
      const fetchedFeats = this.fetchAll(Object.values(feats).flat(), featsById, "feats");
      const fetchedPowers = this.fetchAll(Object.values(powers).flat(), powersById, "powers");
      this.fetchAll([...Object.keys(feats), ...Object.keys(powers)], aptitudesById, "aptitudes");
      return { fetchedSkills, fetchedFeats, fetchedPowers };
    }

    /**
     * Throws when the level after `totalLevel` levels takes an ability increase it doesn't have, or skips the one it has.
     * `label` names the level in the message ("Level 2: ").
     */
    protected checkAbilityIncrease(totalLevel: number, abilityId: string | null, label = "") {
      const isAbilityIncreaseLevel = LevelRules.isAbilityIncreaseLevel(totalLevel);
      if (abilityId && !isAbilityIncreaseLevel)
        throw new RulesError("invalid", `${label}Ability increase is not available at this level`);

      if (!abilityId && isAbilityIncreaseLevel)
        throw new RulesError("invalid", `${label}Ability increase is required at this level`);
    }

    /**
     * A level's selections checked (`checkLevelSelections`), then its non-stackable feats against those the character
     * already has: picked at its other levels (`pickedFeatIds`) or granted by their class levels (`otherLevels`).
     */
    protected checkLevel(level: LevelChecked, otherLevels: { klassLevelId: string }[], pickedFeatIds: string[]) {
      const { autoGrantedRecords, fetchedFeats } = this.checkLevelSelections(level);
      if (fetchedFeats.some((feat) => !feat.stackable))
        this.checkNotTaken(fetchedFeats, pickedFeatIds, otherLevels, autoGrantedRecords);
    }

    /** Throws when a submitted selection isn't the character's ruleset's, or isn't linked to the pool it's picked under. */
    protected checkSelections(
      skills: Record<string, number>,
      feats: Record<string, string[]>,
      powers: Record<string, string[]>,
    ) {
      this.fetchSelections(skills, feats, powers);
      this.checkLinks(feats, powers);
    }
  }
  return CheckingSelections;
}
