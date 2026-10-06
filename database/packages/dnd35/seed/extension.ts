import type { BookContent } from "@/database/packages/dnd35/content/types.ts";
import { coreRulesetId, extensionContext, loadSeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { CORE_SPELL_LEVELS } from "@/database/packages/dnd35/seed/core.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * Seeds an extension of the core rules. Its content names the core's rows as a fork does: it adds only the
 * aptitudes the core lacks, and copies the core feats and spells it changes.
 */
export async function seedExtension(db: Db, ruleset: { name: string; description: string }, book: BookContent) {
  const core = await loadSeedContext(db, await coreRulesetId(db, ruleset.name));
  const seeder = new RulesetSeeder(db, await extensionContext(db, core, ruleset));
  await seeder.seedAptitudes(book.aptitudes.filter((name) => !seeder.ctx.aptMap[name]));
  await seeder.seedFeats(book.standaloneFeats);
  await seeder.seedFeats(book.classFeats);
  await seeder.cowFeatsIntoExtension(book.cowFeats);
  await seeder.seedPowers(book.spells);
  await seeder.cowSpellsIntoExtension(book.cowSpells);
  await seeder.seedDomains(book.domains, CORE_SPELL_LEVELS["Cleric"]);
  for (const klass of book.classes) await seeder.seedClass(klass);
}
