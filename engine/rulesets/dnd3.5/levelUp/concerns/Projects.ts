import type LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import type { FeatCustomizations, FeatPick } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import type { ProjectedCharacterData, ProjectedCharacterLevel } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";

/** A level's selections as a projection reads them: the rows, the pool each is picked in and the feats' customizations. */
export interface ProjectedSelections<S, F, P> {
  featCustomizations: FeatCustomizations;
  featToAptitude: Map<string, string>;
  fetchedFeats: F[];
  fetchedPowers: P[];
  fetchedSkills: S[];
  powerLevelMap: Map<string, number>;
  powerToAptitude: Map<string, string>;
}

/** A level-up's projections: the levels and picks it adds to a character, which builds with them. */
export function Projects<B extends Constructor<LevelUpState>>(Base: B) {
  abstract class Projecting extends Base {
    /** Projected levels from the wizard's pending levels: their class levels, and their ability increases when given. */
    protected buildPendingCharacterLevels(
      characterId: string,
      pendingLevelKlassLevelIds: string[],
      pendingLevelAbilityIds?: (string | undefined)[],
    ) {
      return pendingLevelKlassLevelIds.map((klassLevelId, i) => {
        const abilityId = pendingLevelAbilityIds?.[i] || null;
        return this.buildProjectedCharacterLevel(characterId, klassLevelId, abilityId);
      });
    }

    /**
     * The feats a class level grants, free or not, as a projection gives them (as the saved character's build does),
     * but those the level picks too.
     */
    protected buildProjectedAutoGrantedFeats<T extends { id: string }>(
      autoGrantedRecords: { aptitudeId: string; featsInRule: T; id: string }[],
      klassLevelId: string,
      characterLevelId: string,
      pickedFeatIds: Set<string>,
      featCustomizations: { modifiers: Map<string, Modifier[]> },
    ) {
      return autoGrantedRecords
        .filter((rec) => !pickedFeatIds.has(rec.featsInRule.id))
        .map((rec) => ({
          ...rec.featsInRule,
          klassLevelId,
          klassLevelFeatId: rec.id,
          characterLevelId,
          aptitudeId: rec.aptitudeId,
          modifiers: featCustomizations.modifiers.get(rec.featsInRule.id) ?? [],
          properties: [],
          requirements: [],
        }));
    }

    /** A new level of class level `klassLevelId`, which the loader places after the character's saved levels. */
    protected buildProjectedCharacterLevel(
      characterId: string,
      klassLevelId: string,
      abilityId?: string | null,
    ): ProjectedCharacterLevel {
      return {
        id: crypto.randomUUID(),
        characterId,
        klassLevelId,
        hp: 10,
        abilityId: abilityId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
    }

    /** The feats picked so far (`selectedFeatPicks`, each in its pool), as a projection gives them to the level. */
    protected buildProjectedFeatsFromPicks(
      selectedFeatPicks: FeatPick[],
      klassLevelId: string,
      projectedCharacterLevelId: string,
    ): NonNullable<ProjectedCharacterData["feats"]> {
      if (selectedFeatPicks.length === 0) return [];

      // Dedup by (featId, aptitudeId) — the wizard sometimes sends the same pick
      // under both `selectedFeatPicks` and `pendingLevelFeatPicks` (Add Level batch
      // treats all picks as pending). Without this, projection doubles up and
      // applies modifiers twice. Legitimate multi-pool picks of the same feat
      // (different aptitudeIds) are preserved.
      const uniquePicks = [...new Map(selectedFeatPicks.map((p) => [`${p.featId}:${p.aptitudeId}`, p])).values()];
      const uniqueFeatIds = [...new Set(uniquePicks.map((p) => p.featId))];
      const customizations = this.loadFeatCustomizations(uniqueFeatIds);

      return uniquePicks
        .map((pick) => {
          const feat = this.rulesetData.featsById.get(pick.featId);
          if (!feat) return null;
          return {
            ...feat,
            klassLevelId,
            characterLevelId: projectedCharacterLevelId,
            aptitudeId: pick.aptitudeId,
            modifiers: customizations.modifiers.get(feat.id) ?? [],
            properties: customizations.properties.get(feat.id) ?? [],
            requirements: customizations.requirements.get(feat.id) ?? [],
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);
    }

    /** The feats class levels grant (`autoGrantedRecords`), as a projection gives them to a level. */
    protected buildProjectedGivenFeats<T extends { id: string }>(
      autoGrantedRecords: { aptitudeId: string; featsInRule: T; id: string; klassLevelId: string }[],
      characterLevelId: string,
      customizations: { modifiers: Map<string, Modifier[]> },
    ) {
      return autoGrantedRecords.map((rec) => ({
        ...rec.featsInRule,
        klassLevelId: rec.klassLevelId,
        klassLevelFeatId: rec.id,
        characterLevelId,
        aptitudeId: rec.aptitudeId,
        modifiers: customizations.modifiers.get(rec.featsInRule.id) ?? [],
        properties: [],
        requirements: [],
      }));
    }

    /** A level's checked selections, as a projection gives them to the level: its skill ranks, feats and powers. */
    protected buildProjectedSelections<S extends { id: string }, F extends { id: string }, P extends { id: string }>(
      klassLevelId: string,
      characterLevelId: string,
      skills: Record<string, number>,
      v: ProjectedSelections<S, F, P>,
    ) {
      return {
        skills: v.fetchedSkills.map((skill) => ({
          ...skill,
          klassLevelId,
          characterLevelId,
          rank: skills[skill.id],
        })),
        feats: v.fetchedFeats.map((feat) => ({
          ...feat,
          klassLevelId,
          characterLevelId,
          aptitudeId: v.featToAptitude.get(feat.id)!,
          modifiers: v.featCustomizations.modifiers.get(feat.id) ?? [],
          properties: v.featCustomizations.properties.get(feat.id) ?? [],
          requirements: v.featCustomizations.requirements.get(feat.id) ?? [],
        })),
        powers: v.fetchedPowers.map((power) => ({
          ...power,
          klassLevelId,
          characterLevelId,
          aptitudeId: v.powerToAptitude.get(power.id)!,
          powerLevel: v.powerLevelMap.get(`${power.id}:${v.powerToAptitude.get(power.id)}`) ?? null,
          saveName: null,
        })),
      };
    }

    /** Skill ranks (`allocations`), as a projection gives them to a level: the last rank of a skill given twice wins. */
    protected buildProjectedSkillsFromAllocations(
      allocations: { rank: number; skillId: string }[],
      klassLevelId: string,
      characterLevelId: string,
    ) {
      if (allocations.length === 0) return [];

      // Dedup by skillId — previously `new Map(allocations.map(a => [a.skillId, a.rank]))`
      // collapsed duplicates with last-rank-wins. Preserve that semantics so callers
      // that accidentally pass the same skillId twice don't produce duplicate projected
      // rows (which would skew skill-rank budgeting in the projected character).
      const rankBySkillId = new Map<string, number>();
      for (const a of allocations) rankBySkillId.set(a.skillId, a.rank);

      return [...rankBySkillId.entries()]
        .map(([skillId, rank]) => {
          const skill = this.rulesetData.skillsById.get(skillId);
          if (!skill) return null;
          return { ...skill, klassLevelId, characterLevelId, rank };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);
    }

    /** The ids of a level and of every level after it, in the order the character took them. */
    protected getLevelIdsFromOnward(characterLevels: { id: string; position: number }[], characterLevelId: string) {
      const sorted = characterLevels.toSorted((a, b) => a.position - b.position);
      const index = sorted.findIndex((l) => l.id === characterLevelId);
      if (index === -1) return [];
      return sorted.slice(index).map((l) => l.id);
    }

    /**
     * The projected data of planned levels: a character level each, and the feats their class levels grant. Also returns
     * those grants' records, per level.
     */
    protected projectPlannedLevels(
      characterId: string,
      plannedLevels: { abilityId: string | null; klassLevel: { id: string } }[],
    ) {
      const projectedCharacterLevels = plannedLevels.map(({ klassLevel, abilityId }) =>
        this.buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId),
      );
      const allAutoGrantedFeatRecords = plannedLevels.map(
        ({ klassLevel }) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
      );
      const autoGrantedFeatCustomizations = this.loadFeatCustomizations(
        allAutoGrantedFeatRecords.flat().map((rec) => rec.featsInRule.id),
      );
      const projectedData: ProjectedCharacterData = {
        characterLevels: projectedCharacterLevels,
        givenFeats: allAutoGrantedFeatRecords.flatMap((records, i) =>
          this.buildProjectedGivenFeats(records, projectedCharacterLevels[i].id, autoGrantedFeatCustomizations),
        ),
      };
      return { projectedData, allAutoGrantedFeatRecords };
    }
  }
  return Projecting;
}
