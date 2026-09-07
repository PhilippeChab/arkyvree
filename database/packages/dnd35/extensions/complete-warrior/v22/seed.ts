import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  featsInRules,
  modifiersInCustomization,
  propertiesInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";

const FE_FAMILY_VALUE = "Favored Enemy";

const LORE_FEATS: { name: string; variantSlug: string }[] = [
  { name: "Ancient Foe (Darkwood Stalker)", variantSlug: "favoredenemyhumanoidorc" },
  { name: "Favored Enemy (Giant) (Gnome Giant-slayer)", variantSlug: "favoredenemygiant" },
];

export async function attachLockedFavoredEnemyScaffolding(db: Db) {
  const [extension] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_COMPLETE_WARRIOR_NAME));
  if (!extension) return;

  const featRows = await db
    .select({ id: featsInRules.id, name: featsInRules.name, deletedAt: featsInRules.deletedAt })
    .from(featsInRules)
    .where(and(
      eq(featsInRules.rulesetId, extension.id),
      inArray(featsInRules.name, LORE_FEATS.map((f) => f.name)),
    ));
  const idByName = new Map(featRows.map((f) => [f.name, f.id]));
  const featIds = featRows.map((f) => f.id);
  if (featIds.length === 0) return;

  // Revive any rows soft-deleted by an earlier (unshipped) version of this
  // migration that rerouted klass_level_feats to the base variant and tombstoned
  // the lore feat. Without this, a dev DB that ran that intermediate version
  // before pulling the rewritten v22 would skip the scaffolding attach below.
  const tombstoned = featRows.filter((f) => f.deletedAt !== null).map((f) => f.id);
  if (tombstoned.length > 0) {
    await db
      .update(featsInRules)
      .set({ deletedAt: null })
      .where(and(
        inArray(featsInRules.id, tombstoned),
        isNotNull(featsInRules.deletedAt),
      ));
  }

  const existingProps = await db
    .select({ entityId: propertiesInCustomization.entityId })
    .from(propertiesInCustomization)
    .where(and(
      eq(propertiesInCustomization.entityType, "feats"),
      eq(propertiesInCustomization.type, "FEAT_FAMILY"),
      eq(propertiesInCustomization.value, FE_FAMILY_VALUE),
      inArray(propertiesInCustomization.entityId, featIds),
    ));
  const propsAttached = new Set(existingProps.map((p) => p.entityId));

  const existingMods = await db
    .select({ sourceId: modifiersInCustomization.sourceId, target: modifiersInCustomization.target })
    .from(modifiersInCustomization)
    .where(and(
      eq(modifiersInCustomization.sourceType, "feats"),
      inArray(modifiersInCustomization.sourceId, featIds),
    ));
  const modsAttached = new Set(existingMods.map((m) => `${m.sourceId}|${m.target}`));

  const newProperties: typeof propertiesInCustomization.$inferInsert[] = [];
  const newModifiers: typeof modifiersInCustomization.$inferInsert[] = [];

  for (const { name, variantSlug } of LORE_FEATS) {
    const id = idByName.get(name);
    if (!id) continue;
    if (!propsAttached.has(id)) {
      newProperties.push({
        entityId: id,
        entityType: "feats",
        type: "FEAT_FAMILY",
        value: FE_FAMILY_VALUE,
      });
    }
    const modTarget = `feats.${variantSlug}.possessed`;
    if (!modsAttached.has(`${id}|${modTarget}`)) {
      newModifiers.push({
        sourceId: id,
        sourceType: "feats",
        target: modTarget,
        operator: "set",
        value: "true",
        valueType: "boolean",
      });
    }
  }

  if (newProperties.length > 0) await db.insert(propertiesInCustomization).values(newProperties);
  if (newModifiers.length > 0) await db.insert(modifiersInCustomization).values(newModifiers);
}
