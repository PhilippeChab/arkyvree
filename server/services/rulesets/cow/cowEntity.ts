import type { Db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { EntitySnapshots, Klasses, KlassLevels, Modifiers, Rulesets } from "@/server/repositories/index.ts";
import { withCowContext } from "@/server/services/rulesets/cowContext.ts";
import { resolveCustomizationId } from "@/server/services/rulesets/customization/resolveCustomizationId.ts";
import { hashEntity, type EntityType, type KlassRelationships } from "@/server/services/rulesets/hashing.ts";
import { CUSTOMIZATION_REPOS, ENTITY_REPOS, ENTITY_TYPE_TO_SOURCE_TYPE, type CustomizationKind, type EntityWithId } from "./constants.ts";
import { copyEntityCustomizations, copyEntityRelationships } from "./copy.ts";
import { fetchEntityCustomizations, fetchKlassLevelCustomizations, fetchKlassRelationships } from "./customizations.ts";
import { buildOverrideMap, buildSourceChain } from "./overrideMap.ts";
import { mergeSiblingData } from "./siblingMerge.ts";

/** Serialize child writes with deletion/revert of their stored owner. */
export async function lockEntityForMutation(tx: Db, entityType: EntityType, entityId: string): Promise<void> {
  if (!await ENTITY_REPOS[entityType].lockById(tx, entityId)) {
    throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
}

/**
 * COW trigger: copies a parent entity to the child fork, including all
 * customizations, relationships, and creates the entity_snapshot record.
 *
 * @returns The newly created child entity (with its new ID)
 */
export async function cowEntity(
  tx: Db,
  entityType: EntityType,
  entityId: string,
  childRulesetId: string,
  ancestorRulesetIds: string[],
  extensionRulesetIds: string[],
  customizationIds?: Map<string, string>,
): Promise<EntityWithId> {
  const repo = ENTITY_REPOS[entityType];
  const sourceType = ENTITY_TYPE_TO_SOURCE_TYPE[entityType];

  // A second first edit must wait for the copying transaction, then see its
  // committed snapshot. Keep this separate from the SELECT: under READ
  // COMMITTED, a SELECT started before the wait retains its old snapshot.
  await EntitySnapshots.lockForCopy(tx, childRulesetId, entityId);

  // 0. Idempotency: if a COW copy already exists, return it.
  // If the snapshot is a tombstone (the COW row was hard-deleted by a
  // user-initiated delete on an overridden entity), drop the snapshot so
  // we can re-COW below with a fresh forkedEntityId.
  const existingSnapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
    sourceEntityId: entityId,
    rulesetId: childRulesetId,
  });
  if (existingSnapshot) {
    const exists = await repo.lockById(tx, existingSnapshot.forkedEntityId);
    const existing = exists ? await repo.findOne(tx, { id: existingSnapshot.forkedEntityId } as never) : undefined;
    if (existing) return existing as EntityWithId;
    await EntitySnapshots.deleteBySourceAndRuleset(tx, {
      sourceEntityId: entityId,
      rulesetId: childRulesetId,
    });
  }

  // 1. Fetch the parent entity
  if (!await repo.lockById(tx, entityId, "share")) {
    throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
  const parentEntity = await repo.findOne(tx, { id: entityId } as never);
  if (!parentEntity) {
    throw new Error(`Parent entity not found: ${entityType}/${entityId}`);
  }

  // 2. Copy entity to child ruleset
  const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, rulesetId: _rid, ...entityData } = parentEntity as Record<string, unknown>;
  const newRows = await repo.create(tx, { ...entityData, rulesetId: childRulesetId } as never);
  const newEntity = newRows[0] as EntityWithId;

  // 3. Copy customizations
  const customizations = await fetchEntityCustomizations(tx, [entityId], entityType, sourceType);
  const cust = customizations.get(entityId) ?? { modifiers: [], properties: [], requirements: [], modifierRequirements: [] };
  await copyEntityCustomizations(tx, entityId, newEntity.id, entityType, cust, customizationIds);

  // 4. Copy relationships (aptitudes, klass levels, etc.)
  // idResolveMap (true overrides + sibling-loser aliases) is what we want for
  // FK remapping — a child copy's references should always point at the
  // canonical winner, never at a stale loser.
  const { siblingMap, idResolveMap } = await buildOverrideMap(tx, childRulesetId, ancestorRulesetIds, extensionRulesetIds);
  const idMap: Record<string, string> = {};
  for (const [sourceId, forkedId] of idResolveMap) {
    idMap[sourceId] = forkedId;
  }
  await copyEntityRelationships(tx, entityType, entityId, newEntity.id, idMap, customizationIds);

  // 4b. Merge sibling data when multiple extensions COW the same base entity
  const siblingIds = siblingMap.get(entityId);
  if (siblingIds && siblingIds.length > 0) {
    await mergeSiblingData(tx, newEntity.id, entityType, sourceType, siblingIds, customizationIds);
  }

  // 5. Compute content hash and create snapshot
  let klassRelationships: KlassRelationships | undefined;
  let entityCustomizations = cust;
  if (entityType === "klasses") {
    const relMap = await fetchKlassRelationships(tx, [entityId]);
    klassRelationships = relMap.get(entityId);
    const levelCustMap = await fetchKlassLevelCustomizations(tx, [entityId]);
    const levelCust = levelCustMap.get(entityId);
    if (levelCust) {
      entityCustomizations = {
        modifiers: [...cust.modifiers, ...levelCust.modifiers],
        properties: [...cust.properties, ...levelCust.properties],
        requirements: [...cust.requirements, ...levelCust.requirements],
        modifierRequirements: [...cust.modifierRequirements, ...levelCust.modifierRequirements],
      };
    }
  }

  const contentHash = hashEntity(
    entityType,
    parentEntity as Record<string, unknown>,
    entityCustomizations,
    klassRelationships,
  );

  await EntitySnapshots.create(tx, {
    rulesetId: childRulesetId,
    entityType,
    sourceEntityId: entityId,
    forkedEntityId: newEntity.id,
    contentHash,
  });

  return newEntity;
}

/**
 * Resolve the stored row a customization update or delete should change.
 * `entityId` is the owner the row is shown on, so visible sibling contributions
 * resolve like the entity's own rows. COWs that owner when inherited and returns
 * the copy made for the row. A row on a local owner is re-read after the owner
 * lock, which may have waited for its deletion.
 */
export async function cowCustomizationForMutation(
  tx: Db,
  rulesetId: string,
  entityType: string,
  entityId: string,
  kind: CustomizationKind,
  customizationId: string,
  customizationIds: Map<string, string> = new Map(),
): Promise<{ resolvedEntityId: string; resolvedCustomizationId: string }> {
  const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, entityId, customizationIds);
  const resolvedCustomizationId = resolveCustomizationId(entityId, resolvedEntityId, customizationId, customizationIds, kind);
  if (resolvedCustomizationId === customizationId
    && !await withCowContext(undefined, () => CUSTOMIZATION_REPOS[kind].exists(tx, { id: customizationId }))) {
    throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
  return { resolvedEntityId, resolvedCustomizationId };
}

/** Resolve a modifier as the owner of requirements: COW its owning entity and map the modifier to its copy. */
async function cowModifierForCustomization(
  tx: Db,
  rulesetId: string,
  modifierId: string,
  customizationIds: Map<string, string>,
): Promise<string> {
  // Keep the stored source ID: the repository proxy remaps it after COW,
  // which would make an ancestor modifier appear locally owned on repeat edits.
  const modifier = await withCowContext(undefined, () => Modifiers.findOne(tx, { id: modifierId }));
  if (!modifier || modifier.sourceType === "modifiers") throw new NotFoundError("Customization source not found in this ruleset");

  const { resolvedCustomizationId } = await cowCustomizationForMutation(
    tx, rulesetId, modifier.sourceType, modifier.sourceId, "modifier", modifier.id, customizationIds,
  );
  return resolvedCustomizationId;
}

/**
 * COW helper for customization mutations. Given an entityType and entityId,
 * checks if the entity belongs to the parent ruleset and COWs it if needed.
 * Returns the resolved entityId (original if owned, COW'd copy if inherited).
 *
 * For klass_levels: COWs the entire parent klass, then maps the old level ID
 * to the new one via the override map.
 */
export async function cowEntityForCustomization(
  tx: Db,
  rulesetId: string,
  entityType: string,
  entityId: string,
  customizationIds: Map<string, string> = new Map(),
): Promise<string> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Customization source not found in this ruleset");
  const sourceChain = buildSourceChain(ruleset);

  if (entityType === "klass_levels") {
    // Find which klass owns this level
    const level = await KlassLevels.findOne(tx, { id: entityId });
    if (!level) throw new NotFoundError("Customization source not found in this ruleset");

    const klass = await Klasses.findOne(tx, { id: level.klassId } as never);
    if (!klass) throw new NotFoundError("Customization source not found in this ruleset");

    if (klass.rulesetId === rulesetId) {
      await lockEntityForMutation(tx, "klasses", klass.id);
      if (!await KlassLevels.findOne(tx, { id: level.id })) {
        throw new NotFoundError("Customization source no longer exists; refresh the entity");
      }
      return level.id;
    }
    if (!sourceChain.includes(klass.rulesetId)) throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

    // COW the klass (copies all levels)
    const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain, ruleset.extensionRulesetIds, customizationIds);
    // Find the new level by matching level number (levels aren't individually snapshotted)
    const newLevels = await KlassLevels.findManyByKlass(tx, { klassId: cowResult.id as string });
    const newLevel = newLevels.find((l) => l.level === level.level);
    if (!newLevel) throw new NotFoundError("Copied class level not found");
    return newLevel.id;
  }

  if (entityType === "modifiers") {
    return cowModifierForCustomization(tx, rulesetId, entityId, customizationIds);
  }

  // Standard entity types
  const entityTypeMap: Record<string, EntityType> = {
    feats: "feats",
    powers: "powers",
    items: "items",
    races: "races",
    klasses: "klasses",
  };

  const cowType = entityTypeMap[entityType];
  if (!cowType) throw new NotFoundError("Customization source not found in this ruleset");

  const repo = ENTITY_REPOS[cowType];
  const entity = await repo.findOne(tx, { id: entityId } as never);
  if (!entity) throw new NotFoundError("Customization source not found in this ruleset");

  const entityRecord = entity as Record<string, unknown>;
  if (entityRecord.rulesetId === rulesetId) {
    await lockEntityForMutation(tx, cowType, entity.id);
    return entity.id;
  }
  if (!sourceChain.includes(entityRecord.rulesetId as string)) throw new NotFoundError("Customization source not found in this ruleset"); // Not from source chain

  const cowResult = await cowEntity(tx, cowType, entity.id, rulesetId, sourceChain, ruleset.extensionRulesetIds, customizationIds);
  return cowResult.id;
}
