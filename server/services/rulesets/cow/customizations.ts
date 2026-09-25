import type { Db } from "@/server/database/index.ts";
import {
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevelSaves,
  KlassLevels,
  KlassSkills,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import type { EntityCustomizations, KlassRelationships } from "@/server/services/rulesets/hashing.ts";

// ──────────────────────────────────────────────────────────────
// Helper functions (extracted from RulesetsService)
// ──────────────────────────────────────────────────────────────

// Shape-only helper: groups four sets of customization rows into the
// `Map<entityId, EntityCustomizations>` structure callers expect. Pure JS,
// no DB access — the two fetchers below differ only in *how* the rows are
// fetched (proxied repo vs raw Drizzle).
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

// Direct-Drizzle variant of fetchEntityCustomizations that bypasses the repo
// proxy. Used by mergeSiblingData where the input ids are deliberately the
// sibling losers — the proxy would canonicalize them to the winner via
// idResolveMap and return the wrong rows. Mirrors fetchEntityCustomizations'
// query shape; if you change one, change both (or push the difference into
// buildCustomizationsMap so they re-converge).
export async function fetchSiblingCustomizationsRaw(
  tx: Db,
  entityIds: string[],
  entityType: string,
  sourceType?: string,
): Promise<Map<string, EntityCustomizations>> {
  if (entityIds.length === 0) return new Map();

  const modifiers = sourceType
    ? await tx.query.modifiersInCustomization.findMany({
      where: (m, { and: a, eq: e, inArray: i, isNull: n }) =>
        a(i(m.sourceId, entityIds), e(m.sourceType, sourceType), n(m.deletedAt)),
    })
    : [];
  const properties = await tx.query.propertiesInCustomization.findMany({
    where: (p, { and: a, eq: e, inArray: i, isNull: n }) =>
      a(i(p.entityId, entityIds), e(p.entityType, entityType), n(p.deletedAt)),
  });
  const requirements = await tx.query.requirementsInCustomization.findMany({
    where: (r, { and: a, eq: e, inArray: i, isNull: n }) =>
      a(i(r.entityId, entityIds), e(r.entityType, entityType), n(r.deletedAt)),
  });

  const modifierIds = modifiers.map((m) => m.id);
  const modifierRequirements = modifierIds.length > 0
    ? await tx.query.requirementsInCustomization.findMany({
      where: (r, { and: a, eq: e, inArray: i, isNull: n }) =>
        a(i(r.entityId, modifierIds), e(r.entityType, "modifiers"), n(r.deletedAt)),
    })
    : [];

  return buildCustomizationsMap(entityIds, modifiers, properties, requirements, modifierRequirements);
}

// Proxied-repo variant. Sibling/aliased ids are auto-canonicalized by
// canonicalizeArgs before each query — wrong for the sibling-loser case;
// mergeSiblingData uses fetchSiblingCustomizationsRaw instead. If you change
// one, change both.
export async function fetchEntityCustomizations(
  tx: Db,
  entityIds: string[],
  entityType: string,
  sourceType?: string,
): Promise<Map<string, EntityCustomizations>> {
  if (entityIds.length === 0) return new Map();

  const modifiers = sourceType
    ? await Modifiers.findManyBySource(tx, { sourceIds: entityIds, sourceType })
    : [];
  const properties = await Properties.findManyByEntity(tx, { entityIds, entityType });
  const requirements = await Requirements.findManyByEntity(tx, { entityIds, entityType });

  const modifierIds = modifiers.map((m) => m.id);
  const modifierRequirements = modifierIds.length > 0
    ? await Requirements.findManyByEntity(tx, { entityIds: modifierIds, entityType: "modifiers" })
    : [];

  return buildCustomizationsMap(entityIds, modifiers, properties, requirements, modifierRequirements);
}

export async function fetchKlassRelationships(
  tx: Db,
  klassIds: string[],
): Promise<Map<string, KlassRelationships>> {
  if (klassIds.length === 0) return new Map();

  const map = new Map<string, KlassRelationships>();
  for (const klassId of klassIds) {
    map.set(klassId, { levels: [], levelSaves: [], levelFeats: [], levelPowers: [], klassSkills: [] });
  }

  const klassSkills = await KlassSkills.findMany(tx, { klassIds });

  for (const ks of klassSkills) {
    map.get(ks.klassId)?.klassSkills.push(ks);
  }

  // Fetch levels for all klasses (serial: tx client can only run one query at a time)
  const allLevels: { klassId: string; levels: Awaited<ReturnType<typeof KlassLevels.findManyByKlass>> }[] = [];
  for (const klassId of klassIds) {
    const levels = await KlassLevels.findManyByKlass(tx, { klassId });
    allLevels.push({ klassId, levels });
  }

  const allLevelIds: string[] = [];
  for (const { klassId, levels } of allLevels) {
    const rel = map.get(klassId)!;
    rel.levels = levels.map((l) => ({ level: l.level, id: l.id }));
    allLevelIds.push(...levels.map((l) => l.id));
  }

  if (allLevelIds.length > 0) {
    const levelSaves = await KlassLevelSaves.findMany(tx, { klassLevelIds: allLevelIds });
    const levelFeats = await KlassLevelFeats.findMany(tx, { klassLevelIds: allLevelIds });
    const levelPowers = await KlassLevelPowers.findMany(tx, { klassLevelIds: allLevelIds });

    // Build level-to-klass map
    const levelToKlass = new Map<string, string>();
    for (const { klassId, levels } of allLevels) {
      for (const level of levels) {
        levelToKlass.set(level.id, klassId);
      }
    }

    for (const ls of levelSaves) {
      const klassId = levelToKlass.get(ls.klassLevelId);
      if (klassId) map.get(klassId)?.levelSaves.push(ls);
    }
    for (const lf of levelFeats) {
      const klassId = levelToKlass.get(lf.klassLevelId);
      if (klassId) map.get(klassId)?.levelFeats.push(lf);
    }
    for (const lp of levelPowers) {
      const klassId = levelToKlass.get(lp.klassLevelId);
      if (klassId) map.get(klassId)?.levelPowers.push(lp);
    }
  }

  return map;
}

// Also fetch klass_level customizations (modifiers, properties, requirements) for snapshot hashing
export async function fetchKlassLevelCustomizations(
  tx: Db,
  klassIds: string[],
): Promise<Map<string, EntityCustomizations>> {
  if (klassIds.length === 0) return new Map();

  // Fetch all levels for these klasses
  const allLevelIds: string[] = [];
  const klassToLevelIds = new Map<string, string[]>();
  for (const klassId of klassIds) {
    const levels = await KlassLevels.findManyByKlass(tx, { klassId });
    const levelIds = levels.map((l) => l.id);
    klassToLevelIds.set(klassId, levelIds);
    allLevelIds.push(...levelIds);
  }

  if (allLevelIds.length === 0) return new Map();

  // Fetch customizations for all levels
  const levelCustomizations = await fetchEntityCustomizations(tx, allLevelIds, "klass_levels", "klass_levels");

  // Merge per-klass
  const map = new Map<string, EntityCustomizations>();
  for (const klassId of klassIds) {
    const levelIds = klassToLevelIds.get(klassId) ?? [];
    const merged: EntityCustomizations = { modifiers: [], properties: [], requirements: [], modifierRequirements: [] };
    for (const levelId of levelIds) {
      const lc = levelCustomizations.get(levelId);
      if (lc) {
        merged.modifiers.push(...lc.modifiers);
        merged.properties.push(...lc.properties);
        merged.requirements.push(...lc.requirements);
        merged.modifierRequirements.push(...lc.modifierRequirements);
      }
    }
    map.set(klassId, merged);
  }

  return map;
}
