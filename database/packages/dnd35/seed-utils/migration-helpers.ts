import { and, eq, isNull } from "drizzle-orm";
import {
  featsInRules,
  klassesInRules,
  klassLevelsInRules,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import type { RequirementEntry } from "@/database/packages/dnd35/v1/feats/types.ts";
import { buildRequirements } from "@/database/packages/dnd35/seed-utils/helpers.ts";

// ---------------------------------------------------------------------------
// Shared helpers for production migrations that add/append requirements.
// Idempotent: checks by (target, operator, value, chainingOperator) to avoid
// unique constraint violations, and offsets levels to avoid collisions.
// ---------------------------------------------------------------------------

const reqKey = (r: { target?: string | null; operator?: string | null; value?: string | null; chainingOperator?: string | null }) =>
  `${r.target ?? ""}|${r.operator ?? ""}|${r.value ?? ""}|${r.chainingOperator ?? ""}`;

async function getExistingReqs(db: Db, entityId: string, entityType: string) {
  return db
    .select({
      level: requirementsInCustomization.level,
      target: requirementsInCustomization.target,
      operator: requirementsInCustomization.operator,
      value: requirementsInCustomization.value,
      chainingOperator: requirementsInCustomization.chainingOperator,
    })
    .from(requirementsInCustomization)
    .where(and(
      eq(requirementsInCustomization.entityId, entityId),
      eq(requirementsInCustomization.entityType, entityType),
    ));
}

async function insertNewRequirements(
  db: Db,
  entityId: string,
  entityType: string,
  requirements: RequirementEntry[],
) {
  const existing = await getExistingReqs(db, entityId, entityType);
  const existingKeys = new Set(existing.map(reqKey));

  const rows = buildRequirements(entityId, entityType, requirements);
  const newRows = rows.filter(r => !existingKeys.has(reqKey(r)));
  if (newRows.length === 0) return;

  const maxRoot = existing.reduce((max, r) => {
    const root = parseInt(r.level.split(".")[0], 10);
    return isNaN(root) ? max : Math.max(max, root);
  }, 0);

  const shifted = newRows.map(row => {
    const parts = row.level.split(".");
    parts[0] = String(parseInt(parts[0], 10) + maxRoot);
    return { ...row, level: parts.join(".") };
  });

  for (const row of shifted) {
    await db.insert(requirementsInCustomization).values(row);
  }
}

/** Add requirements to a class's level 1 klass_level row. Idempotent. */
export async function addClassRequirement(
  db: Db,
  rulesetId: string,
  className: string,
  requirements: RequirementEntry[],
) {
  const [klass] = await db
    .select({ id: klassesInRules.id })
    .from(klassesInRules)
    .where(and(eq(klassesInRules.rulesetId, rulesetId), eq(klassesInRules.name, className)));
  if (!klass) return;

  const [kl] = await db
    .select({ id: klassLevelsInRules.id })
    .from(klassLevelsInRules)
    .where(and(eq(klassLevelsInRules.klassId, klass.id), eq(klassLevelsInRules.level, 1)));
  if (!kl) return;

  await insertNewRequirements(db, kl.id, "klass_levels", requirements);
}

/** Add requirements to a feat (by name). Idempotent. */
export async function addFeatRequirement(
  db: Db,
  rulesetId: string,
  featName: string,
  requirements: RequirementEntry[],
) {
  const [feat] = await db
    .select({ id: featsInRules.id })
    .from(featsInRules)
    .where(and(
      eq(featsInRules.rulesetId, rulesetId),
      eq(featsInRules.name, featName),
      isNull(featsInRules.deletedAt),
    ));
  if (!feat) return;

  await insertNewRequirements(db, feat.id, "feats", requirements);
}
