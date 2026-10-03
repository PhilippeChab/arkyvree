import { db } from "@/server/database/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { findScopedEntity, withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import { findRulesetPowers } from "@/server/services/rulesets/powers/index.ts";
import type { Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";

/** A class's spells: its spell list, and what a class level casts and knows. */
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

    async getClassSpellList(
      rulesetId: string,
      classId: string,
      where: { level?: number; search?: string },
      pagination: { limit: number; page: number },
    ) {
      return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
        const { sourceChain } = rulesetData.cow;
        const klass = findScopedEntity(rulesetData.klassesById, classId, rulesetId, sourceChain, "Class");

        const levels = rulesetData.klassLevelsByKlassId.get(klass.id) ?? [];
        const modifiers: Modifier[] = [];
        for (const level of levels) {
          const ms = rulesetData.modifiersBySource.get(level.id);
          if (ms) modifiers.push(...ms);
        }

        const spellsRegex = /^aptitudes\.(\w+)\.\d+\.uses$/;
        const slugs = new Set<string>();
        for (const mod of modifiers) {
          const match = spellsRegex.exec(mod.target);
          if (match) slugs.add(match[1]);
        }

        if (slugs.size === 0) {
          return { items: [], page: pagination.page, nextPage: undefined };
        }

        const candidates = rulesetData.aptitudes.filter((a) => slugs.has(stripSeparators(a.name)));
        const aptitude = candidates.find((a) => a.rulesetId === klass.rulesetId) ?? candidates[0];
        if (!aptitude) {
          return { items: [], page: pagination.page, nextPage: undefined };
        }

        return await findRulesetPowers(
          db,
          rulesetData,
          rulesetId,
          { aptitudeId: aptitude.id, level: where.level, search: where.search },
          pagination,
        );
      });
    }
  }
  return ListingSpells;
}
