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
  const sourceType = ENTITY_TYPE_TO_SOURCE_TYPE[entityType];

  const modifiersPerTarget = sourceCust.modifiers.length;
  const newModifiers = sourceType && modifiersPerTarget > 0
    ? await Modifiers.createMany(
        tx,
        targetEntityIds.flatMap((targetId) =>
          sourceCust.modifiers.map((m) => ({
            ...m,
            id: undefined,
            sourceId: targetId,
          })),
        ),
      )
    : [];

  // Record identities at copy time; equal modifier values do not imply the
  // same modifier (their requirements may differ).
  for (let i = 0; i < modifiersPerTarget; i++) {
    customizationIds?.set(sourceCust.modifiers[i].id, newModifiers[i].id);
  }

  if (sourceCust.properties.length > 0) {
    const copies = await Properties.createMany(
      tx,
      targetEntityIds.flatMap((targetId) =>
        sourceCust.properties.map((p) => ({
          ...p,
          id: undefined,
          entityId: targetId,
        })),
      ),
    );
    for (let i = 0; i < sourceCust.properties.length; i++) {
      customizationIds?.set(sourceCust.properties[i].id, copies[i].id);
    }
  }
  if (sourceCust.requirements.length > 0) {
    const copies = await Requirements.createMany(
      tx,
      targetEntityIds.flatMap((targetId) =>
        sourceCust.requirements.map((r) => ({
          ...r,
          id: undefined,
          entityId: targetId,
        })),
      ),
    );
    for (let i = 0; i < sourceCust.requirements.length; i++) {
      customizationIds?.set(sourceCust.requirements[i].id, copies[i].id);
    }
  }

  if (sourceCust.modifierRequirements.length > 0 && newModifiers.length > 0) {
    const copies = await Requirements.createMany(
      tx,
      targetEntityIds.flatMap((_targetId, targetIndex) => {
        const modifierIdMap = new Map<string, string>();
        for (let i = 0; i < modifiersPerTarget; i++) {
          modifierIdMap.set(
            sourceCust.modifiers[i].id,
            newModifiers[targetIndex * modifiersPerTarget + i].id,
          );
        }
        return sourceCust.modifierRequirements.map((r) => ({
          ...r,
          id: undefined,
          entityId: modifierIdMap.get(r.entityId) ?? r.entityId,
        }));
      }),
    );
    for (let i = 0; i < sourceCust.modifierRequirements.length; i++) {
      customizationIds?.set(sourceCust.modifierRequirements[i].id, copies[i].id);
    }
  }
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
