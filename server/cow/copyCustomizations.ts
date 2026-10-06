import type { Db } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { isCustomizableEntityType } from "@/shared/customization/entities.ts";

import type { EntityCustomizations } from "./hashing.ts";

/**
 * Inserts one copy of each row per target in a single batch, target-major, with
 * `owner` repointing each copy. Copies pair with their sources by position, and
 * the first target's copies are recorded in `customizationIds`: equal values do
 * not imply the same row (a modifier's requirements may differ).
 */
async function copyRows<R extends { id: string }>(
  tx: Db,
  repo: { createMany(db: Db, values: (Omit<R, "id"> & { id: undefined })[]): Promise<{ id: string }[]> },
  rows: R[],
  targetEntityIds: string[],
  owner: (row: R, targetId: string, targetIndex: number) => Partial<R>,
  customizationIds?: Map<string, string>,
): Promise<{ id: string }[]> {
  if (rows.length === 0) return [];
  const copies = await repo.createMany(
    tx,
    targetEntityIds.flatMap((targetId, targetIndex) =>
      rows.map((row) => ({ ...row, ...owner(row, targetId, targetIndex), id: undefined })),
    ),
  );
  for (let i = 0; i < rows.length; i++) {
    customizationIds?.set(rows[i].id, copies[i].id);
  }
  return copies;
}

export async function copyEntityCustomizationsToMany(
  tx: Db,
  targetEntityIds: string[],
  entityType: string,
  sourceCust: EntityCustomizations,
  customizationIds?: Map<string, string>,
): Promise<void> {
  if (targetEntityIds.length === 0) return;
  // Copies are paired with their sources by position, so reject inputs that
  // position cannot represent instead of writing rows to the wrong owner.
  if (customizationIds && targetEntityIds.length > 1) {
    throw new Error("customizationIds maps each source row to one copy; copy to a single target");
  }
  if (!isCustomizableEntityType(entityType) && sourceCust.modifiers.length > 0) {
    throw new Error(`Cannot copy modifiers onto ${entityType}`);
  }
  const sourceModifierIds = new Set(sourceCust.modifiers.map((m) => m.id));
  const orphan = sourceCust.modifierRequirements.find((r) => !sourceModifierIds.has(r.entityId));
  if (orphan) {
    throw new Error(`Modifier requirement ${orphan.id} belongs to a modifier outside the copied set`);
  }

  const { modifiers, properties, requirements, modifierRequirements } = sourceCust;
  const newModifiers = await copyRows(
    tx,
    Modifiers,
    modifiers,
    targetEntityIds,
    (_, targetId) => ({ sourceId: targetId }),
    customizationIds,
  );
  await copyRows(
    tx,
    Properties,
    properties,
    targetEntityIds,
    (_, targetId) => ({ entityId: targetId }),
    customizationIds,
  );
  await copyRows(
    tx,
    Requirements,
    requirements,
    targetEntityIds,
    (_, targetId) => ({ entityId: targetId }),
    customizationIds,
  );
  // A modifier requirement belongs to the copy of its modifier made for the same target.
  const modifierIndex = new Map(modifiers.map((m, i) => [m.id, i]));
  await copyRows(
    tx,
    Requirements,
    modifierRequirements,
    targetEntityIds,
    (r, _, targetIndex) => ({
      entityId: newModifiers[targetIndex * modifiers.length + modifierIndex.get(r.entityId)!].id,
    }),
    customizationIds,
  );
}

/** Copy customizations onto the target entity */
export async function copyEntityCustomizations(
  tx: Db,
  targetEntityId: string,
  entityType: string,
  sourceCust: EntityCustomizations,
  customizationIds?: Map<string, string>,
): Promise<void> {
  await copyEntityCustomizationsToMany(tx, [targetEntityId], entityType, sourceCust, customizationIds);
}
