import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import type { Dnd35ProjectedCharacterData, ProjectedCharacterLevel } from "@/engine/rulesets/dnd3.5/types.ts";
import { include } from "@/lib/mixins.ts";
import type { Klass, KlassLevel, Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { Projects } from "./concerns/Projects.ts";
import LevelUpState, { type FeatPick } from "./LevelUpState.ts";

/** A class the character can take another level of, with that level. */
type ClassCandidate = { klass: Klass; nextKlassLevel: KlassLevel };

/** What the level-up wizard picked before the class picker opens: the levels planned and their picks. */
interface PendingPicks {
  featPicks?: FeatPick[];
  levelAbilityIds?: (string | undefined)[];
  levelKlassLevelIds?: string[];
  skillAllocations?: { rank: number; skillId: string }[];
}

/**
 * The class picker for the character, from its rows and the level-up wizard's pending picks: what it offers (`filters`,
 * which the server reads a page of classes with), and each class of a page the character can take another level of,
 * with that level and its eligibility. Only a class with requirements (its class's and its next level's) needs the
 * character built, with the pending picks.
 */
export default class ClassPicker extends include(LevelUpState, Projects) {
  constructor(
    view: RulesetView,
    private readonly character: CharacterInput,
    private readonly pending: PendingPicks,
  ) {
    super(view);
  }

  /** What the picker offers: a player character's classes. */
  readonly filters = { kind: "pc" };

  /**
   * The classes the character can take, each with its eligibility and, when it isn't, the requirements it fails: from
   * the character built with the pending picks, which only a class with requirements needs. Highest next level first,
   * then by name.
   */
  private buildClassOptions(
    candidates: ClassCandidate[],
    requirementsByKlassLevel: Map<string, Requirement[][]>,
    character: Dnd35DetailedCharacter | undefined,
  ) {
    const withoutRequirements = candidates.filter((k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const withRequirements = candidates.filter((k) => requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const eligibility = character
      ? this.evaluateClassAvailability(
          character,
          withRequirements,
          requirementsByKlassLevel,
          this.buildProjectedCharacterLevel(this.character.record.id, ""),
        )
      : new Map<string, boolean>();

    const option = (k: ClassCandidate, eligible: boolean, requirementTree?: string) => ({
      ...k.klass,
      nextLevel: k.nextKlassLevel.level,
      maxLevel: this.rulesetData.klassLevelsByKlassId.get(k.klass.id)?.at(-1)?.level ?? k.nextKlassLevel.level,
      eligible,
      requirementTree,
    });

    return [
      ...withoutRequirements.map((k) => option(k, true)),
      ...withRequirements.map((k) => {
        const eligible = eligibility.get(k.nextKlassLevel.id) ?? false;
        const groups = requirementsByKlassLevel.get(k.nextKlassLevel.id);
        return option(
          k,
          eligible,
          !eligible && groups && character
            ? groups.map((reqs) => character.formatRequirements(reqs)).join("\n")
            : undefined,
        );
      }),
    ].sort((a, b) => b.nextLevel - a.nextLevel || a.name.localeCompare(b.name));
  }

  /** Whether the character, a level higher, meets each candidate's requirement groups, by its next level's id. */
  private evaluateClassAvailability(
    character: Dnd35DetailedCharacter,
    candidates: ClassCandidate[],
    requirementsByKlassLevel: Map<string, Requirement[][]>,
    projectedCharacterLevel: ProjectedCharacterLevel,
  ): Map<string, boolean> {
    const results = new Map<string, boolean>();
    if (candidates.length === 0) return results;

    const identity = character.components.identity.getIdentity();
    identity.meta.level++;

    for (const candidate of candidates) {
      results.set(
        candidate.nextKlassLevel.id,
        character.evaluateWithProjectedLevel(
          stripSeparators(candidate.klass.name),
          candidate.nextKlassLevel,
          projectedCharacterLevel,
          requirementsByKlassLevel.get(candidate.nextKlassLevel.id)!,
        ),
      );
    }

    identity.meta.level--;
    return results;
  }

  /** The character's highest level in each class it has levels of, by the class's id. */
  private get maxLevels(): Map<string, number> {
    const maxLevels = new Map<string, number>();
    for (const level of this.character.rows.levels) {
      const klassLevel = this.rulesetData.klassLevelsById.get(level.klassLevelId);
      if (klassLevel)
        maxLevels.set(klassLevel.klassId, Math.max(maxLevels.get(klassLevel.klassId) ?? 0, klassLevel.level));
    }
    return maxLevels;
  }

  /**
   * What the level-up wizard's pending picks add to the character, for the class picker: its pending levels with the
   * feats their class levels grant, its picked feats and its skill ranks. Undefined when there are none.
   */
  private projectPendingPicks(): Dnd35ProjectedCharacterData | undefined {
    const characterId = this.character.record.id;
    const { featPicks, levelAbilityIds, levelKlassLevelIds, skillAllocations } = this.pending;
    const pendingLevels = levelKlassLevelIds?.length
      ? this.buildPendingCharacterLevels(characterId, levelKlassLevelIds, levelAbilityIds)
      : [];
    const skillAnchorLevel = pendingLevels[0] ?? this.buildProjectedCharacterLevel(this.character.record.id, "");
    const autoGrantedRecords = (levelKlassLevelIds ?? []).flatMap(
      (klid) => this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klid) ?? [],
    );
    const projectedFeats = this.buildProjectedFeatsFromPicks(featPicks ?? [], "", "");
    const projectedSkills = skillAllocations?.length
      ? this.buildProjectedSkillsFromAllocations(skillAllocations, skillAnchorLevel.klassLevelId, skillAnchorLevel.id)
      : [];
    // The feats the pending class levels grant (a monk's Improved Unarmed Strike), which requirements read
    const projectedGivenFeats =
      autoGrantedRecords.length > 0
        ? this.buildProjectedGivenFeats(
            autoGrantedRecords,
            pendingLevels[0].id,
            this.loadFeatCustomizations(autoGrantedRecords.map((rec) => rec.featsInRule.id)),
          )
        : [];

    const hasProjections =
      pendingLevels.length > 0 ||
      projectedFeats.length > 0 ||
      projectedGivenFeats.length > 0 ||
      projectedSkills.length > 0;
    return hasProjections
      ? {
          ...(pendingLevels.length > 0 && { characterLevels: pendingLevels }),
          ...(projectedFeats.length > 0 && { feats: projectedFeats }),
          ...(projectedGivenFeats.length > 0 && { givenFeats: projectedGivenFeats }),
          ...(projectedSkills.length > 0 && { skills: projectedSkills }),
        }
      : undefined;
  }

  /**
   * A page of classes (`klasses`), each the character can take another level of: with that level, and whether the
   * character meets its requirements, built with the pending picks when one has any.
   */
  describe(klasses: Klass[]) {
    const { maxLevels } = this;
    const candidates: ClassCandidate[] = [];
    for (const klass of klasses) {
      const nextKlassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(
        `${klass.id}:${(maxLevels.get(klass.id) || 0) + 1}`,
      );
      if (nextKlassLevel) candidates.push({ klass, nextKlassLevel });
    }
    const requirementsByKlassLevel = new Map<string, Requirement[][]>();
    for (const k of candidates) {
      const groups = [k.klass.id, k.nextKlassLevel.id]
        .map((id) => this.rulesetData.requirementsByEntity.get(id) ?? [])
        .filter((reqs) => reqs.length > 0);
      if (groups.length > 0) requirementsByKlassLevel.set(k.nextKlassLevel.id, groups);
    }
    // Only a class with requirements needs the character, built with the wizard's pending picks
    const built =
      requirementsByKlassLevel.size > 0 ? this.build(this.character, this.projectPendingPicks()) : undefined;
    return this.buildClassOptions(candidates, requirementsByKlassLevel, built);
  }
}
