import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { findScopedEntity } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { Modifier } from "@/shared/relations.ts";

/** A class's spells: the lists it casts from, and what a class level casts and knows. */
export function ListsSpells<B extends Constructor>(Base: B) {
  abstract class ListingSpells extends Base {
    async getClassLevelSpells(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
        const modifiers: Modifier[] = [];
        for (const level of levels) {
          const ms = rulesetData.modifiersBySource.get(level.id);
          if (ms) modifiers.push(...ms);
        }

        return hooks.classLevels.enrichWithSpellsPerDay(levels, modifiers);
      });
    }

    async getClassLevelSpellsKnown(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
        const modifiers: Modifier[] = [];
        for (const level of levels) {
          const ms = rulesetData.modifiersBySource.get(level.id);
          if (ms) modifiers.push(...ms);
        }

        return hooks.classLevels.enrichWithSpellsKnown(levels, modifiers);
      });
    }

    /** The spell lists a class's levels give slots in, its own first: what its spell list page offers. */
    async getClassSpellLists(rulesetId: string, classId: string) {
      return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");
        const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
        return hooks.classLevels.getSpellListIds(rulesetData, klass.id).flatMap((listId) => {
          const list = rulesetData.aptitudesById.get(listId);
          return list ? [{ id: list.id, name: list.name }] : [];
        });
      });
    }
}
  return ListingSpells;
}
