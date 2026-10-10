import { bonus, setFlag, setNum } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import { ContentSeeder } from "@/database/seeders/core/ContentSeeder.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { stripSeparators } from "@/shared/text.ts";

import { getClassSpellLevels, type SpellcastingClass } from "./spellTable.ts";

type Ids = Record<string, string>;

type ModifierRow = typeof modifiersInCustomization.$inferInsert;

/**
 * The ruleset a seed writes to, and the ids of the rows its content names. Seeding aptitudes, feats or
 * powers adds them, so the steps after can name them.
 */
export type SeedContext = {
  abilityMap: Ids;
  /** Its aptitudes and its base ruleset's. */
  aptMap: Ids;
  /** Its feats and its base ruleset's, its own under a name they share. */
  featMap: Ids;
  /** Its base ruleset's powers, which it copies before adding them to a spell list (`cowPower`). */
  inheritedPowerMap: Ids;
  /** Its own powers. */
  powerMap: Ids;
  rulesetId: string;
  saveMap: Ids;
  skillMap: Ids;
};

/**
 * The 3.5 seeder's core, which its steps (`concerns/`) build on: a content seeder (`ContentSeeder`: the rows and their
 * inserts) with the 3.5 context it names rows by, and what its spell lists write with.
 */
export class BaseSeeder extends ContentSeeder<SeedContext> {
  /** A spell list's spells joining the list of the class whose level gave the source: a cleric's domain, the cleric's. */
  protected joinsClassList(sourceId: string, sourceType: string, list: string): ModifierRow {
    return { sourceId, sourceType, ...setFlag(`aptitudes.${list}.joinsclasslist`) };
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
   * Inserts modifiers and gates the ones that give spell slots by the level of `klass` that opens their spell level (a
   * cleric's for a domain's slots, a wizard's for a school's). The first class level needs no gate.
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
