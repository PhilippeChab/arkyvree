import { bonus, setFlag, setNum } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

import { CopiesOnWrite } from "./concerns/CopiesOnWrite.ts";
import { SeedsAptitudes } from "./concerns/SeedsAptitudes.ts";
import { SeedsCoreRules } from "./concerns/SeedsCoreRules.ts";
import { SeedsFeats } from "./concerns/SeedsFeats.ts";
import { SeedsRaces } from "./concerns/SeedsRaces.ts";
import { Dnd35ContentSeeder } from "./Dnd35ContentSeeder.ts";
import { getClassSpellLevels, type SpellcastingClass } from "./spellTable.ts";

type ModifierRow = typeof modifiersInCustomization.$inferInsert;

/**
 * The 3.5 seeder's core, which its other steps (`concerns/`) build on: a content seeder of the 3.5 content
 * (`Dnd35ContentSeeder`: its context, the rows and their inserts), the steps that write its aptitudes, abilities, saves
 * and languages, feats, races, and the copies an extension makes of what it changes, and what its spell lists write
 * with.
 */
export abstract class BaseSeeder extends include(
  Dnd35ContentSeeder,
  CopiesOnWrite,
  SeedsAptitudes,
  SeedsCoreRules,
  SeedsFeats,
  SeedsRaces,
) {
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
   * The slots a spell list gives: one more spell a day at each spell level from the 0th to the ninth, and any spell of
   * the list to prepare there (`allowed` set to -1): a specialist wizard's school's, one a spell level, cantrips too.
   */
  protected spellListSlots(sourceId: string, sourceType: string, list: string): ModifierRow[] {
    return Array.from({ length: 10 }, (_, level) => [
      { sourceId, sourceType, ...bonus(`aptitudes.${list}.${level}.uses`, 1) },
      { sourceId, sourceType, ...setNum(`aptitudes.${list}.${level}.allowed`, -1) },
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
