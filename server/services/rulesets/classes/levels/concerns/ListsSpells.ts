import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";

/** A class's spells: the lists it casts from, and what a class level casts and knows. */
export function ListsSpells<B extends Constructor>(Base: B) {
  abstract class ListingSpells extends Base {
    async getClassLevelSpells(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => Engine.for(scope).class(classId).describeSpells());
    }

    async getClassLevelSpellsKnown(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) =>
        Engine.for(scope).class(classId).describeSpellsKnown(),
      );
    }

    /** The spell lists a class's levels give slots in, its own first: what its spell list page offers. */
    async getClassSpellLists(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) =>
        Engine.for(scope).class(classId).describeSpellLists(),
      );
    }
  }
  return ListingSpells;
}
