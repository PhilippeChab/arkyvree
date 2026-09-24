import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { EntitySnapshots, Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import {
  cowEntityForCustomization, deleteModifiersWithCascade, deletePropertiesWithCascade,
  deleteRequirementsWithCascade, entityHasCharacterPicks,
} from "@/server/services/rulesets/cow.ts";
import type { GeneratedFeatDefinition, GeneratedFeatSource, GeneratedFeatsHooks } from "@/server/rulesets/hooks/GeneratedFeatsHooks.ts";

export function matchesGeneratedSource(data: CachedRulesetData, candidate: GeneratedFeatSource | null, source: GeneratedFeatSource): boolean {
  return candidate != null && candidate.kind === source.kind && candidate.label === source.label
    && data.canonicalize(candidate.key) === data.canonicalize(source.key);
}

/** Include tombstones for generation checks; cleanup uses only visible matches. */
async function findGeneratedFeats(
  tx: Db, rulesetId: string, data: CachedRulesetData, hooks: GeneratedFeatsHooks, source: GeneratedFeatSource,
): Promise<Map<string, string>> {
  const matches = new Map<string, string>();
  const names = hooks.names(source);
  for (const feat of data.feats) {
    const family = hooks.matchFamily(data, feat, source, names);
    if (family) matches.set(feat.id, family);
  }
  if (data.cow.overrideMap.size > 0) {
    // Snapshot source IDs remain stored IDs. Resolve them through the existing
    // COW map to find renamed copies or tombstones, without reloading rules.
    const sources = await EntitySnapshots.findFeatSources(tx, {
      rulesetIds: [rulesetId, ...data.cow.sourceChain], names: [...names.keys()],
    });
    for (const source of sources) matches.set(data.canonicalize(source.sourceEntityId), names.get(source.name)!);
  }
  return matches;
}

/** Shared lifecycle; ruleset hooks identify families from existing content. */
export async function ensureGeneratedFeats(
  tx: Db, rulesetId: string, data: CachedRulesetData, hooks: GeneratedFeatsHooks,
  source: GeneratedFeatSource, definitions: GeneratedFeatDefinition[],
) {
  if (definitions.length === 0) return;
  const matches = await findGeneratedFeats(tx, rulesetId, data, hooks, source);
  const present = new Set(matches.values());
  // An occupied name or a COW tombstone must not be recreated automatically.
  const occupiedNames = new Set(data.feats.map(feat => feat.name));
  for (const definition of definitions) if (occupiedNames.has(definition.name)) present.add(definition.family);

  const aptitudeIds = new Map(data.aptitudes.map(aptitude => [aptitude.name, aptitude.id]));
  for (const definition of definitions) {
    if (present.has(definition.family)) continue;
    const aptitudes = definition.aptitudes.map(name => aptitudeIds.get(name));
    if (aptitudes.some(id => id === undefined)) continue;
    const [feat] = await Feats.create(tx, { name: definition.name, description: definition.description, rulesetId });
    await FeatsAptitudes.createMany(tx, aptitudes.map(aptitudeId => ({ featId: feat.id, aptitudeId: aptitudeId! })));
    await Modifiers.createMany(tx, definition.modifiers.map(modifier => ({ ...modifier, sourceId: feat.id, sourceType: "feats" })));
    if (definition.requirements?.length) await Requirements.createMany(tx,
      definition.requirements.map(requirement => ({ ...requirement, entityId: feat.id, entityType: "feats" })));
    if (definition.properties?.length) await Properties.createMany(tx,
      definition.properties.map(property => ({ ...property, entityId: feat.id, entityType: "feats" })));
  }
}

export async function syncGeneratedFeats(
  tx: Db, rulesetId: string, data: CachedRulesetData, hooks: GeneratedFeatsHooks,
  entityId: string, before: GeneratedFeatSource | null, after: GeneratedFeatSource | null,
) {
  if (before && after && matchesGeneratedSource(data, before, after)) return;
  if (before && !hooks.hasOtherSources(data, before, entityId)) await removeGeneratedFeats(tx, rulesetId, data, hooks, before);
  if (after) await ensureGeneratedFeats(tx, rulesetId, data, hooks, after, hooks.definitions(after));
}

export function generatedSourceProperties(data: CachedRulesetData, entityId: string, own = data.propertiesByEntity.get(entityId) ?? []) {
  const templateId = data.itemsById.get(entityId)?.sourceItemId;
  const inherited = templateId ? data.propertiesByEntity.get(templateId) ?? [] : [];
  const types = new Set(own.map(property => property.type));
  return [...own, ...inherited.filter(property => !types.has(property.type))];
}

export async function syncGeneratedPropertyChange(
  tx: Db, rulesetId: string, data: CachedRulesetData, hooks: GeneratedFeatsHooks,
  entityType: string, entityId: string, resolvedEntityId: string, entityName: string, propertyTypes: string[],
) {
  if (!hooks.entityTypes.includes(entityType) || !propertyTypes.some(type => hooks.propertyTypes.includes(type))) return;
  const entity = { id: entityId, name: entityName };
  const before = hooks.source(entityType, entity, generatedSourceProperties(data, entityId));
  const properties = await Properties.findManyByEntity(tx, { entityIds: [resolvedEntityId], entityType });
  const after = hooks.source(entityType, entity, generatedSourceProperties(data, entityId, properties));
  await syncGeneratedFeats(tx, rulesetId, data, hooks, entityId, before, after);
}

export async function removeGeneratedFeats(
  tx: Db, rulesetId: string, data: CachedRulesetData, hooks: GeneratedFeatsHooks, source: GeneratedFeatSource,
) {
  const matches = await findGeneratedFeats(tx, rulesetId, data, hooks, source);
  const feats = data.feats.filter(feat => matches.has(feat.id));
  for (const feat of feats) {
    if (await entityHasCharacterPicks(tx, "feats", feat.id, rulesetId)) {
      throw new ConflictError(`Cannot remove a ${matches.get(feat.id)} feat in use by a character in this ruleset`);
    }
  }
  for (const feat of feats) {
    const targetId = await cowEntityForCustomization(tx, rulesetId, "feats", feat.id);
    await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "feats" });
    await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
    await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
    await Feats.delete(tx, { id: targetId });
  }
}
