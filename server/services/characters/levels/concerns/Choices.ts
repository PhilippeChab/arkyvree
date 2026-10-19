import { type CharacterInput, Engine, type LevelUpEngine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { RulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Feats, fetchEveryPage, Klasses, Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { type StepQuery, toLevelQuery } from "@/server/services/characters/levels/stepQueries.ts";
import type { Session } from "@/shared/relations.ts";

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

    /** Each feat pool with room left, with every feat it offers that the character qualifies for. */
    private async readFeatSlots(level: NonNullable<OpenedChoices["level"]>) {
      const slots = [];
      for (const { picker, pool, room } of level.featPools) {
        const rows = await fetchEveryPage(
          (pagination) => Feats.findOptionPage(db, picker.filters, pagination),
          OPTIONS_PAGE_SIZE,
        );
        slots.push({ options: picker.describe(rows).filter((option) => option.eligible), pool, room });
      }
      return slots;
    }

    /** Each power pool with room left, at each spell level it counts, with every power it offers that qualifies. */
    private async readPowerSlots(level: NonNullable<OpenedChoices["level"]>) {
      const slots = [];
      for (const { picker, pool, powerLevel, room } of level.powerPools) {
        const rows = await fetchEveryPage(
          (pagination) => Powers.findOptionPage(db, picker.filters, pagination),
          OPTIONS_PAGE_SIZE,
        );
        slots.push({ options: picker.describe(rows).filter((option) => option.eligible), pool, powerLevel, room });
      }
      return slots;
    }

    /**
     * The character's choices at its next level: the classes it can take, and for a planned level of the class the
     * query names, its steps with the picks made so far, and each pool with room left with the options that qualify.
     * Refused as the wizard refuses to plan the level (`openLevelChoices`).
     */
    async getLevelChoices(session: Session, characterId: string, query: StepQuery) {
      return await withEditableCharacter(db, session, characterId, async (scope, character) => {
        const choices = Engine.for(scope).character(character).levelUp().openLevelChoices(toLevelQuery(query));
        const classes = await this.readClasses(scope, character, choices);
        if (!choices.level) return { classes, level: null };
        const featSlots = await this.readFeatSlots(choices.level);
        const powerSlots = await this.readPowerSlots(choices.level);
        return { classes, level: { ...choices.level.steps, featSlots, powerSlots } };
      });
    }
  }
  return WithChoices;
}
