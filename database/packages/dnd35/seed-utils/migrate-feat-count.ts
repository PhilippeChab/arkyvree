import { and, eq } from "drizzle-orm";
import {
  featsInRules,
  klassesInRules,
  klassLevelsInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

// Entity name → { slug, count } for requirements that should be count-based, not boolean
const FEAT_COUNT_MAP: Record<string, { slug: string; count: number }[]> = {
  "Daredevil Athlete": [{ slug: "sneakattack", count: 2 }],
  "Daring Outlaw": [{ slug: "sneakattack", count: 2 }],
  "Improved Skirmish": [{ slug: "skirmish", count: 2 }],
  "Swift Ambusher": [{ slug: "sneakattack", count: 1 }, { slug: "skirmish", count: 1 }],
  "Swift Hunter": [{ slug: "skirmish", count: 1 }],
  "Concussion Attack": [{ slug: "sneakattack", count: 3 }],
  "Eldritch Erosion": [{ slug: "sneakattack", count: 4 }],
  "Throat Punch": [{ slug: "sneakattack", count: 3 }],
  "Improved Sudden Strike": [{ slug: "suddenstrike", count: 8 }],
  "Epic Improved Skirmish": [{ slug: "skirmish", count: 4 }],
};

const CLASS_COUNT_MAP: Record<string, { slug: string; count: number }[]> = {
  "Arcane Trickster": [{ slug: "sneakattack", count: 2 }],
  "Daggerspell Mage": [{ slug: "sneakattack", count: 1 }],
  "Shadowbane Stalker": [{ slug: "sneakattack", count: 1 }],
  "Black Flame Zealot": [{ slug: "sneakattack", count: 1 }],
  "Psibond Agent": [{ slug: "sneakattack", count: 1 }],
  "Spellwarp Sniper": [{ slug: "sneakattack", count: 1 }, { slug: "suddenstrike", count: 1 }],
};

/**
 * Convert possessed requirements to count for entities that need a specific stack count.
 * Safe to run multiple times (idempotent).
 */
export async function migrateFeatCountRequirements(db: Db) {
  for (const [featName, conversions] of Object.entries(FEAT_COUNT_MAP)) {
    const feats = await db
      .select({ id: featsInRules.id })
      .from(featsInRules)
      .where(eq(featsInRules.name, featName));

    for (const feat of feats) {
      for (const { slug, count } of conversions) {
        await db
          .update(requirementsInCustomization)
          .set({
            target: `feats.${slug}.count`,
            operator: "greater_than_or_equal",
            value: String(count),
            valueType: "number",
          })
          .where(and(
            eq(requirementsInCustomization.entityId, feat.id),
            eq(requirementsInCustomization.entityType, "feats"),
            eq(requirementsInCustomization.target, `feats.${slug}.possessed`),
          ));
      }
    }
  }

  for (const [className, conversions] of Object.entries(CLASS_COUNT_MAP)) {
    const klasses = await db
      .select({ id: klassesInRules.id })
      .from(klassesInRules)
      .where(eq(klassesInRules.name, className));

    for (const klass of klasses) {
      const [kl] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(
          eq(klassLevelsInRules.klassId, klass.id),
          eq(klassLevelsInRules.level, 1),
        ));
      if (!kl) continue;

      for (const { slug, count } of conversions) {
        await db
          .update(requirementsInCustomization)
          .set({
            target: `feats.${slug}.count`,
            operator: "greater_than_or_equal",
            value: String(count),
            valueType: "number",
          })
          .where(and(
            eq(requirementsInCustomization.entityId, kl.id),
            eq(requirementsInCustomization.entityType, "klass_levels"),
            eq(requirementsInCustomization.target, `feats.${slug}.possessed`),
          ));
      }
    }
  }
}
