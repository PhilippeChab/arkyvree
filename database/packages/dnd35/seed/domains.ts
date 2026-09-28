import { powersAptitudesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/utils.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/content/types.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { powerFinder } from "@/database/packages/dnd35/seed/cow.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { insertAll, insertGatedSpellSlots, modifierRows, spellListSlots, uniqueBy } from "@/database/packages/dnd35/seed/customization.ts";

/**
 * Seeds cleric domains: each a feat taken in Cleric Domain that gives its spell list ("X Domain Spells") a slot at
 * each spell level, once the cleric casts that level (`clericSpellLevels`), plus the domain's own modifiers.
 */
export async function seedDomains(db: Db, ctx: SeedContext, domains: DomainDefinition[], clericSpellLevels: Record<number, number>) {
  if (domains.length === 0) return;

  await seedAptitudes(db, ctx, domains.map((d) => `${d.name} Domain Spells`));
  await seedFeats(db, ctx, domains.map((d) => ({ name: `${d.name} Domain`, description: d.description, aptitudes: ["Cleric Domain"] })));
  await insertGatedSpellSlots(db, domains.flatMap((d) => {
    const featId = ctx.featMap[`${d.name} Domain`];
    return [...spellListSlots(featId, "feats", `${stripSeparators(d.name)}domainspells`), ...modifierRows(featId, "feats", d.modifiers)];
  }), "classes.cleric.level", clericSpellLevels);

  const findPower = powerFinder(db, ctx);
  const links = [];
  for (const d of domains) {
    for (const spell of d.spells) {
      const powerId = await findPower(spell.name);
      if (!powerId) {
        console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${d.name} Domain)`);
        continue;
      }
      links.push({ powerId, aptitudeId: ctx.aptMap[`${d.name} Domain Spells`], level: spell.level });
    }
  }
  await insertAll(db, powersAptitudesInRules, uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`));
}
