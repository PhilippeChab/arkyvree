import { type Db, withCowContext } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

/** An entity's customizations: its modifiers, with their requirements apart, its properties and its requirements. */
export interface EntityCustomizations {
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
  modifierRequirements: Requirement[];
}

/** Each entity's customizations, by its id: the rows grouped by the entity they belong to, a modifier's by its source. */
function buildCustomizationsMap(
  entityIds: string[],
  modifiers: EntityCustomizations["modifiers"],
  properties: EntityCustomizations["properties"],
  requirements: EntityCustomizations["requirements"],
  modifierRequirements: EntityCustomizations["modifierRequirements"],
): Map<string, EntityCustomizations> {
  const modifierToEntity = new Map<string, string>();
  for (const m of modifiers) modifierToEntity.set(m.id, m.sourceId);

  const map = new Map<string, EntityCustomizations>();
  for (const id of entityIds) {
    map.set(id, { modifiers: [], properties: [], requirements: [], modifierRequirements: [] });
  }
  for (const m of modifiers) map.get(m.sourceId)?.modifiers.push(m);
  for (const p of properties) map.get(p.entityId)?.properties.push(p);
  for (const r of requirements) map.get(r.entityId)?.requirements.push(r);
  for (const mr of modifierRequirements) {
    const entityId = modifierToEntity.get(mr.entityId);
    if (entityId) map.get(entityId)?.modifierRequirements.push(mr);
  }
  return map;
}

/**
 * The customizations of `entityIds` (of `entityType`), by entity: their properties and requirements, and, for a type
 * modifiers have (`sourceType`), their modifiers with each one's requirements.
 */
export async function fetchEntityCustomizations(
  tx: Db,
  entityIds: string[],
  entityType: string,
  sourceType?: string,
): Promise<Map<string, EntityCustomizations>> {
  const modifiers = sourceType ? await Modifiers.findMany(tx, { sourceIds: entityIds, sourceType }) : [];
  const properties = await Properties.findMany(tx, { entityIds, entityType });
  const requirements = await Requirements.findMany(tx, { entityIds, entityType });

  const modifierRequirements = await Requirements.findMany(tx, {
    entityIds: modifiers.map((m) => m.id),
    entityType: "modifiers",
  });

  return buildCustomizationsMap(entityIds, modifiers, properties, requirements, modifierRequirements);
}

/**
 * The customizations of sibling losers, by their own ids: read with copy-on-write resolution off, which would otherwise
 * resolve each loser to its winner and return the winner's rows. What `EntityCopy` merges into the winner's copy.
 */
export async function fetchSiblingCustomizations(
  tx: Db,
  entityIds: string[],
  entityType: string,
  sourceType?: string,
): Promise<Map<string, EntityCustomizations>> {
  return await withCowContext(undefined, () => fetchEntityCustomizations(tx, entityIds, entityType, sourceType));
}
