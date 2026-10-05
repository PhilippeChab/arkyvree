import type { DomainDefinition } from "@/database/packages/dnd35/content/types.ts";
import { seedAptitudes } from "@/database/packages/dnd35/seed/aptitudes.ts";
import type { SeedContext } from "@/database/packages/dnd35/seed/context.ts";
import { ownPower } from "@/database/packages/dnd35/seed/cow.ts";
import {
  insertAll,
  insertGatedSpellSlots,
  joinsClassList,
  modifierRows,
  spellListSlots,
  uniqueBy,
} from "@/database/packages/dnd35/seed/customization.ts";
import { seedFeats } from "@/database/packages/dnd35/seed/feats.ts";
import { powersAptitudesInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * Seeds cleric domains: each a feat taken in Cleric Domain that gives its spell list ("X Domain Spells") a slot at
 * each spell level, once the cleric casts that level (`clericSpellLevels`), and joins it to the cleric's list, plus the
 * domain's own modifiers.
 */
export async function seedDomains(
  db: Db,
  ctx: SeedContext,
  domains: DomainDefinition[],
  clericSpellLevels: Record<number, number>,
) {
  if (domains.length === 0) return;

  await seedAptitudes(
    db,
    ctx,
    domains.map((d) => `${d.name} Domain Spells`),
  );
  await seedFeats(
    db,
    ctx,
    domains.map((d) => ({ name: `${d.name} Domain`, description: d.description, aptitudes: ["Cleric Domain"] })),
  );
  await insertGatedSpellSlots(
    db,
    domains.flatMap((d) => {
      const featId = ctx.featMap[`${d.name} Domain`];
      const list = `${stripSeparators(d.name)}domainspells`;
      return [
        ...spellListSlots(featId, "feats", list),
        joinsClassList(featId, "feats", list),
        ...modifierRows(featId, "feats", d.modifiers),
      ];
    }),
    "classes.cleric.level",
    clericSpellLevels,
  );

  const links = [];
  for (const d of domains) {
    for (const spell of d.spells) {
      const powerId = await ownPower(db, ctx, spell.name);
      if (!powerId) {
        console.warn(`[domain seed] Domain spell not found in DB: "${spell.name}" (${d.name} Domain)`);
        continue;
      }
      links.push({ powerId, aptitudeId: ctx.aptMap[`${d.name} Domain Spells`], level: spell.level });
    }
  }
  await insertAll(
    db,
    powersAptitudesInRules,
    uniqueBy(links, (l) => `${l.powerId}:${l.aptitudeId}`),
  );
}
