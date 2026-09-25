import type { Db } from "@/server/database/index.ts";
import {
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevelSaves,
  KlassLevels,
  KlassSkills,
  Modifiers,
  PowersAptitudes,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import type { EntityCustomizations, EntityType } from "@/server/services/rulesets/hashing.ts";
import { ENTITY_TYPE_TO_SOURCE_TYPE } from "./constants.ts";
import { fetchEntityCustomizations } from "./customizations.ts";

// Copy customizations from source entity to target entity
export async function copyEntityCustomizations(
  tx: Db,
  _sourceEntityId: string,
  targetEntityId: string,
  entityType: string,
  sourceCust: EntityCustomizations,
  customizationIds?: Map<string, string>,
): Promise<void> {
  await copyEntityCustomizationsToMany(tx, [targetEntityId], entityType, sourceCust, customizationIds);
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
  if (!ENTITY_TYPE_TO_SOURCE_TYPE[entityType] && sourceCust.modifiers.length > 0) {
    throw new Error(`Cannot copy modifiers onto ${entityType}`);
  }
  const sourceModifierIds = new Set(sourceCust.modifiers.map((m) => m.id));
  const orphan = sourceCust.modifierRequirements.find((r) => !sourceModifierIds.has(r.entityId));
  if (orphan) {
    throw new Error(`Modifier requirement ${orphan.id} belongs to a modifier outside the copied set`);
  }

  const { modifiers, properties, requirements, modifierRequirements } = sourceCust;
  const newModifiers = await copyRows(tx, Modifiers, modifiers, targetEntityIds, (_, targetId) => ({ sourceId: targetId }), customizationIds);
  await copyRows(tx, Properties, properties, targetEntityIds, (_, targetId) => ({ entityId: targetId }), customizationIds);
  await copyRows(tx, Requirements, requirements, targetEntityIds, (_, targetId) => ({ entityId: targetId }), customizationIds);
  // A modifier requirement belongs to the copy of its modifier made for the same target.
  const modifierIndex = new Map(modifiers.map((m, i) => [m.id, i]));
  await copyRows(tx, Requirements, modifierRequirements, targetEntityIds, (r, _, targetIndex) => ({
    entityId: newModifiers[targetIndex * modifiers.length + modifierIndex.get(r.entityId)!].id,
  }), customizationIds);
}

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

// Copy relationship data (join tables) for a single entity
export async function copyEntityRelationships(
  tx: Db,
  entityType: EntityType,
  sourceEntityId: string,
  targetEntityId: string,
  idMap: Record<string, string>,
  customizationIds?: Map<string, string>,
): Promise<void> {
  if (entityType === "feats") {
    const featsAptitudes = await FeatsAptitudes.findMany(tx, { featId: sourceEntityId });
    if (featsAptitudes.length > 0) {
      await FeatsAptitudes.createMany(
        tx,
        featsAptitudes.map((fa) => ({
          featId: targetEntityId,
          aptitudeId: idMap[fa.aptitudeId] ?? fa.aptitudeId,
        })),
      );
    }
  } else if (entityType === "powers") {
    const powersAptitudes = await PowersAptitudes.findMany(tx, { powerId: sourceEntityId });
    if (powersAptitudes.length > 0) {
      await PowersAptitudes.createMany(
        tx,
        powersAptitudes.map((pa) => ({
          powerId: targetEntityId,
          aptitudeId: idMap[pa.aptitudeId] ?? pa.aptitudeId,
          level: pa.level,
        })),
      );
    }
  } else if (entityType === "klasses") {
    // Copy klass_skills
    const klassSkills = await KlassSkills.findMany(tx, { klassIds: [sourceEntityId] });
    if (klassSkills.length > 0) {
      await KlassSkills.createMany(
        tx,
        klassSkills.map((ks) => ({
          klassId: targetEntityId,
          skillId: idMap[ks.skillId] ?? ks.skillId,
        })),
      );
    }

    // Copy levels and their sub-relationships
    const levels = await KlassLevels.findManyByKlass(tx, { klassId: sourceEntityId });
    if (levels.length === 0) return;

    const newLevels = await KlassLevels.createMany(
      tx,
      levels.map((l) => ({ ...l, id: undefined, klassId: targetEntityId })),
    );

    // Build level ID map (old -> new)
    const levelIdMapLocal: Record<string, string> = {};
    for (let i = 0; i < levels.length; i++) {
      levelIdMapLocal[levels[i].id] = newLevels[i].id;
    }

    const oldLevelIds = levels.map((l) => l.id);
    const levelSaves = await KlassLevelSaves.findMany(tx, { klassLevelIds: oldLevelIds });
    const levelFeats = await KlassLevelFeats.findMany(tx, { klassLevelIds: oldLevelIds });
    const levelPowers = await KlassLevelPowers.findMany(tx, { klassLevelIds: oldLevelIds });

    // Copy level customizations (modifiers, properties, requirements)
    const levelCusts = await fetchEntityCustomizations(tx, oldLevelIds, "klass_levels", "klass_levels");
    for (const oldLevelId of oldLevelIds) {
      const newLevelId = levelIdMapLocal[oldLevelId];
      const cust = levelCusts.get(oldLevelId);
      if (cust && newLevelId) {
        await copyEntityCustomizations(tx, oldLevelId, newLevelId, "klass_levels", cust, customizationIds);
      }
    }

    await KlassLevelSaves.createMany(
      tx,
      levelSaves.map((ls) => ({
        klassLevelId: levelIdMapLocal[ls.klassLevelId],
        saveId: idMap[ls.saveId] ?? ls.saveId,
        base: ls.base,
      })),
    );
    await KlassLevelFeats.createMany(
      tx,
      levelFeats.map((lf) => ({
        klassLevelId: levelIdMapLocal[lf.klassLevelId],
        featId: idMap[lf.featId] ?? lf.featId,
        aptitudeId: idMap[lf.aptitudeId] ?? lf.aptitudeId,
        free: lf.free,
      })),
    );
    await KlassLevelPowers.createMany(
      tx,
      levelPowers.map((lp) => ({
        klassLevelId: levelIdMapLocal[lp.klassLevelId],
        powerId: idMap[lp.powerId] ?? lp.powerId,
        aptitudeId: idMap[lp.aptitudeId] ?? lp.aptitudeId,
        free: lp.free,
      })),
    );
  }
}
