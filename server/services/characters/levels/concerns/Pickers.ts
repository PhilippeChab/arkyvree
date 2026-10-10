import { type AbilityIncrease, Engine, type PickQuery, type PlannedSoFar } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { Feats, Klasses, Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * A feat or power picker's level, as its list's filters send it, and what the wizard plans before it and after it
 * (`laterClassLevelIds`, the planned levels' class levels).
 */
interface PickLevelWhere extends PlannedWhere {
  abilityIncreases?: AbilityIncrease[];
  aptitudeId: string;
  classId: string;
  editedLevelId?: string;
  laterClassLevelIds?: string[];
  level: number;
  search?: string;
}

/**
 * What the level-up wizard plans before the level a picker is for, not saved yet, as a list's filters send it: its
 * levels (their class levels, and their ability increases by place), and the feats and powers picked and skill points
 * spent so far.
 */
interface PlannedWhere {
  featPicks?: PlannedSoFar["featPicks"];
  plannedAbilityIncreases?: PlannedSoFar["abilityIncreases"];
  plannedClassLevelIds?: PlannedSoFar["klassLevelIds"];
  powerPicks?: PlannedSoFar["powerPicks"];
  skillPoints?: PlannedSoFar["skillPoints"];
}

/** A picker's query as the engine takes it: its level, its pool, and what the wizard plans before it and after it. */
function pickQueryOf({
  abilityIncreases,
  aptitudeId,
  classId,
  editedLevelId,
  laterClassLevelIds,
  level,
  ...planned
}: PickLevelWhere): PickQuery {
  return {
    abilityIncreases,
    aptitudeId,
    editedLevelId,
    klassId: classId,
    laterKlassLevelIds: laterClassLevelIds,
    level,
    planned: plannedOf(planned),
  };
}

/** What the wizard plans so far, as the engine takes it. */
function plannedOf({
  featPicks,
  plannedAbilityIncreases,
  plannedClassLevelIds,
  powerPicks,
  skillPoints,
}: PlannedWhere): PlannedSoFar {
  return {
    abilityIncreases: plannedAbilityIncreases,
    featPicks,
    klassLevelIds: plannedClassLevelIds,
    powerPicks,
    skillPoints,
  };
}

/**
 * The level-up wizard's pickers: what the character can pick next, a page at a time, each option described for the
 * character with what the wizard plans so far (its eligibility, and what its kind adds).
 */
export function Pickers<B extends Constructor>(Base: B) {
  abstract class WithPickers extends Base {
    /** The classes the character can take a level in next: each with that level, and whether it may. */
    async getAvailableClasses(
      session: Session,
      characterId: string,
      where: PlannedWhere & { search?: string },
      pagination: { limit: number; page: number },
    ) {
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const picker = Engine.for(scope).character(character).levelUp().openClassPicker(plannedOf(where));
        const result = await Klasses.findPage(
          db,
          {
            rulesetId: character.record.rulesetId,
            ...scope.rulesetData.cow.listFilters,
            characterId,
            ...picker.filters,
            search: where.search,
          },
          pagination,
        );
        return { items: picker.describe(result.items), page: result.page, nextPage: result.nextPage };
      });
    }

    /** The feats a pool offers at the level, a family's variants grouped in one row. */
    async getAvailableFeatGroups(
      session: Session,
      characterId: string,
      where: PickLevelWhere,
      pagination: { limit: number; page: number },
    ) {
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const picker = Engine.for(scope).character(character).levelUp().openFeatPicker(pickQueryOf(where));
        const result = await Feats.findOptionGroupPage(
          db,
          { ...picker.groupFilters, search: where.search },
          pagination,
        );
        return { items: picker.describeGroups(result.items), page: result.page, nextPage: result.nextPage };
      });
    }

    /** The feats a pool offers at the level: a family's variants, when the filters name one. */
    async getAvailableFeats(
      session: Session,
      characterId: string,
      where: PickLevelWhere & { family?: string },
      pagination: { limit: number; page: number },
    ) {
      const { family, ...pick } = where;
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const picker = Engine.for(scope)
          .character(character)
          .levelUp()
          .openFeatPicker({ ...pickQueryOf(pick), family });
        const result = await Feats.findOptionPage(db, { ...picker.filters, search: where.search }, pagination);
        return { items: picker.describe(result.items), page: result.page, nextPage: result.nextPage };
      });
    }

    /** The powers a pool offers at the level, of a spell level when given, but those picked so far. */
    async getAvailablePowers(
      session: Session,
      characterId: string,
      where: PickLevelWhere & { powerLevel?: number },
      pagination: { limit: number; page: number },
    ) {
      const { powerLevel, ...pick } = where;
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const picker = Engine.for(scope)
          .character(character)
          .levelUp()
          .openPowerPicker({ ...pickQueryOf(pick), powerLevel });
        const result = await Powers.findOptionPage(db, { ...picker.filters, search: where.search }, pagination);
        return { items: picker.describe(result.items), page: result.page, nextPage: result.nextPage };
      });
    }
  }
  return WithPickers;
}
