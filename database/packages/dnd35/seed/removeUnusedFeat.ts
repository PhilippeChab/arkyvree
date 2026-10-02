import { and, eq, isNull } from "drizzle-orm";

import {
  entitySnapshotsInRules,
  featsInRules,
  klassLevelFeatsInRules,
  levelFeatsInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import {
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
} from "@/server/services/rulesets/cow/cascade.ts";

/**
 * Removes a feat the seeds no longer write from the ruleset named `rulesetName`, with its aptitude links and
 * customizations, unless something uses it: a class level that grants it, a character's pick, or a fork's or an
 * extension's copy. A feat in use stays, as every seeded row others rely on does.
 */
export async function removeUnusedFeat(db: Db, rulesetName: string, featName: string) {
  const [feat] = await db
    .select({ id: featsInRules.id })
    .from(featsInRules)
    .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, featsInRules.rulesetId))
    .where(
      and(eq(rulesetsInRules.name, rulesetName), eq(featsInRules.name, featName), isNull(featsInRules.campaignId)),
    );
  if (!feat) return;

  const uses = await Promise.all([
    db.select().from(klassLevelFeatsInRules).where(eq(klassLevelFeatsInRules.featId, feat.id)).limit(1),
    db.select().from(levelFeatsInCharacter).where(eq(levelFeatsInCharacter.featId, feat.id)).limit(1),
    db.select().from(entitySnapshotsInRules).where(eq(entitySnapshotsInRules.sourceEntityId, feat.id)).limit(1),
  ]);
  if (uses.some((rows) => rows.length > 0)) return;

  await deleteModifiersWithCascade(db, { sourceIds: [feat.id], sourceType: "feats" });
  await deletePropertiesWithCascade(db, { entityIds: [feat.id], entityType: "feats" });
  await deleteRequirementsWithCascade(db, { entityIds: [feat.id], entityType: "feats" });
  // Its aptitude links go with it (ON DELETE CASCADE)
  await db.delete(featsInRules).where(eq(featsInRules.id, feat.id));
}
