import { type CharacterInput, Engine, type LevelUpEngine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { RulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Feats, fetchEveryPage, Klasses, type Paginated, Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { type StepQuery, toLevelQuery } from "@/server/services/characters/levels/stepQueries.ts";
import type { Session } from "@/shared/relations.ts";

/** A pool's picker, as the server reads it: what it reads a page of options with, and a page described. */
interface SlotPicker {
  describe<R extends { id: string }>(rows: R[]): (R & { eligible: boolean })[];
  filters: object;
}

/**
 * A character's next level, as a request for its choices sends it: its class, and the picks made at it so far. The level
 * is the next one, after the character's: none planned before it, none edited.
 */
type LevelChoicesQuery = Pick<StepQuery, "abilityIncreases" | "classId" | "featPicks" | "powerPicks" | "skillPoints">;

/** A character's choices at its next level, as the engine opens them. */
type OpenedChoices = ReturnType<LevelUpEngine["openLevelChoices"]>;

/** How many options a page of a pool's options reads: each pool's are read whole, a page at a time. */
const OPTIONS_PAGE_SIZE = 500;

/**
 * A character's choices at its next level, read whole in one request (the public API's): the classes it can take, and
 * for a planned level, each step with the picks made so far and each pool's options that qualify. The engine opens it
 * all at once (`openLevelChoices`), and the service reads each picker's options, every page of them.
 */
export function Choices<B extends Constructor>(Base: B) {
  abstract class WithChoices extends Base {
    /** Every class the class picker offers, described for the character, in the ruleset its scope reads. */
    private async readClasses(scope: RulesetScope, character: CharacterInput, { classPicker }: OpenedChoices) {
      const where = {
        rulesetId: character.record.rulesetId,
        ...scope.rulesetData.cow.listFilters,
        characterId: character.record.id,
        ...classPicker.filters,
      };
      const rows = await fetchEveryPage((pagination) => Klasses.findPage(db, where, pagination), OPTIONS_PAGE_SIZE);
      return classPicker.describe(rows);
    }

    /**
     * Each pool with room left (`pools`), with every option its picker offers that the character qualifies for, read a
     * page at a time (`findPage`).
     */
    private async readSlots<P extends { picker: SlotPicker }, R extends { id: string }>(
      pools: P[],
      findPage: (filters: P["picker"]["filters"], pagination: { limit: number; page: number }) => Promise<Paginated<R>>,
    ) {
      const slots = [];
      for (const { picker, ...pool } of pools) {
        const rows = await fetchEveryPage((pagination) => findPage(picker.filters, pagination), OPTIONS_PAGE_SIZE);
        slots.push({ ...pool, options: picker.describe(rows).filter((option) => option.eligible) });
      }
      return slots;
    }

    /**
     * The character's choices at its next level: the classes it can take, and for a planned level of the class the
     * query names, its steps with the picks made so far, and each pool with room left with the options that qualify.
     * Refused as the wizard refuses to plan the level (`openLevelChoices`).
     */
    async getLevelChoices(session: Session, characterId: string, query: LevelChoicesQuery) {
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const choices = Engine.for(scope).character(character).levelUp().openLevelChoices(toLevelQuery(query));
        const classes = await this.readClasses(scope, character, choices);
        if (!choices.level) return { classes, level: null };
        const { featPools, powerPools } = choices.level;
        const featSlots = await this.readSlots(featPools, (filters, page) => Feats.findOptionPage(db, filters, page));
        const powerSlots = await this.readSlots(powerPools, (filters, page) =>
          Powers.findOptionPage(db, filters, page),
        );
        return { classes, level: { ...choices.level.steps, featSlots, powerSlots } };
      });
    }
  }
  return WithChoices;
}
