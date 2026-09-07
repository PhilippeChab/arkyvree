import { eq, and } from "drizzle-orm";
import {
  featsInRules,
  klassesInRules,
  powersInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { ClassSeed } from "@/database/packages/dnd35/seed-utils/types.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";

/**
 * Update all text descriptions in a ruleset to paraphrased versions.
 * Used by v18/v10/v9/v7 migrations across base + extensions.
 */
export async function updateDescriptions(
  db: Db,
  rulesetName: string,
  data: {
    classes?: ClassSeed[];
    feats?: { name: string; description: string }[];
    spells?: { name: string; description: string }[];
    domains?: DomainDefinition[];
  },
): Promise<void> {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, rulesetName));

  if (!ruleset) {
    console.warn(`[updateDescriptions] Ruleset "${rulesetName}" not found — skipping`);
    return;
  }

  const rulesetId = ruleset.id;

  if (data.classes) {
    for (const cls of data.classes) {
      await db
        .update(klassesInRules)
        .set({ description: cls.description })
        .where(and(eq(klassesInRules.rulesetId, rulesetId), eq(klassesInRules.name, cls.name)));
    }
    console.log(`  Updated ${data.classes.length} class descriptions`);
  }

  if (data.feats) {
    for (const feat of data.feats) {
      await db
        .update(featsInRules)
        .set({ description: feat.description })
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, feat.name)));
    }
    console.log(`  Updated ${data.feats.length} feat descriptions`);
  }

  if (data.spells) {
    for (const spell of data.spells) {
      await db
        .update(powersInRules)
        .set({ description: spell.description })
        .where(and(eq(powersInRules.rulesetId, rulesetId), eq(powersInRules.name, spell.name)));
    }
    console.log(`  Updated ${data.spells.length} spell descriptions`);
  }

  if (data.domains) {
    for (const domain of data.domains) {
      const domainFeatName = `${domain.name} Domain`;

      await db
        .update(featsInRules)
        .set({ description: domain.description })
        .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, domainFeatName)));
    }
    console.log(`  Updated ${data.domains.length} domain descriptions`);
  }
}
