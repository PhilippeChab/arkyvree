import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { EntitySnapshots, Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import {
  cowEntityForCustomization, deleteModifiersWithCascade, deletePropertiesWithCascade,
  deleteRequirementsWithCascade, entityHasCharacterPicks,
} from "@/server/services/rulesets/cow.ts";
import type { GeneratedFeatIdentity, GeneratedFeatSource } from "@/shared/rulesets/generatedFeats.ts";
import type { GeneratedFeatDefinition, GeneratedFeatsHooks } from "@/server/rulesets/hooks/GeneratedFeatsHooks.ts";

export function matchesGeneratedSource(data: CachedRulesetData, candidate: GeneratedFeatSource | null, source: GeneratedFeatSource): boolean {
  return candidate != null && candidate.kind === source.kind && candidate.label === source.label
    && data.canonicalize(candidate.key) === data.canonicalize(source.key);
}

/** Shared lifecycle for every generated family; callers supply ruleset-specific definitions. */
export async function ensureGeneratedFeats(
  tx: Db, rulesetId: string, data: CachedRulesetData, source: GeneratedFeatSource, definitions: GeneratedFeatDefinition[],
) {
  const present = new Set(data.feats.filter(feat => matchesGeneratedSource(data, feat.generatedFrom, source))
    .map(feat => feat.generatedFrom!.family));
  // A manually authored feat can already occupy a generated name. Preserve it
  // without assigning it a dependency or deleting it during later cleanup.
  const occupiedNames = new Set(data.feats.map(feat => feat.name));
  for (const definition of definitions) if (occupiedNames.has(definition.name)) present.add(definition.family);
  if (definitions.length > 0 && definitions.every(definition => present.has(definition.family))) return;

  const overrides = data.cow.overrideMap.size > 0
    ? await EntitySnapshots.findGeneratedFeatOverrides(tx, { rulesetIds: [rulesetId, ...data.cow.sourceChain] }) : [];
  for (const { snapshot, generatedFrom } of overrides) {
    if (!matchesGeneratedSource(data, generatedFrom, source)) continue;
    if (data.canonicalize(snapshot.sourceEntityId) !== snapshot.forkedEntityId) continue;
    // An independent deletion stays deleted. Only undo automatic cleanup.
    present.add(generatedFrom!.family);
    if (snapshot.rulesetId !== rulesetId) continue;
    if (!matchesGeneratedSource(data, snapshot.generatedDeletion, source)) continue;
    await EntitySnapshots.lockForCopy(tx, rulesetId, snapshot.sourceEntityId);
    const current = await EntitySnapshots.findBySourceAndRuleset(tx, { rulesetId, sourceEntityId: snapshot.sourceEntityId });
    if (!current || !matchesGeneratedSource(data, current.generatedDeletion, source)) continue;
    if (await Feats.lockById(tx, current.forkedEntityId)) continue;
    await EntitySnapshots.deleteBySourceAndRuleset(tx, { rulesetId, sourceEntityId: snapshot.sourceEntityId });
  }

  const aptitudeIds = new Map(data.aptitudes.map(aptitude => [aptitude.name, aptitude.id]));
  for (const definition of definitions) {
    if (present.has(definition.family)) continue;
    const aptitudes = definition.aptitudes.map(name => aptitudeIds.get(name));
    if (aptitudes.some(id => id === undefined)) continue;
    const generatedFrom: GeneratedFeatIdentity = { ...source, family: definition.family };
    const [feat] = await Feats.create(tx, { name: definition.name, description: definition.description, rulesetId, generatedFrom });
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
  if (before && !hooks.hasOtherSources(data, before, entityId)) await removeGeneratedFeats(tx, rulesetId, data, before);
  if (after) await ensureGeneratedFeats(tx, rulesetId, data, after, hooks.definitions(after));
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

export async function removeGeneratedFeats(tx: Db, rulesetId: string, data: CachedRulesetData, source: GeneratedFeatSource) {
  const feats = data.feats.filter(feat => matchesGeneratedSource(data, feat.generatedFrom, source));
  for (const feat of feats) {
    if (await entityHasCharacterPicks(tx, "feats", feat.id, rulesetId)) {
      throw new ConflictError(`Cannot remove a ${feat.generatedFrom!.family} feat in use by a character in this ruleset`);
    }
  }
  for (const feat of feats) {
    const targetId = await cowEntityForCustomization(tx, rulesetId, "feats", feat.id);
    await deleteModifiersWithCascade(tx, { sourceIds: [targetId], sourceType: "feats" });
    await deletePropertiesWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
    await deleteRequirementsWithCascade(tx, { entityIds: [targetId], entityType: "feats" });
    await Feats.delete(tx, { id: targetId });
    await EntitySnapshots.updateGeneratedDeletion(tx, { rulesetId, forkedEntityId: targetId }, source);
  }
}
