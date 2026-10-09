import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import LevelUpState from "@/engine/rulesets/dnd3.5/levelUp/LevelUpState.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import CharacterProjection, { type FeatPick } from "@/engine/rulesets/dnd3.5/projection/CharacterProjection.ts";
import type { Klass, KlassLevel, Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

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
export default class ClassPicker extends LevelUpState {
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
    character: DetailedCharacter | undefined,
  ) {
    const withoutRequirements = candidates.filter((k) => !requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const withRequirements = candidates.filter((k) => requirementsByKlassLevel.has(k.nextKlassLevel.id));
    const eligibility = character
      ? this.evaluateClassAvailability(character, withRequirements, requirementsByKlassLevel)
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

  /** Whether the character, with the candidate's next level, meets its requirement groups, by that level's id. */
  private evaluateClassAvailability(
    character: DetailedCharacter,
    candidates: ClassCandidate[],
    requirementsByKlassLevel: Map<string, Requirement[][]>,
  ): Map<string, boolean> {
    return new Map(
      candidates.map(({ klass, nextKlassLevel }) => [
        nextKlassLevel.id,
        character.meetsWithNextLevel(
          stripSeparators(klass.name),
          nextKlassLevel,
          requirementsByKlassLevel.get(nextKlassLevel.id)!,
        ),
      ]),
    );
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
   * feats their class levels grant (a monk's Improved Unarmed Strike), and its feats and skill ranks picked so far, which
   * requirements read: at the first pending level, or at the character's last level when it plans none.
   */
  private projectPendingPicks() {
    const { featPicks = [], levelAbilityIds, levelKlassLevelIds = [], skillAllocations = [] } = this.pending;
    const projection = new CharacterProjection(this.view, this.character);
    const [first] = projection.addLevels(levelKlassLevelIds, levelAbilityIds);
    if (first) projection.grantFeats(first, { klassLevelIds: levelKlassLevelIds });
    const pickedAt = first ?? this.character.rows.levels.toSorted((a, b) => a.position - b.position).at(-1);
    if (pickedAt) {
      projection.pickFeats(pickedAt, featPicks);
      projection.rankSkills(pickedAt, skillAllocations);
    }
    return projection;
  }

  /**
   * A page of classes (`klasses`), each the character can take another level of: with that level, and whether the
   * character meets its requirements, built with the pending picks when one has any.
   */
  describe(klasses: Klass[]) {
    const { maxLevels } = this;
    const candidates: ClassCandidate[] = [];
    for (const klass of this.rulesetData.cow.resolveRows(klasses)) {
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
    const built = requirementsByKlassLevel.size > 0 ? this.projectPendingPicks().build() : undefined;
    return this.buildClassOptions(candidates, requirementsByKlassLevel, built);
  }
}
