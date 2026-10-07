import { describeClassSpellLists, describeClassSpells, describeClassSpellsKnown } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { findScopedEntity, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";

/** A class's spells: the lists it casts from, and what a class level casts and knows. */
export function ListsSpells<B extends Constructor>(Base: B) {
  abstract class ListingSpells extends Base {
    async getClassLevelSpells(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { sourceChain } = scope.rulesetData.cow;
        const klass = findScopedEntity(scope.rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        return describeClassSpells(scope, klass.id);
      });
    }

    async getClassLevelSpellsKnown(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { sourceChain } = scope.rulesetData.cow;
        const klass = findScopedEntity(scope.rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        return describeClassSpellsKnown(scope, klass.id);
      });
    }

    /** The spell lists a class's levels give slots in, its own first: what its spell list page offers. */
    async getClassSpellLists(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async (scope) => {
        const { sourceChain } = scope.rulesetData.cow;
        const klass = findScopedEntity(scope.rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        return describeClassSpellLists(scope, klass.id);
      });
    }
  }
  return ListingSpells;
}
