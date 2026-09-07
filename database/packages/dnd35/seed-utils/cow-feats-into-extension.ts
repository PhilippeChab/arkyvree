import { and, eq, like } from "drizzle-orm";
import {
  featsAptitudesInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { cowFeatIntoExtension } from "@/database/packages/dnd35/seed-utils/cow-feat.ts";

export type CowFeatEntry = {
  feat: string;
  requirements: { className: string; level: number }[];
  aptitudes: string[];
};

/**
 * COW base SRD feats into an extension, add class-level requirements as OR
 * chain entries, and link aptitudes to the copies. Updates `featMap` in place
 * so that subsequent `seedClass` calls use the COW'd copy IDs.
 */
export async function cowFeatsIntoExtension(
  db: Db,
  extensionId: string,
  entries: CowFeatEntry[],
  featMap: Record<string, string>,
  aptMap: Record<string, string>,
) {
  for (const entry of entries) {
    const baseId = featMap[entry.feat];
    if (!baseId) continue;

    const copyId = await cowFeatIntoExtension(db, baseId, extensionId);
    if (!copyId) continue;

    featMap[entry.feat] = copyId;

    // Add class-level requirements as OR chain entries
    if (entry.requirements.length > 0) {
      await addOrChainRequirements(db, copyId, entry.requirements);
    }

    // Add aptitude links
    for (const aptName of entry.aptitudes) {
      const aptId = aptMap[aptName];
      if (!aptId) continue;
      await db.insert(featsAptitudesInRules).values({ featId: copyId, aptitudeId: aptId });
    }
  }
}

/**
 * Add class-level requirements to a feat's OR chain. If no OR chain exists,
 * converts the standalone requirement into one first.
 */
async function addOrChainRequirements(
  db: Db,
  featId: string,
  additions: { className: string; level: number }[],
) {
  const existing = await db
    .select({
      id: requirementsInCustomization.id,
      level: requirementsInCustomization.level,
      target: requirementsInCustomization.target,
      operator: requirementsInCustomization.operator,
      value: requirementsInCustomization.value,
      valueType: requirementsInCustomization.valueType,
      chainingOperator: requirementsInCustomization.chainingOperator,
    })
    .from(requirementsInCustomization)
    .where(eq(requirementsInCustomization.entityId, featId));

  let chainParent = existing.find((r) =>
    r.level.match(/^\d+$/) && !r.target && r.chainingOperator === "or",
  );

  // Convert standalone requirement to OR chain if needed
  if (!chainParent) {
    const standalone = existing.find((r) =>
      r.level.match(/^\d+$/) && r.target && !r.chainingOperator,
    );
    if (!standalone) return;

    await db
      .update(requirementsInCustomization)
      .set({ target: null, operator: null, value: null, valueType: null, chainingOperator: "or" })
      .where(eq(requirementsInCustomization.id, standalone.id));

    await db.insert(requirementsInCustomization).values({
      entityId: featId,
      entityType: "feats",
      level: `${standalone.level}.1`,
      target: standalone.target,
      operator: standalone.operator,
      value: standalone.value,
      valueType: standalone.valueType,
    });

    chainParent = { ...standalone, chainingOperator: "or", target: null };
  }

  // Count existing children to determine next index
  const children = await db
    .select({ level: requirementsInCustomization.level })
    .from(requirementsInCustomization)
    .where(and(
      eq(requirementsInCustomization.entityId, featId),
      like(requirementsInCustomization.level, `${chainParent.level}.%`),
    ));

  let nextChild = children.length > 0
    ? Math.max(...children.map((r) => Number(r.level.split(".").pop()))) + 1
    : 1;

  for (const addition of additions) {
    await db.insert(requirementsInCustomization).values({
      entityId: featId,
      entityType: "feats",
      level: `${chainParent.level}.${nextChild}`,
      target: `classes.${addition.className}.level`,
      operator: "greater_than_or_equal",
      value: String(addition.level),
      valueType: "number",
    });
    nextChild++;
  }
}
