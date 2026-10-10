import { bonus, setFlag, setNum } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import type { BookContent, CoreContent } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { ContentSeeder } from "@/database/seeders/core/ContentSeeder.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { stripSeparators } from "@/shared/text.ts";

import { getClassSpellLevels, type SpellcastingClass } from "./spellTable.ts";

type ModifierRow = typeof modifiersInCustomization.$inferInsert;

/**
 * The 3.5 seeder's core, which its steps (`concerns/`) build on: a content seeder (`ContentSeeder`: its context, the
 * rows and their inserts) of the 3.5 content (the core rules' `CoreContent`, an extension's `BookContent`), and what
 * its spell lists write with.
 */
export abstract class BaseSeeder extends ContentSeeder<CoreContent, BookContent> {
  /** A spell list's spells joining the list of the class whose level gave the source: a cleric's domain, the cleric's. */
  protected joinsClassList(sourceId: string, sourceType: string, list: string): ModifierRow {
    return { sourceId, sourceType, ...setFlag(`aptitudes.${list}.joinsclasslist`) };
  }

  /**
   * A spell list's spells known at each spell level from the first to the ninth (`allowed` set to -1): a cleric's
   * domain's, which fill his domain slot (`DOMAIN_SPELLS`, his feature's) and join his list.
   */
  protected spellListKnown(sourceId: string, sourceType: string, list: string): ModifierRow[] {
    return Array.from({ length: 9 }, (_, i) => ({
      sourceId,
      sourceType,
      ...setNum(`aptitudes.${list}.${i + 1}.allowed`, -1),
    }));
  }

  /**
   * The slots a spell list gives: one more spell a day at each spell level from the first to the ninth, and any
   * spell of the list to prepare there (`allowed` set to -1).
   */
  protected spellListSlots(sourceId: string, sourceType: string, list: string): ModifierRow[] {
    return Array.from({ length: 9 }, (_, i) => [
      { sourceId, sourceType, ...bonus(`aptitudes.${list}.${i + 1}.uses`, 1) },
      { sourceId, sourceType, ...setNum(`aptitudes.${list}.${i + 1}.allowed`, -1) },
    ]).flat();
  }

  /**
   * Inserts modifiers and gates the ones that give a spell level's slots or spells by the level of `klass` that opens
   * it (a cleric's for a domain's spells, a wizard's for a school's slots). The first class level needs no gate.
   */
  protected async insertGatedSpellSlots(rows: ModifierRow[], klass: SpellcastingClass) {
    if (rows.length === 0) return;
    const classTarget = `classes.${stripSeparators(klass.name)}.level`;
    const spellLevels = getClassSpellLevels(klass.spells);
    const inserted = await this.db
      .insert(modifiersInCustomization)
      .values(rows)
      .returning({ id: modifiersInCustomization.id, target: modifiersInCustomization.target });
    await this.insertAll(
      requirementsInCustomization,
      inserted.flatMap(({ id, target }) => {
        const spellLevel = target.match(/^aptitudes\.\w+\.(\d+)\.(uses|allowed)$/)?.[1];
        const classLevel = spellLevel === undefined ? undefined : spellLevels[Number(spellLevel)];
        if (classLevel === undefined || classLevel <= 1) return [];
        return [{ entityId: id, entityType: "modifiers", level: "1", ...gte(classTarget, classLevel) }];
      }),
    );
  }
}
