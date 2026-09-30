import type { Db } from "@/server/database/index.ts";
import type { BookContent } from "@/database/packages/dnd35/content/types.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import { seedClass } from "@/database/packages/dnd35/seed/classes.ts";
import { coreRulesetId, extensionContext, loadSeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { CORE_SPELL_LEVELS } from "@/database/packages/dnd35/seed/core.ts";
import { cowFeatsIntoExtension, cowSpellsIntoExtension } from "@/database/packages/dnd35/seed/cow.ts";
import { seedDomains } from "@/database/packages/dnd35/seed/domains.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { seedPowers } from "@/database/packages/dnd35/seed/powers.ts";

/**
 * Seeds an extension of the core rules. Its content names the core's rows as a fork does: it adds only the
 * aptitudes the core lacks, and copies the core feats and spells it changes.
 */
export async function seedExtension(db: Db, ruleset: { name: string; description: string }, book: BookContent) {
  const ctx = await extensionContext(db, await loadSeedContext(db, await coreRulesetId(db, ruleset.name)), ruleset);

  await seedAptitudes(db, ctx, book.aptitudes.filter((name) => !ctx.aptMap[name]));
  await seedFeats(db, ctx, book.standaloneFeats);
  await seedFeats(db, ctx, book.classFeats);
  await cowFeatsIntoExtension(db, ctx, book.cowFeats);
  await seedPowers(db, ctx, book.spells);
  await cowSpellsIntoExtension(db, ctx, book.cowSpells);
  await seedDomains(db, ctx, book.domains, CORE_SPELL_LEVELS["Cleric"]);
  for (const klass of book.classes) await seedClass(db, ctx, klass);
}
