import { and, eq, getTableName, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import {
  entitySnapshotsInRules,
  featsInRules,
  modifiersInCustomization,
  powersInRules,
  propertiesInCustomization,
  requirementsInCustomization,
} from "@/drizzle/schema.ts";
import MemoryCache from "@/server/cache/MemoryCache.ts";
import { db, type Db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import {
  Abilities,
  Activities,
  Aptitudes,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
  CharacterLevels,
  Characters,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevels,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevelSaves,
  KlassSkills,
  Languages,
  Mechanics,
  Modifiers,
  Powers,
  PowersAptitudes,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import { withCowContext } from "@/server/services/rulesets/cowContext.ts";
import { hashEntity, type EntityCustomizations, type EntityType, type KlassRelationships } from "@/server/services/rulesets/hashing.ts";
import { getOrFetchRulesetData, type CachedRulesetData } from "@/server/cache/rulesetCache.ts";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

interface EntityWithId {
  id: string;
  [key: string]: unknown;
}

// Customization source type mapping — entity types that have modifiers use a different sourceType
const ENTITY_TYPE_TO_SOURCE_TYPE: Record<string, string> = {
  feats: "feats",
  powers: "powers",
  items: "items",
  races: "races",
  klass_levels: "klass_levels",
};

// Tables that participate in the name-based sibling fallback. Limited to
// feats and powers because those are the entity types D&D sourcebooks
// commonly reprint (e.g. a spell appearing in CA + CD). For other entity
// types (races, classes, abilities, saves, skills, items, languages,
// mechanics) a same-name match across extensions is more likely a genuine
// collision than a reprint — auto-merging "Human" or "Fighter" between two
// homebrew packages would silently corrupt content. Aptitudes are also
// excluded; they have their own name-grouping pass since name = identity
// universally for them.
//
// `NAME_FALLBACK_ENTITY_TYPES` is the canonical list — re-export it from
// here and consume it in `RulesetsService.assertExtensionsNameCompatible`
// so the runtime pairing and the subscribe-time block agree on which
// types pair.
export const NAME_FALLBACK_ENTITY_TYPES = ["feats", "powers"] as const;
const NAME_FALLBACK_TABLES = [
  { entityType: "feats", table: featsInRules },
  { entityType: "powers", table: powersInRules },
] as const;

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
async function fetchSiblingCustomizationsRaw(
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
async function fetchEntityCustomizations(
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

async function fetchKlassRelationships(
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
async function fetchKlassLevelCustomizations(
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

// Copy customizations from source entity to target entity
async function copyEntityCustomizations(
  tx: Db,
  _sourceEntityId: string,
  targetEntityId: string,
  entityType: string,
  sourceCust: EntityCustomizations,
): Promise<void> {
  await copyEntityCustomizationsToMany(tx, [targetEntityId], entityType, sourceCust);
}

async function copyEntityCustomizationsToMany(
  tx: Db,
  targetEntityIds: string[],
  entityType: string,
  sourceCust: EntityCustomizations,
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

  if (sourceCust.properties.length > 0) {
    await Properties.createMany(
      tx,
      targetEntityIds.flatMap((targetId) =>
        sourceCust.properties.map((p) => ({
          ...p,
          id: undefined,
          entityId: targetId,
        })),
      ),
    );
  }
  if (sourceCust.requirements.length > 0) {
    await Requirements.createMany(
      tx,
      targetEntityIds.flatMap((targetId) =>
        sourceCust.requirements.map((r) => ({
          ...r,
          id: undefined,
          entityId: targetId,
        })),
      ),
    );
  }

  if (sourceCust.modifierRequirements.length > 0 && newModifiers.length > 0) {
    await Requirements.createMany(
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
  }
}

// Copy relationship data (join tables) for a single entity
async function copyEntityRelationships(
  tx: Db,
  entityType: EntityType,
  sourceEntityId: string,
  targetEntityId: string,
  idMap: Record<string, string>,
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
        await copyEntityCustomizations(tx, oldLevelId, newLevelId, "klass_levels", cust);
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

// ──────────────────────────────────────────────────────────────
// Requirement forest model (used by sibling-merge below + the
// matching read-time compose in rulesetCache.ts)
//
// Every entity's requirements form a forest of trees:
//   - Each top-level entry is a root (no `.` parent prefix).
//   - Top-level standalone leaves and chain roots are AND'd at the top level
//     (the implicit AND of the schema).
//   - Chains nest recursively: an OR root contains children which can be
//     leaves OR chain roots themselves (AND-of-ORs, OR-of-ANDs, etc.).
//
// Merging multiple sources (target + N siblings) is `AND(target, sib1, ...)` —
// each source's tree is preserved verbatim and appended at the top level of
// the combined forest. Sibling chain trees get fresh top-level integer roots
// to avoid colliding with target's existing levels; their internal child
// indices are renumbered recursively.
// ──────────────────────────────────────────────────────────────

const MAX_REQ_TREE_DEPTH = 5;

type ReqRow = {
  level: string;
  chainingOperator?: string | null;
  target?: string | null;
  operator?: string | null;
  value?: string | null;
  valueType?: string | null;
};

type ReqLeafNode = {
  kind: "leaf";
  target: string;
  operator: string;
  value: string;
  valueType: string;
};
type ReqChainNode = {
  kind: "chain";
  op: string; // "or" | "and"
  children: ReqNode[];
};
type ReqNode = ReqLeafNode | ReqChainNode;

function parentLevelOf(level: string): string | null {
  const idx = level.lastIndexOf(".");
  return idx === -1 ? null : level.slice(0, idx);
}

/**
 * Build the requirement forest from a flat list of rows for a single entity.
 * Top-level entries (rows with no parent in the set) become forest roots.
 * Chain roots recurse into their direct children. Throws on depth overflow.
 */
function buildReqForest(rows: ReqRow[]): ReqNode[] {
  const byLevel = new Map<string, ReqRow>();
  for (const r of rows) byLevel.set(r.level, r);

  const directChildrenOf = (parent: string): ReqRow[] => {
    const prefix = `${parent}.`;
    return rows.filter((r) => {
      if (!r.level.startsWith(prefix)) return false;
      // Direct child only — its parent must be `parent`, not a deeper ancestor
      return parentLevelOf(r.level) === parent;
    });
  };

  function buildNode(row: ReqRow, depth: number): ReqNode {
    if (depth >= MAX_REQ_TREE_DEPTH) {
      throw new Error(`Requirement tree exceeds max depth (${MAX_REQ_TREE_DEPTH})`);
    }
    if (row.chainingOperator) {
      const children = directChildrenOf(row.level)
        .sort((a, b) => a.level.localeCompare(b.level))
        .map((c) => buildNode(c, depth + 1));
      return { kind: "chain", op: row.chainingOperator, children };
    }
    return {
      kind: "leaf",
      target: row.target!,
      operator: row.operator!,
      value: row.value!,
      valueType: row.valueType!,
    };
  }

  const topLevelRows = rows.filter((r) => {
    const p = parentLevelOf(r.level);
    return p === null || !byLevel.has(p);
  });

  return topLevelRows
    .sort((a, b) => a.level.localeCompare(b.level))
    .map((r) => buildNode(r, 0));
}

/**
 * Serialize a tree node into flat row inserts under a given level prefix.
 * Children are renumbered as level.1, level.2, ... regardless of their original
 * indices, so the result is collision-free as long as the caller picks a
 * non-overlapping `level`.
 */
type ReqInsert = {
  entityId: string;
  entityType: string;
  level: string;
  target?: string;
  operator?: string;
  value?: string;
  valueType?: string;
  chainingOperator?: "or" | "and";
};

function serializeReqNode(
  node: ReqNode,
  level: string,
  entityId: string,
  entityType: string,
): ReqInsert[] {
  if (node.kind === "leaf") {
    return [{
      entityId, entityType, level,
      target: node.target,
      operator: node.operator,
      value: node.value,
      valueType: node.valueType,
    }];
  }
  const out: ReqInsert[] = [{
    entityId, entityType, level,
    chainingOperator: node.op as "or" | "and",
  }];
  for (let idx = 0; idx < node.children.length; idx++) {
    out.push(...serializeReqNode(node.children[idx], `${level}.${idx + 1}`, entityId, entityType));
  }
  return out;
}

/**
 * Drop a node's leaves that duplicate any condition already represented
 * elsewhere on the entity (either as a top-level standalone or anywhere
 * inside another chain). Recurses through chain children. If a chain ends
 * up empty, the chain itself is dropped (returns null).
 *
 * Schema constraint: the requirements table has a unique key on
 * (entity_id, entity_type, target, operator, value). The same condition
 * can't appear twice on one entity even across chains, so the merge can't
 * fully preserve `(a OR b) AND (a OR c)` — the duplicated `a` is dropped
 * from the second chain. This is a known semantic gap of the storage
 * layer; the alternative (combining chains into one big OR) would be a
 * worse loss.
 */
function dedupAgainstExisting(
  node: ReqNode,
  existingKeys: Set<string>,
): ReqNode | null {
  if (node.kind === "leaf") {
    const key = `${node.target}|${node.operator}|${node.value}`;
    if (existingKeys.has(key)) return null;
    return node;
  }
  const filteredChildren: ReqNode[] = [];
  for (const child of node.children) {
    const result = dedupAgainstExisting(child, existingKeys);
    if (result) filteredChildren.push(result);
  }
  if (filteredChildren.length === 0) return null;
  return { kind: "chain", op: node.op, children: filteredChildren };
}

function collectAllLeafKeys(forest: ReqNode[]): Set<string> {
  const keys = new Set<string>();
  function walk(node: ReqNode) {
    if (node.kind === "leaf") {
      keys.add(`${node.target}|${node.operator}|${node.value}`);
    } else {
      for (const child of node.children) walk(child);
    }
  }
  for (const node of forest) walk(node);
  return keys;
}

function collectTopLevelStandaloneKeys(forest: ReqNode[]): Set<string> {
  const keys = new Set<string>();
  for (const node of forest) {
    if (node.kind === "leaf") {
      keys.add(`${node.target}|${node.operator}|${node.value}`);
    }
  }
  return keys;
}

/**
 * Merge sibling data into a COW'd entity. When multiple extensions COW the same
 * base entity, the "winner" is copied first. This function merges unique data
 * from sibling extension copies (requirements, modifiers, aptitude links) so the
 * child fork starts from the full merged view.
 */
async function mergeSiblingData(
  tx: Db,
  targetEntityId: string,
  entityType: EntityType,
  sourceType: string | undefined,
  siblingIds: string[],
): Promise<void> {
  // Sibling-loser ids are aliased to their winners in idResolveMap, so the
  // repo proxy would rewrite `findManyBySource(siblingIds)` to fetch the
  // winner's rows. mergeSiblingData explicitly wants the literal stored
  // loser rows, so it reads through Drizzle directly (the proxy wraps repos
  // for application-code convenience; this is infrastructure copying raw
  // rows by id).
  const siblingCusts = await fetchSiblingCustomizationsRaw(tx, siblingIds, entityType, sourceType);

  // 1. Merge sibling requirements as a proper recursive forest merge.
  // Build the target's forest, then for each sibling: build its forest, dedup
  // its leaves against target standalones, and append its trees at fresh
  // top-level positions on the target. Top-level AND across all rows combines
  // them: `(target) AND (sibling_1) AND (sibling_2) AND ...`.
  const targetReqs = await Requirements.findManyByEntity(tx, { entityIds: [targetEntityId], entityType });
  const targetForest = buildReqForest(targetReqs);
  const usedLevels = new Set<string>(targetReqs.map((r) => r.level));
  // Dedup is purely semantic now: drop any sibling-tree leaf that matches a
  // top-level standalone already required on target (the AND already forces
  // it; redundant within the new chain). Same condition can otherwise appear
  // in multiple chains — `(barbarian OR x) AND (barbarian OR y)` is a real
  // distinct constraint vs. the deduped `(barbarian OR x) AND y`.
  const targetStandaloneKeys = collectTopLevelStandaloneKeys(targetForest);
  let maxTopInt = 0;
  for (const r of targetReqs) {
    const m = /^(\d+)$/.exec(r.level);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxTopInt) maxTopInt = n;
    }
  }

  const newReqs: Array<{
    entityId: string;
    entityType: string;
    level: string;
    target?: string;
    operator?: string;
    value?: string;
    valueType?: string;
    chainingOperator?: "or" | "and";
  }> = [];

  for (const [, sibCust] of siblingCusts) {
    const sibForest = buildReqForest(sibCust.requirements);

    for (const tree of sibForest) {
      // Drop leaves matching a top-level standalone already required on target
      // (semantically redundant within the new chain). Empty trees are skipped.
      const deduped = dedupAgainstExisting(tree, targetStandaloneKeys);
      if (!deduped) continue;

      // Allocate a fresh top-level position for this sibling tree:
      //   - Chain roots and leaves with integer-only original level → next int
      //   - Leaves with arbitrary string levels (e.g. "standard") → keep the
      //     original level when available, suffix on collision
      let level: string;
      if (deduped.kind === "chain") {
        maxTopInt++;
        level = String(maxTopInt);
      } else {
        // Original level for the sibling's leaf — try to preserve it.
        // Since this came from sibling.reqs, look up the sibling's row that
        // produced this leaf to retrieve its level. We don't carry it through
        // ReqNode by default, so fall back to picking the next available int
        // when we can't (this only matters for the rarely-used arbitrary
        // string levels; for integer levels we'd just renumber anyway).
        const sibStandalones = sibCust.requirements.filter((r) => {
          if (r.chainingOperator || !r.target) return false;
          // Top-level rows only (no parent in sibling's set)
          const p = parentLevelOf(r.level);
          if (p !== null) {
            const has = sibCust.requirements.some((rr) => rr.level === p);
            if (has) return false;
          }
          return r.target === deduped.target
            && r.operator === deduped.operator
            && r.value === deduped.value
            && r.valueType === deduped.valueType;
        });
        const originalLevel = sibStandalones[0]?.level;
        if (originalLevel) {
          level = originalLevel;
          let suffix = 2;
          while (usedLevels.has(level)) level = `${originalLevel}-${suffix++}`;
        } else {
          maxTopInt++;
          level = String(maxTopInt);
        }
      }

      const serialized = serializeReqNode(deduped, level, targetEntityId, entityType);
      for (const row of serialized) {
        usedLevels.add(row.level);
        newReqs.push(row);
      }
      if (deduped.kind === "leaf") {
        targetStandaloneKeys.add(`${deduped.target}|${deduped.operator}|${deduped.value}`);
      }
    }
  }

  if (newReqs.length > 0) {
    await Requirements.createMany(tx, newReqs);
  }

  // 2. Merge sibling modifiers (deduplicate by target+value+operator+valueType)
  if (sourceType) {
    const targetModifiers = await Modifiers.findManyBySource(tx, { sourceIds: [targetEntityId], sourceType });
    const existingModKeys = new Set(
      targetModifiers.map((m) => `${m.target}|${m.value}|${m.operator}|${m.valueType}`),
    );

    for (const [, sibCust] of siblingCusts) {
      const uniqueModifiers = sibCust.modifiers.filter((m) => {
        const key = `${m.target}|${m.value}|${m.operator}|${m.valueType}`;
        if (existingModKeys.has(key)) return false;
        existingModKeys.add(key);
        return true;
      });

      if (uniqueModifiers.length > 0) {
        const newModifiers = await Modifiers.createMany(
          tx,
          uniqueModifiers.map((m) => ({
            ...m,
            id: undefined,
            sourceId: targetEntityId,
          })),
        );

        // Copy modifier requirements from sibling → new modifier
        for (let i = 0; i < uniqueModifiers.length; i++) {
          const modReqs = sibCust.modifierRequirements.filter((r) => r.entityId === uniqueModifiers[i].id);
          if (modReqs.length > 0) {
            await Requirements.createMany(
              tx,
              modReqs.map((r) => ({
                ...r,
                id: undefined,
                entityId: newModifiers[i].id,
              })),
            );
          }
        }
      }
    }
  }

  // 3. Merge sibling properties (deduplicate by type+value)
  const targetProperties = await Properties.findManyByEntity(tx, { entityIds: [targetEntityId], entityType });
  const existingPropKeys = new Set(
    targetProperties.map((p) => `${p.type}|${p.value}`),
  );

  const newProperties: Array<{ entityId: string; entityType: string; type: string; value: string; description: string | null }> = [];
  for (const [, sibCust] of siblingCusts) {
    for (const prop of sibCust.properties) {
      const key = `${prop.type}|${prop.value}`;
      if (existingPropKeys.has(key)) continue;
      existingPropKeys.add(key);
      newProperties.push({
        entityId: targetEntityId,
        entityType,
        type: prop.type,
        value: prop.value,
        description: prop.description,
      });
    }
  }

  if (newProperties.length > 0) {
    await Properties.createMany(tx, newProperties);
  }

  // 4. Merge sibling aptitude links — sibling reads bypass the proxy (loser
  // ids would otherwise be canonicalized to the winner). Existing reads on
  // targetEntityId go through the repo since the new id isn't in idResolveMap.
  if (entityType === "feats") {
    const existingAptitudes = await FeatsAptitudes.findMany(tx, { featId: targetEntityId });
    const existingAptIds = new Set(existingAptitudes.map((a) => a.aptitudeId));
    const newAptitudeLinks: Array<{ featId: string; aptitudeId: string }> = [];
    for (const siblingId of siblingIds) {
      const sibAptitudes = await tx.query.featsAptitudesInRules.findMany({
        where: (fa, { and: a, eq: e, isNull: n }) => a(e(fa.featId, siblingId), n(fa.deletedAt)),
      });
      for (const sa of sibAptitudes) {
        if (!existingAptIds.has(sa.aptitudeId)) {
          existingAptIds.add(sa.aptitudeId);
          newAptitudeLinks.push({ featId: targetEntityId, aptitudeId: sa.aptitudeId });
        }
      }
    }

    if (newAptitudeLinks.length > 0) {
      await FeatsAptitudes.createMany(tx, newAptitudeLinks);
    }
  } else if (entityType === "powers") {
    const existingAptitudes = await PowersAptitudes.findMany(tx, { powerId: targetEntityId });
    const existingAptIds = new Set(existingAptitudes.map((a) => a.aptitudeId));

    const newAptitudeLinks: Array<{ powerId: string; aptitudeId: string; level: number | null }> = [];
    for (const siblingId of siblingIds) {
      const sibAptitudes = await tx.query.powersAptitudesInRules.findMany({
        where: (pa, { and: a, eq: e, isNull: n }) => a(e(pa.powerId, siblingId), n(pa.deletedAt)),
      });
      for (const sa of sibAptitudes) {
        if (!existingAptIds.has(sa.aptitudeId)) {
          existingAptIds.add(sa.aptitudeId);
          newAptitudeLinks.push({ powerId: targetEntityId, aptitudeId: sa.aptitudeId, level: sa.level });
        }
      }
    }

    if (newAptitudeLinks.length > 0) {
      await PowersAptitudes.createMany(tx, newAptitudeLinks);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Cascade helpers for modifier deletion
// ──────────────────────────────────────────────────────────────

async function deleteModifiersWithCascade(
  tx: Db,
  where: { ids: string[] } | { sourceIds: string[]; sourceType: string },
) {
  const deleted = await Modifiers.deleteMany(tx, where);
  if (deleted.length > 0) {
    const modifierIds = deleted.map((m) => m.id);
    const deletedRequirements = await Requirements.deleteMany(tx, { entityIds: modifierIds, entityType: "modifiers" });

    await Activities.deleteByTargets(tx, { targetIds: modifierIds, targetTable: getTableName(modifiersInCustomization) });
    if (deletedRequirements.length > 0) {
      await Activities.deleteByTargets(tx, { targetIds: deletedRequirements.map((r) => r.id), targetTable: getTableName(requirementsInCustomization) });
    }
  }
  return deleted;
}

async function deletePropertiesWithCascade(
  tx: Db,
  where: { ids: string[] } | { entityIds: string[]; entityType: string },
) {
  const deleted = await Properties.deleteMany(tx, where);
  if (deleted.length > 0) {
    await Activities.deleteByTargets(tx, { targetIds: deleted.map((p) => p.id), targetTable: getTableName(propertiesInCustomization) });
  }
  return deleted;
}

async function deleteRequirementsWithCascade(
  tx: Db,
  where: { ids: string[] } | { entityIds: string[]; entityType: string },
) {
  const deleted = await Requirements.deleteMany(tx, where);
  if (deleted.length > 0) {
    await Activities.deleteByTargets(tx, { targetIds: deleted.map((r) => r.id), targetTable: getTableName(requirementsInCustomization) });
  }
  return deleted;
}

/**
 * Returns true if any character on a ruleset that depends on `rulesetId` has
 * a pick that references this entity. The character-side `existsBy*` methods
 * join on `rulesets` and match three cases in one query: the same ruleset,
 * any descendant fork (`ancestor_ruleset_ids @> [rulesetId]`), or any host
 * that subscribes to it as an extension (`extension_ruleset_ids @> [rulesetId]`).
 *
 * Used as an inUse guard before any code path that would hard-delete an entity
 * — entity-delete services and revertOverride.
 * Saves / mechanics / abilities don't have a character-side pick path and
 * always return false. Accepts "klass_levels" alongside the EntityType union
 * so class-level removal paths can use the same helper.
 */
type CharacterPickTarget = EntityType | "klass_levels";

async function entityHasCharacterPicks(
  tx: Db,
  entityType: CharacterPickTarget,
  entityId: string,
  rulesetId: string,
): Promise<boolean> {
  switch (entityType) {
    case "feats":     return CharacterLevelFeats.existsByFeatId(tx, { featId: entityId, rulesetId });
    case "powers":    return CharacterLevelPowers.existsByPowerId(tx, { powerId: entityId, rulesetId });
    case "skills":    return CharacterLevelSkills.existsBySkillId(tx, { skillId: entityId, rulesetId });
    case "races":     return Characters.existsByRaceId(tx, { raceId: entityId, rulesetId });
    case "items":     return CharacterInventory.existsByItemId(tx, { itemId: entityId, rulesetId });
    case "languages": return CharacterLanguages.existsByLanguageId(tx, { languageId: entityId, rulesetId });
    case "klasses":   return CharacterLevels.existsByKlassId(tx, { klassId: entityId, rulesetId });
    case "klass_levels": return CharacterLevels.existsByKlassLevelId(tx, { klassLevelId: entityId, rulesetId });
    case "aptitudes": {
      const [byFeat, byPower] = await Promise.all([
        CharacterLevelFeats.existsByAptitudeId(tx, { aptitudeId: entityId, rulesetId }),
        CharacterLevelPowers.existsByAptitudeId(tx, { aptitudeId: entityId, rulesetId }),
      ]);
      return byFeat || byPower;
    }
    case "saves":
    case "mechanics":
    case "abilities":
      return false;
  }
}

/**
 * Pre-create check for entity name uniqueness across the source chain. Throws
 * a ConflictError if the name is already taken in the fork or in an ancestor
 * (without a snapshot allowing the override). Returns the conflicting ancestor
 * entity ID when an inherited entity with the same name is hidden by a
 * tombstone snapshot — the caller should pass this to `repointTombstoneSnapshot`
 * after `Repo.create` so the snapshot follows the new entity.
 */
async function assertEntityNameAvailable(
  tx: Db,
  rulesetId: string,
  sourceChain: string[],
  entityType: EntityType,
  name: string,
): Promise<{ tombstoneAncestorId: string | null }> {
  const repo = ENTITY_REPOS[entityType];
  const own = await repo.findOne(tx, { name, rulesetId } as never);
  if (own) throw new ConflictError("Name already exists in this ruleset");

  for (const ancestorId of sourceChain) {
    const conflict = await repo.findOne(tx, { name, rulesetId: ancestorId } as never);
    if (!conflict) continue;
    const snapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
      sourceEntityId: conflict.id,
      rulesetId,
    });
    if (!snapshot) throw new ConflictError("Name already exists in the source chain (an ancestor or subscribed extension)");
    return { tombstoneAncestorId: conflict.id };
  }
  return { tombstoneAncestorId: null };
}

/**
 * After creating a new locally-owned entity, check for a tombstone snapshot
 * left behind by a previous override-delete on the conflicting ancestor entity.
 * If found, repoint the snapshot's `forkedEntityId` to the new entity so the
 * inherited version stays hidden from the source-chain.
 */
async function repointTombstoneSnapshot(
  tx: Db,
  rulesetId: string,
  entityType: EntityType,
  ancestorEntityId: string,
  newEntityId: string,
): Promise<void> {
  const tombstone = await EntitySnapshots.findBySourceAndRuleset(tx, {
    sourceEntityId: ancestorEntityId,
    rulesetId,
  });
  if (!tombstone) return;
  await EntitySnapshots.deleteBySourceAndRuleset(tx, {
    sourceEntityId: ancestorEntityId,
    rulesetId,
  });
  await EntitySnapshots.create(tx, {
    rulesetId,
    entityType,
    sourceEntityId: ancestorEntityId,
    forkedEntityId: newEntityId,
    contentHash: tombstone.contentHash,
  });
}

// ──────────────────────────────────────────────────────────────
// Source chain
// ──────────────────────────────────────────────────────────────

/**
 * Build the combined source chain for COW lookups:
 * extensions first (their new entities are visible), then ancestors.
 */
function buildSourceChain(ruleset: { extensionRulesetIds: string[]; ancestorRulesetIds: string[] }): string[] {
  return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
}

// ──────────────────────────────────────────────────────────────
// COW-specific functions
// ──────────────────────────────────────────────────────────────

/**
 * Build override + sibling pairing data for a fork. Returns three maps:
 *
 *   - `map`           — true overrides (sourceEntityId → forkedEntityId)
 *                       from `entitySnapshotsInRules`. Used by compose's
 *                       skip-overridden filter.
 *   - `siblingMap`    — winner-id → loser-id[] for siblings that should be
 *                       merged at compose / cowEntity time.
 *   - `idResolveMap`  — superset of `map` plus sibling-loser aliases.
 *                       Read by every id-canonicalization layer (proxy,
 *                       resolveOverrides, cowResolvingMap).
 *
 * Three pairing passes run in order, each strictly weaker than the last so
 * earlier wins are preserved:
 *
 *   1. Snapshot-based pass — pairs entities with shared `sourceEntityId`
 *      across the ruleset chain (the ordinary COW model: extension wins,
 *      base aliases to extension's COW).
 *   2. Snapshot-extension siblings — when multiple extensions COW the
 *      same base entity, the non-winners become siblings of the winner.
 *   3. Name-based fallback for `NAME_FALLBACK_ENTITY_TYPES` — pairs same-
 *      name native rows across the chain when the snapshot pass didn't
 *      catch them (e.g. a spell reprinted in two D&D sourcebooks).
 *
 * `ancestorRulesetIds` is a misnomer at the call site: `getOrBuildCowData`
 * passes the full source chain (extensions + ancestors) for snapshot
 * lookup; `cowEntity` passes ancestors-only. Both are valid for the
 * snapshot pass; the name-fallback pass dedupes them with
 * `extensionRulesetIds` to recover a stable ordering.
 *
 * `extensionRulesetIds` flags which rulesets in the chain are subscribed
 * extensions vs. ancestors of the fork. Required for sibling detection;
 * if omitted, only true overrides are returned.
 */
async function buildOverrideMap(
  db: Db,
  rulesetId: string,
  ancestorRulesetIds: string[],
  extensionRulesetIds?: string[],
): Promise<{ map: OverrideMap; siblingMap: Map<string, string[]>; idResolveMap: IdResolveMap }> {
  const allRulesetIds = [rulesetId, ...ancestorRulesetIds];
  const allSnapshots = await EntitySnapshots.findByRulesetIds(db, { rulesetIds: allRulesetIds });

  // Group by rulesetId, process closest-first (allRulesetIds is already ordered closest-first)
  const byRuleset = new Map<string, typeof allSnapshots>();
  for (const snap of allSnapshots) {
    if (!byRuleset.has(snap.rulesetId)) {
      byRuleset.set(snap.rulesetId, []);
    }
    byRuleset.get(snap.rulesetId)!.push(snap);
  }

  const map = newOverrideMap();
  for (const rid of allRulesetIds) {
    const snaps = byRuleset.get(rid) ?? [];
    for (const snap of snaps) {
      if (!map.has(snap.sourceEntityId)) {
        map.set(snap.sourceEntityId, map.get(snap.forkedEntityId) ?? snap.forkedEntityId);
      }
    }
  }

  // idResolveMap starts as a copy of map (true overrides) and gets sibling-loser
  // entries appended below. Kept separate so compose's "skip overridden" check
  // (which reads `map`) doesn't sweep up sibling losers (whose customizations
  // need to merge into the winner, not be skipped).
  const idResolveMap = newIdResolveMap(map);

  // Build siblingMap: when multiple snapshots share a sourceEntityId, the
  // winner's forkedEntityId maps to the sibling-loser forkedEntityIds. The
  // winner can be either an extension's COW (sibling extensions lose) or the
  // child fork's own COW — in both cases extension shadows that aren't the
  // winner are recorded so compose hides/remaps them and their customizations
  // dedup-merge into the winner's bucket.
  const extensionSet = new Set(extensionRulesetIds ?? []);
  const siblingMap = new Map<string, string[]>();

  if (extensionSet.size > 0) {
    const bySource = new Map<string, typeof allSnapshots>();
    for (const snap of allSnapshots) {
      const group = bySource.get(snap.sourceEntityId) ?? [];
      group.push(snap);
      bySource.set(snap.sourceEntityId, group);
    }

    for (const [sourceId, snaps] of bySource) {
      if (snaps.length <= 1) continue;
      const winnerId = map.get(sourceId);
      if (!winnerId) continue;
      // Sibling losers are extension shadows that aren't the winner. Works in
      // both the direct case (winner is one of these snaps) and the chained
      // case (winner reached via a closer snapshot whose source links into
      // this group). Append so we don't clobber prior entries for the same
      // winner (aptitude name-grouping below also writes here).
      const siblingIds = snaps
        .filter((s) => s.forkedEntityId !== winnerId && extensionSet.has(s.rulesetId))
        .map((s) => s.forkedEntityId);
      if (siblingIds.length === 0) continue;
      const existing = siblingMap.get(winnerId) ?? [];
      siblingMap.set(winnerId, [...existing, ...siblingIds]);
      // Sibling losers are aliased to the winner in idResolveMap so stale
      // references (a stored pick whose feat id is now a sibling loser)
      // resolve at the proxy / cowResolvingMap layer. They are intentionally
      // NOT added to `map` — compose iterates their customizations through
      // the sibling-merge path.
      for (const siblingId of siblingIds) {
        if (!idResolveMap.has(siblingId)) idResolveMap.set(siblingId, winnerId);
      }
    }
  }

  // Name-based sibling fallback for same-name reprints. When two rulesets in
  // the source chain natively define entities with the same name without
  // sharing a sourceEntityId (e.g. a spell reprinted in two D&D sourcebooks,
  // or a user extension that re-introduces a spell from another extension to
  // attach it to a custom class list), pair them as siblings so compose merges
  // them and `cowEntity` bakes their data into a child fork's COW. Last-resort
  // only — rows already paired via entitySnapshotsInRules are excluded so the
  // snapshot-based pass always wins. Worst-case for an unwanted merge between
  // unrelated user extensions: the merged entity looks weird; the user can COW
  // it and edit. Recoverable, not data loss.
  //
  // The `ancestorRulesetIds` parameter is a misnomer — getOrBuildCowData passes
  // the full source chain (extensions + ancestors), while cowEntity passes
  // ancestors-only. Dedupe so this pass behaves the same from either call site.
  const dedupedChain = [...new Set([...(extensionRulesetIds ?? []), ...ancestorRulesetIds])];
  if (extensionSet.size > 0 && dedupedChain.length > 1) {
    const subqueries = NAME_FALLBACK_TABLES.map(({ entityType, table }) =>
      db
        .select({
          entityType: sql<string>`${entityType}::text`.as("entity_type"),
          id: table.id,
          name: table.name,
          rulesetId: table.rulesetId,
        })
        .from(table)
        .leftJoin(entitySnapshotsInRules, and(
          eq(entitySnapshotsInRules.forkedEntityId, table.id),
          eq(entitySnapshotsInRules.rulesetId, table.rulesetId),
          eq(entitySnapshotsInRules.entityType, entityType),
        ))
        .where(and(
          inArray(table.rulesetId, dedupedChain),
          isNull(entitySnapshotsInRules.id),
          isNull(table.deletedAt),
          isNull(table.campaignId),
        )),
    );

    const [first, second, ...rest] = subqueries;
    const rows = await unionAll(first, second, ...rest);

    const chainIndex = new Map(dedupedChain.map((id, i) => [id, i]));

    const byTypeName = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.entityType}|${row.name}`;
      const group = byTypeName.get(key);
      if (group) group.push(row);
      else byTypeName.set(key, [row]);
    }

    // Closest-first: extensions come before ancestors in dedupedChain, so an
    // extension that natively reprints a base entity wins and base aliases to
    // it. Mirrors the snapshot pass's `map.set(sourceEntityId, forkedEntityId)`
    // direction — extension overrides base, full stop.
    for (const [, group] of byTypeName) {
      if (group.length <= 1) continue;
      const sorted = group.sort((a, b) =>
        (chainIndex.get(a.rulesetId) ?? 999) - (chainIndex.get(b.rulesetId) ?? 999),
      );
      const [winner, ...losers] = sorted;
      for (const loser of losers) {
        if (!idResolveMap.has(loser.id)) idResolveMap.set(loser.id, winner.id);
      }
      const existingSiblings = siblingMap.get(winner.id) ?? [];
      siblingMap.set(winner.id, [...existingSiblings, ...losers.map((l) => l.id)]);
    }
  }

  return { map, siblingMap, idResolveMap };
}

/**
 * Generic override resolver: scans all string fields in each row and replaces
 * any value that matches a key in the override map with the child's ID.
 * Handles saves.abilityId, skills.primaryAbilityId, powers.saveId, items.sourceItemId,
 * races.parentId, klasses.parentId — all generically without per-entity hardcoding.
 */
function resolveOverrides<T extends Record<string, unknown>>(
  rows: T[],
  overrideMap: IdResolveMap,
): T[] {
  if (overrideMap.size === 0) return rows;

  return rows.map((row) => {
    const resolved = { ...row };
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string" && overrideMap.has(value)) {
        (resolved as Record<string, unknown>)[key] = overrideMap.get(value);
      }
    }
    return resolved;
  });
}

/**
 * After resolveOverrides swaps FK IDs, data fields (name, description, etc.)
 * still come from the base entity row because the DB join matched the original ID.
 * This function refreshes specified fields from authoritative entity data.
 */
function refreshEntityData<T extends Record<string, unknown> & { id: string }>(
  rows: T[],
  referenceData: { id: string }[],
  keys: string[],
): T[] {
  if (referenceData.length === 0 || keys.length === 0) return rows;

  const dataMap = new Map<string, Record<string, unknown>>();
  for (const entity of referenceData) {
    dataMap.set(entity.id, entity as Record<string, unknown>);
  }

  return rows.map((row) => {
    const source = dataMap.get(row.id);
    if (!source) return row;
    const result = { ...row };
    for (const key of keys) {
      if (key in source) {
        (result as Record<string, unknown>)[key] = source[key];
      }
    }
    return result;
  });
}

const ENTITY_REPOS = {
  abilities: Abilities,
  saves: Saves,
  skills: Skills,
  feats: Feats,
  powers: Powers,
  items: Items,
  races: Races,
  languages: Languages,
  klasses: Klasses,
  aptitudes: Aptitudes,
  mechanics: Mechanics,
} as const;

/**
 * COW trigger: copies a parent entity to the child fork, including all
 * customizations, relationships, and creates the entity_snapshot record.
 *
 * @returns The newly created child entity (with its new ID)
 */
async function cowEntity(
  tx: Db,
  entityType: EntityType,
  entityId: string,
  childRulesetId: string,
  ancestorRulesetIds?: string[],
  extensionRulesetIds?: string[],
): Promise<EntityWithId> {
  const repo = ENTITY_REPOS[entityType];
  const sourceType = ENTITY_TYPE_TO_SOURCE_TYPE[entityType];

  // 0. Idempotency: if a COW copy already exists, return it.
  // If the snapshot is a tombstone (the COW row was hard-deleted by a
  // user-initiated delete on an overridden entity), drop the snapshot so
  // we can re-COW below with a fresh forkedEntityId.
  const existingSnapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
    sourceEntityId: entityId,
    rulesetId: childRulesetId,
  });
  if (existingSnapshot) {
    const existing = await repo.findOne(tx, { id: existingSnapshot.forkedEntityId } as never);
    if (existing) return existing as EntityWithId;
    await EntitySnapshots.deleteBySourceAndRuleset(tx, {
      sourceEntityId: entityId,
      rulesetId: childRulesetId,
    });
  }

  // 1. Fetch the parent entity
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
  await copyEntityCustomizations(tx, entityId, newEntity.id, entityType, cust);

  // 4. Copy relationships (aptitudes, klass levels, etc.)
  // idResolveMap (true overrides + sibling-loser aliases) is what we want for
  // FK remapping — a child copy's references should always point at the
  // canonical winner, never at a stale loser.
  const { siblingMap, idResolveMap } = await buildOverrideMap(tx, childRulesetId, ancestorRulesetIds ?? [], extensionRulesetIds);
  const idMap: Record<string, string> = {};
  for (const [sourceId, forkedId] of idResolveMap) {
    idMap[sourceId] = forkedId;
  }
  await copyEntityRelationships(tx, entityType, entityId, newEntity.id, idMap);

  // 4b. Merge sibling data when multiple extensions COW the same base entity
  const siblingIds = siblingMap.get(entityId);
  if (siblingIds && siblingIds.length > 0) {
    await mergeSiblingData(tx, newEntity.id, entityType, sourceType, siblingIds);
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
 * COW helper for customization mutations. Given an entityType and entityId,
 * checks if the entity belongs to the parent ruleset and COWs it if needed.
 * Returns the resolved entityId (original if owned, COW'd copy if inherited).
 *
 * For klass_levels: COWs the entire parent klass, then maps the old level ID
 * to the new one via the override map.
 */
async function cowEntityForCustomization(
  tx: Db,
  rulesetId: string,
  entityType: string,
  entityId: string,
): Promise<string> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) return entityId;
  const sourceChain = buildSourceChain(ruleset);
  if (sourceChain.length === 0) return entityId; // Not a fork

  if (entityType === "klass_levels") {
    // Find which klass owns this level
    const level = await KlassLevels.findOne(tx, { id: entityId });
    if (!level) return entityId;

    const klass = await Klasses.findOne(tx, { id: level.klassId } as never);
    if (!klass) return entityId;

    if (klass.rulesetId === rulesetId) return entityId; // Already owned
    if (!sourceChain.includes(klass.rulesetId)) return entityId; // Not from source chain

    // COW the klass (copies all levels)
    const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);
    // Find the new level by matching level number (levels aren't individually snapshotted)
    const newLevels = await KlassLevels.findManyByKlass(tx, { klassId: cowResult.id as string });
    const newLevel = newLevels.find((l) => l.level === level.level);
    return newLevel?.id ?? entityId;
  }

  if (entityType === "modifiers") {
    // Trace the modifier to its owning entity and COW that entity
    const modifier = await Modifiers.findOne(tx, { id: entityId });
    if (!modifier) return entityId;

    const sourceType = modifier.sourceType;

    if (sourceType === "klass_levels") {
      // Find which klass owns this level
      const level = await KlassLevels.findOne(tx, { id: modifier.sourceId });
      if (!level) return entityId;

      const klass = await Klasses.findOne(tx, { id: level.klassId } as never);
      if (!klass) return entityId;

      if (klass.rulesetId === rulesetId) return entityId; // Already owned
      if (!sourceChain.includes(klass.rulesetId)) return entityId;

      // COW the klass (copies all levels and their modifiers)
      const cowResult = await cowEntity(tx, "klasses", klass.id, rulesetId, sourceChain, ruleset.extensionRulesetIds);

      // Find the new level by matching level number on the COW'd klass (levels aren't individually snapshotted)
      const newLevels = await KlassLevels.findManyByKlass(tx, { klassId: cowResult.id as string });
      const newLevel = newLevels.find((l) => l.level === level.level);
      if (!newLevel) return entityId;

      const newModifiers = await Modifiers.findManyBySource(tx, { sourceIds: [newLevel.id], sourceType: "klass_levels" });
      const match = newModifiers.find((m) =>
        m.target === modifier.target &&
        m.value === modifier.value &&
        m.operator === modifier.operator &&
        m.valueType === modifier.valueType,
      );
      return match?.id ?? entityId;
    }

    // Standard entity types (feats, powers, items, races, klasses)
    const modifierEntityTypeMap: Record<string, EntityType> = {
      feats: "feats",
      powers: "powers",
      items: "items",
      races: "races",
      klasses: "klasses",
    };

    const cowType = modifierEntityTypeMap[sourceType];
    if (!cowType) return entityId;

    const modifierRepo = ENTITY_REPOS[cowType];
    const ownerEntity = await modifierRepo.findOne(tx, { id: modifier.sourceId } as never);
    if (!ownerEntity) return entityId;

    const ownerRecord = ownerEntity as Record<string, unknown>;
    if (ownerRecord.rulesetId === rulesetId) return entityId; // Already owned
    if (!sourceChain.includes(ownerRecord.rulesetId as string)) return entityId;

    const cowResult = await cowEntity(tx, cowType, modifier.sourceId, rulesetId, sourceChain, ruleset.extensionRulesetIds);

    // Find the new modifier by matching properties on the COW'd entity
    const newModifiers = await Modifiers.findManyBySource(tx, { sourceIds: [cowResult.id], sourceType });
    const match = newModifiers.find((m) =>
      m.target === modifier.target &&
      m.value === modifier.value &&
      m.operator === modifier.operator &&
      m.valueType === modifier.valueType,
    );
    return match?.id ?? entityId;
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
  if (!cowType) return entityId;

  const repo = ENTITY_REPOS[cowType];
  const entity = await repo.findOne(tx, { id: entityId } as never);
  if (!entity) return entityId;

  const entityRecord = entity as Record<string, unknown>;
  if (entityRecord.rulesetId === rulesetId) return entityId; // Already owned
  if (!sourceChain.includes(entityRecord.rulesetId as string)) return entityId; // Not from source chain

  const cowResult = await cowEntity(tx, cowType, entityId, rulesetId, sourceChain, ruleset.extensionRulesetIds);
  return cowResult.id;
}

// ──────────────────────────────────────────────────────────────
// Cached COW data
// ──────────────────────────────────────────────────────────────

/**
 * Branded `Map<string, string>` carrying compose-skip semantic. Keys are
 * source-entity IDs of true COW overrides — read by `compose()` to drop
 * the source row when a child has overridden it. The brand stops it being
 * passed where an `IdResolveMap` is expected (or vice versa). Construct via
 * `newOverrideMap()` only.
 */
export type OverrideMap = Map<string, string> & { readonly __brand: "OverrideMap" };

/**
 * Branded `Map<string, string>` carrying id-canonicalize semantic. Maps any
 * "stale" id (true override source, aptitude name-grouping loser, snapshot
 * sibling loser) to its canonical winner. Read by the repo Proxy
 * (`canonicalizeArgs`, `resolveRowOverrides`), `BaseRepository.idMatches`,
 * `cowResolvingMap`, and `resolveOverrides`. Construct via
 * `newIdResolveMap(seed?)` only.
 */
export type IdResolveMap = Map<string, string> & { readonly __brand: "IdResolveMap" };

export function newOverrideMap(entries?: Iterable<readonly [string, string]>): OverrideMap {
  return new Map<string, string>(entries) as OverrideMap;
}

export function newIdResolveMap(seed?: OverrideMap | IdResolveMap): IdResolveMap {
  return new Map<string, string>(seed) as IdResolveMap;
}

/**
 * Construction-time invariant: `idResolveMap` MUST be a superset of
 * `overrideMap`. The proxy / cowResolvingMap layer needs every stale id
 * compose can skip to also resolve to a winner. Throws if not — bugs in
 * `buildOverrideMap` / `getOrBuildCowData` should fail fast, not silently
 * corrupt downstream.
 */
function assertCowMapsConsistent(overrideMap: OverrideMap, idResolveMap: IdResolveMap): void {
  if (idResolveMap.size < overrideMap.size) {
    throw new Error(
      `CowData invariant violated: idResolveMap.size (${idResolveMap.size}) < overrideMap.size (${overrideMap.size})`,
    );
  }
  for (const key of overrideMap.keys()) {
    if (!idResolveMap.has(key)) {
      throw new Error(`CowData invariant violated: overrideMap key ${key} missing from idResolveMap`);
    }
  }
}

export interface CowData {
  sourceChain: string[];
  /** Compose-skip semantic — see {@link OverrideMap}. */
  overrideMap: OverrideMap;
  /** ID-canonicalize semantic — see {@link IdResolveMap}. Superset of `overrideMap`. */
  idResolveMap: IdResolveMap;
  /** Maps a winning COW'd entity ID → sibling-loser COW'd entity IDs */
  siblingMap: Map<string, string[]>;
  /** Flattened set of every sibling ID, precomputed from siblingMap */
  siblingIds: Set<string>;
}

const cowDataCache = new MemoryCache<CowData>();

/**
 * Get or build cached COW data for a ruleset: sourceChain + overrideMap + klass level mappings.
 * Cache key is the rulesetId; invalidated on mutations.
 *
 * Always reads via the imported `db` (committed state) — never accepts a tx
 * handle. Letting an in-progress mutation's uncommitted writes populate this
 * shared cache would leak phantom data to every other concurrent reader.
 */
async function getOrBuildCowData(
  ruleset: { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] },
): Promise<CowData> {
  const cached = cowDataCache.get(ruleset.id);
  if (cached) return cached;

  const sourceChain = buildSourceChain(ruleset);

  let overrideMap: OverrideMap;
  let siblingMap: Map<string, string[]>;
  let idResolveMap: IdResolveMap;

  if (sourceChain.length > 0) {
    const result = await buildOverrideMap(db, ruleset.id, sourceChain, ruleset.extensionRulesetIds);
    overrideMap = result.map;
    siblingMap = result.siblingMap;
    idResolveMap = result.idResolveMap;

    // Enrich overrideMap with klass-level id pairs for COW'd klasses — levels
    // aren't individually snapshotted, so we back-fill pairs here by matching
    // on level number. Also mirror into idResolveMap so id-based lookups
    // (e.g. resolving a stored klass-level id) resolve to the post-COW id.
    if (overrideMap.size > 0) {
      const klassSnaps = await EntitySnapshots.findByTypeAndRuleset(db, {
        rulesetId: ruleset.id,
        entityType: "klasses",
      });
      for (const snap of klassSnaps) {
        const [parentLevels, childLevels] = await Promise.all([
          KlassLevels.findManyByKlass(db, { klassId: snap.sourceEntityId }),
          KlassLevels.findManyByKlass(db, { klassId: snap.forkedEntityId }),
        ]);
        for (const parentLevel of parentLevels) {
          const childLevel = childLevels.find((l) => l.level === parentLevel.level);
          if (childLevel) {
            overrideMap.set(parentLevel.id, childLevel.id);
            idResolveMap.set(parentLevel.id, childLevel.id);
          }
        }
      }
    }
  } else {
    overrideMap = newOverrideMap();
    siblingMap = new Map<string, string[]>();
    idResolveMap = newIdResolveMap();
  }

  // Deduplicate aptitudes with the same name across the source chain.
  // Each extension independently creates aptitudes it needs (self-contained),
  // so duplicates arise when multiple extensions reference the same spell list,
  // or when an extension recreates a base aptitude (e.g., "General").
  // Pick one winner per name; losers go into siblingMap (compose filters them
  // via siblingIds) + idResolveMap (so FK refs to a loser remap to the winner).
  // Intentionally NOT in overrideMap — compose-skip is for true overrides only.
  // Closest-first chain order: extensions come before ancestors in sourceChain,
  // so any extension that re-creates a base-named aptitude wins and base
  // aliases to it. Same direction as the snapshot pass — extension overrides
  // base, no exception.
  if (ruleset.extensionRulesetIds.length > 0) {
    const allAptitudes = await Aptitudes.findMany(db, { rulesetIds: sourceChain });
    const chainIndex = new Map(sourceChain.map((id, i) => [id, i]));
    const byName = new Map<string, typeof allAptitudes>();
    for (const apt of allAptitudes) {
      const group = byName.get(apt.name);
      if (group) group.push(apt);
      else byName.set(apt.name, [apt]);
    }
    for (const [, group] of byName) {
      if (group.length <= 1) continue;
      const sorted = group.sort((a, b) =>
        (chainIndex.get(a.rulesetId) ?? 999) - (chainIndex.get(b.rulesetId) ?? 999),
      );
      const [winner, ...losers] = sorted;
      for (const loser of losers) {
        if (!idResolveMap.has(loser.id)) idResolveMap.set(loser.id, winner.id);
      }
      const existingSiblings = siblingMap.get(winner.id) ?? [];
      siblingMap.set(winner.id, [...existingSiblings, ...losers.map((l) => l.id)]);
    }
  }

  assertCowMapsConsistent(overrideMap, idResolveMap);

  const cowData: CowData = {
    sourceChain,
    overrideMap,
    idResolveMap,
    siblingMap,
    siblingIds: new Set(Array.from(siblingMap.values()).flat()),
  };
  cowDataCache.set(ruleset.id, cowData);
  return cowData;
}

function invalidateCowData(rulesetId: string): void {
  cowDataCache.invalidate(rulesetId);
}

function invalidateAllCowData(): void {
  cowDataCache.invalidateAll();
}

/**
 * Scope helper: loads the ruleset, builds cowData, and runs `fn` inside a
 * cowContext so every repository read inside auto-resolves pre-COW ids to
 * post-COW (output Proxy) AND every entity-id WHERE-clause input is
 * auto-canonicalized (input Proxy). Services call this once at the top of
 * a character-scoped operation; downstream code stops caring about COW.
 *
 * Throws `NotFoundError("Ruleset not found")` if `rulesetId` doesn't exist,
 * so the callback always receives non-null `{ ruleset, cowData }` and
 * doesn't have to branch or add defensive sourceChain fallbacks.
 */
async function withRulesetScope<T>(
  tx: Db,
  rulesetId: string,
  fn: (ctx: {
    ruleset: NonNullable<Awaited<ReturnType<typeof Rulesets.findOne>>>;
    rulesetData: CachedRulesetData;
  }) => Promise<T>,
): Promise<T> {
  const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  const cowData = await getOrBuildCowData(ruleset);
  const rulesetData = await getOrFetchRulesetData(rulesetId, cowData);
  return await withCowContext(cowData, () => fn({ ruleset, rulesetData }));
}

/**
 * Multi-ruleset variant: preload `rulesetData` for every unique id and hand
 * the map to `fn`. Used for list operations that enrich rows from many
 * rulesets at once (getMyCharacters, getCampaignCharacters) where a single
 * `cowContext` would have to pick one ruleset, excluding the others.
 *
 * No `cowContext` is activated — the composed `rulesetData.*` Maps already
 * wrap stored ids through their own per-ruleset overrideMap, so lookups
 * work without ambient context. Services that need character-scoped repo
 * auto-resolution for a specific character should use `withRulesetScope`
 * inside their per-character enrichment path.
 *
 * Missing rulesets are silently skipped (rare: a character row referencing
 * a deleted ruleset); the map just won't have that key.
 */
async function withRulesetScopes<T>(
  tx: Db,
  rulesetIds: Iterable<string>,
  fn: (rulesetDataByRulesetId: Map<string, CachedRulesetData>) => Promise<T>,
): Promise<T> {
  const unique = [...new Set(rulesetIds)];
  const map = new Map<string, CachedRulesetData>();
  for (const rulesetId of unique) {
    const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
    if (!ruleset) continue;
    const cowData = await getOrBuildCowData(ruleset);
    const rulesetData = await getOrFetchRulesetData(rulesetId, cowData);
    map.set(rulesetId, rulesetData);
  }
  return fn(map);
}

/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     `withRulesetScope` / `withRulesetScopes` for single / multi-ruleset
 *     reads. `cowEntity` / `cowEntityForCustomization` and the
 *     `delete*WithCascade` helpers for admin CRUD mutations.
 *
 *   Forking primitives (only `RulesetsService` fork/publish):
 *     `buildSourceChain`, `buildOverrideMap`, `copyEntity*`, `fetch*`,
 *     `ENTITY_TYPE_TO_SOURCE_TYPE`. These live here because they share
 *     utilities with the runtime COW path; they aren't "internal" in any
 *     enforceable sense — they're just owned by the fork flow.
 *
 *   Framework internals (used by the cache compose step + the ruleset
 *     implementation layer — `DetailedCharacterDataLoader`, `TargetPaths`,
 *     `LevelUpProjector`): `getOrBuildCowData`, `invalidateCowData`,
 *     `invalidateAllCowData`, `refreshEntityData`, `resolveOverrides`.
 * ──────────────────────────────────────────────────────────────────────────
 */
export {
  withRulesetScope,
  withRulesetScopes,
  cowEntity,
  cowEntityForCustomization,
  assertEntityNameAvailable,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
  repointTombstoneSnapshot,

  // Forking primitives — RulesetsService only.
  buildOverrideMap,
  buildSourceChain,
  ENTITY_TYPE_TO_SOURCE_TYPE,
  fetchEntityCustomizations,
  copyEntityCustomizations,
  copyEntityCustomizationsToMany,

  // Framework internals — cache compose step + ruleset implementations.
  getOrBuildCowData,
  invalidateAllCowData,
  invalidateCowData,
  refreshEntityData,
  resolveOverrides,

  // Requirement forest helpers — shared between cow.ts (write-time merge) and
  // rulesetCache.ts (read-time compose).
  buildReqForest,
  serializeReqNode,
  dedupAgainstExisting,
  collectAllLeafKeys,
  collectTopLevelStandaloneKeys,
};

export type { EntityWithId, ReqNode };
// OverrideMap / IdResolveMap / newOverrideMap / newIdResolveMap are exported
// inline at their declarations.
