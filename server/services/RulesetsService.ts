import {
  abilitiesInRules,
  aptitudesInRules,
  entitySnapshotsInRules,
  featsInRules,
  itemsInRules,
  klassesInRules,
  languagesInRules,
  mechanicsInRules,
  powersInRules,
  racesInRules,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { BadRequestError, ConflictError, ForbiddenError, InternalError, NotFoundError, STALE_ENTITY_MESSAGE, UnprocessableEntityError } from "@/server/errors/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
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
  Contributors,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  Languages,
  Mechanics,
  Powers,
  PowersAptitudes,
  Properties,
  Races,
  RulesetExtensions,
  Rulesets,
  Saves,
  Skills,
  StarredRulesets,
} from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { assertCanBeExtension, getRulesetPolicy, isStarrable } from "@/server/services/rulesets/helpers.ts";
import {
  buildSourceChain,
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  ENTITY_TYPE_TO_SOURCE_TYPE,
  entityHasCharacterPicks,
  NAME_FALLBACK_ENTITY_TYPES,
} from "@/server/services/rulesets/cow.ts";
import { type EntityType } from "@/server/services/rulesets/hashing.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

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

const ENTITY_TABLES = {
  abilities: abilitiesInRules,
  saves: savesInRules,
  skills: skillsInRules,
  feats: featsInRules,
  powers: powersInRules,
  items: itemsInRules,
  races: racesInRules,
  languages: languagesInRules,
  klasses: klassesInRules,
  aptitudes: aptitudesInRules,
  mechanics: mechanicsInRules,
} as const;

// Returns true iff any character on `hostRulesetId` has picked an entity that
// belongs to `extensionId` — either a direct extension entity or a host-owned
// COW shadow whose source entity belongs to the extension. Unsubscribe deletes
// those shadows, so a shadow pick would be silently orphaned without this
// check.
async function isExtensionInUseByHost(
  tx: Db,
  hostRulesetId: string,
  extensionId: string,
): Promise<boolean> {
  // Group snapshots by entity type, then resolve each type's source entities
  // in one batched query (avoids N+1 over snapshot count). Build a per-type
  // list of host-owned shadow IDs whose source entity belongs to the extension.
  const snapshots = await EntitySnapshots.findByRulesetId(tx, { rulesetId: hostRulesetId });
  const sourceIdsByType: Partial<Record<EntityType, string[]>> = {};
  for (const snap of snapshots) {
    const type = snap.entityType as EntityType;
    if (!ENTITY_REPOS[type]) continue;
    (sourceIdsByType[type] ??= []).push(snap.sourceEntityId);
  }

  const shadowIdsByType: Partial<Record<EntityType, string[]>> = {};
  for (const [type, ids] of Object.entries(sourceIdsByType) as [EntityType, string[]][]) {
    const sources = await ENTITY_REPOS[type].findMany(tx, { ids } as never) as Array<{ id: string; rulesetId: string }>;
    const fromExt = new Set(sources.filter((s) => s.rulesetId === extensionId).map((s) => s.id));
    const forked = snapshots
      .filter((s) => s.entityType === type && fromExt.has(s.sourceEntityId))
      .map((s) => s.forkedEntityId);
    if (forked.length > 0) shadowIdsByType[type] = forked;
  }
  const shadow = (type: EntityType) => shadowIdsByType[type] ?? [];

  return (
    await CharacterLevelFeats.existsByFeatPickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowFeatIds: shadow("feats"),
    })
    || await CharacterLevelFeats.existsByAptitudePickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowAptitudeIds: shadow("aptitudes"),
    })
    || await CharacterLevelSkills.existsBySkillPickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowSkillIds: shadow("skills"),
    })
    || await CharacterLevelPowers.existsByPowerPickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowPowerIds: shadow("powers"),
    })
    || await CharacterLevelPowers.existsByAptitudePickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowAptitudeIds: shadow("aptitudes"),
    })
    || await CharacterLevels.existsByKlassPickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowKlassIds: shadow("klasses"),
    })
    || await Characters.existsByRaceFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowRaceIds: shadow("races"),
    })
    || await CharacterLanguages.existsByLanguagePickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowLanguageIds: shadow("languages"),
    })
    || await CharacterInventory.existsByItemPickFromExtension(tx, {
      hostRulesetId, extensionRulesetId: extensionId, shadowItemIds: shadow("items"),
    })
  );
}

// Hard-deletes an entity along with its junctions and customizations
// (and, for klasses, its klass_levels). Used by revertOverride and
// extension-uninstall flows.
async function deleteEntityWithCascade(tx: Db, entityType: EntityType, entityId: string) {
  const sourceType = ENTITY_TYPE_TO_SOURCE_TYPE[entityType];

  // 1. Delete join tables
  if (entityType === "feats") {
    await FeatsAptitudes.delete(tx, { featId: entityId });
    await KlassLevelFeats.deleteByFeatId(tx, { featId: entityId });
  } else if (entityType === "powers") {
    await PowersAptitudes.delete(tx, { powerId: entityId });
    await KlassLevelPowers.deleteByPowerId(tx, { powerId: entityId });
  } else if (entityType === "aptitudes") {
    await KlassLevelFeats.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await FeatsAptitudes.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await PowersAptitudes.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await KlassLevelPowers.deleteByAptitudeId(tx, { aptitudeId: entityId });
  } else if (entityType === "skills") {
    await KlassSkills.deleteBySkillId(tx, { skillId: entityId });
  } else if (entityType === "saves") {
    await KlassLevelSaves.deleteBySaveId(tx, { saveId: entityId });
  } else if (entityType === "klasses") {
    const levels = await KlassLevels.findManyByKlass(tx, { klassId: entityId });
    const levelIds = levels.map((l) => l.id);
    if (levelIds.length > 0) {
      await deleteModifiersWithCascade(tx, { sourceIds: levelIds, sourceType: "klass_levels" });
      await deletePropertiesWithCascade(tx, { entityIds: levelIds, entityType: "klass_levels" });
      await deleteRequirementsWithCascade(tx, { entityIds: levelIds, entityType: "klass_levels" });
      for (const levelId of levelIds) {
        await KlassLevelFeats.deleteByKlassLevelId(tx, { klassLevelId: levelId });
        await KlassLevelPowers.deleteByKlassLevelId(tx, { klassLevelId: levelId });
        await KlassLevelSaves.deleteByKlassLevelId(tx, { klassLevelId: levelId });
      }
      for (const level of levels) {
        await KlassLevels.delete(tx, { id: level.id });
      }
    }
    await KlassSkills.deleteByKlassId(tx, { klassId: entityId });
  }
  // items.source_item_id is RESTRICT — callers that may hit references (revertOverride)
  // must repoint copies before invoking this.

  // 2. Delete customizations
  if (sourceType) {
    await deleteModifiersWithCascade(tx, { sourceIds: [entityId], sourceType });
  }
  await deletePropertiesWithCascade(tx, { entityIds: [entityId], entityType });
  await deleteRequirementsWithCascade(tx, { entityIds: [entityId], entityType });

  // 3. Delete the entity itself
  await ENTITY_REPOS[entityType].delete(tx, { id: entityId } as never);
}

// Rejects a subscribe action that would surface two entities of the same name in
// the host's source chain. Compares locally-owned (non-shadow) rows in the host,
// already-subscribed extensions, and the new extensions; aptitudes are skipped
// because the sibling mechanism already dedups them by name at compose time.
async function assertExtensionsNameCompatible(
  tx: Db,
  hostId: string,
  newExtensionIds: string[],
  existingExtensionRulesetIds: string[],
): Promise<void> {
  if (newExtensionIds.length === 0) return;

  const rulesetIds = [hostId, ...newExtensionIds, ...existingExtensionRulesetIds];

  const typesToCheck = (Object.keys(ENTITY_TABLES) as EntityType[]).filter(
    (t) => t !== "aptitudes",
  );

  const subqueries = typesToCheck.map((entityType) => {
    const table = ENTITY_TABLES[entityType];
    return tx
      .select({
        entityType: sql<EntityType>`${entityType}::text`.as("entity_type"),
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
        inArray(table.rulesetId, rulesetIds),
        isNull(entitySnapshotsInRules.id),
        isNull(table.deletedAt),
        isNull(table.campaignId),
      ));
  });

  const [first, second, ...rest] = subqueries;
  const rows = await unionAll(first, second, ...rest);

  const ownersByType = new Map<EntityType, Map<string, Set<string>>>();
  for (const r of rows) {
    const type = r.entityType as EntityType;
    let byName = ownersByType.get(type);
    if (!byName) {
      byName = new Map<string, Set<string>>();
      ownersByType.set(type, byName);
    }
    let set = byName.get(r.name);
    if (!set) {
      set = new Set<string>();
      byName.set(r.name, set);
    }
    set.add(r.rulesetId);
  }

  // Feats and powers participate in the runtime name-fallback pairing in
  // cow.ts — extension-only collisions on those types get merged into one
  // entity at compose, so allow them. The host's own native rows can't be
  // sibling-paired (host isn't part of its own source chain), so a
  // host+extension collision would produce visible duplicates and must be
  // blocked even for paired types. All other entity types (races, classes,
  // abilities, etc.) have no name-fallback pairing — extension+extension
  // collisions there would surface as UI duplicates, so block them.
  const pairableTypes = new Set<EntityType>(NAME_FALLBACK_ENTITY_TYPES);
  for (const [entityType, byName] of ownersByType) {
    const isPairableType = pairableTypes.has(entityType);
    for (const [name, ownerIds] of byName) {
      if (ownerIds.size <= 1) continue;
      const involvesNew = newExtensionIds.some((id) => ownerIds.has(id));
      if (!involvesNew) continue;
      if (isPairableType) {
        const involvesHost = ownerIds.has(hostId);
        if (!involvesHost) continue;
        throw new ConflictError(
          `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset`,
        );
      }
      throw new ConflictError(
        `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset or another subscribed extension`,
      );
    }
  }
}

export const RulesetsMethods = {
  async getAllRulesets(session: Session, where: {
    scope?: "base" | "forked" | "community" | "createdByMe" | "createdByMePrivate" | "archived" | "published" | "starred" | "campaignAccessible" | "myDrafts" | "extensions" | "systems" | "contributedTo";
    search?: string;
    orderBy?: "createdAt" | "updatedAt";
    orderDir?: "asc" | "desc";
  }, pagination: { limit: number; page: number }) {
    const rulesets = await Rulesets.findMany(db, session, where, pagination);

    // Batch-check starred status + star counts
    const rulesetIds = rulesets.items.map((r) => r.id);
    const [starred, starCounts] = await Promise.all([
      StarredRulesets.findMany(db, { userId: session.userId }),
      StarredRulesets.countByRulesetIds(db, { rulesetIds }),
    ]);
    const starredSet = new Set(starred.map((s) => s.rulesetId));

    // Batch-fetch parent rulesets for forked rulesets
    const parentRulesetIds = [...new Set(
      rulesets.items.map((r) => r.rulesetId).filter((id): id is string => id !== null),
    )];
    const parentRulesets = parentRulesetIds.length > 0
      ? await Rulesets.findManyByIds(db, { ids: parentRulesetIds })
      : [];
    const parentNameMap = new Map(parentRulesets.map((r) => [r.id, r.name]));

    const items = rulesets.items.map((ruleset) => ({
      ...ruleset,
      rulesetName: ruleset.rulesetId ? parentNameMap.get(ruleset.rulesetId) : undefined,
      isStarred: starredSet.has(ruleset.id),
      starCount: starCounts.get(ruleset.id) ?? 0,
      isStarrable: isStarrable(ruleset),
    }));

    return {
      ...rulesets,
      items,
    };
  },

  async getRulesetById(session: Session, id: string) {
    const ruleset = await Rulesets.findOne(db, { id });
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    const [star, starCount, contributorRole, isUsedAsExtension] = await Promise.all([
      StarredRulesets.findOne(db, { userId: session.userId, rulesetId: id }),
      StarredRulesets.countByRulesetId(db, { rulesetId: id }),
      ruleset.userId && ruleset.userId !== session.userId
        ? Contributors.findActiveRole(db, { userId: session.userId, rulesetId: id })
        : null,
      Rulesets.hasSubscribers(db, id),
    ]);

    const parent = ruleset.rulesetId
      ? await Rulesets.findOne(db, { id: ruleset.rulesetId })
      : undefined;

    return {
      ...ruleset,
      rulesetName: parent?.name,
      isStarred: !!star,
      starCount,
      contributorRole,
      isStarrable: isStarrable(ruleset),
      isUsedAsExtension,
    };
  },

  async forkRuleset(session: Session, id: string, body: { name: string; description?: string; private: boolean }) {
    const result = await withTransaction(async (tx) => {
      // 1. Verify source ruleset exists and is published
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }
      new RulesetsPolicy(session, ruleset).canFork();

      // 2. Verify name uniqueness
      const existing = await Rulesets.findOne(tx, { name: body.name });
      if (existing) {
        throw new ConflictError("A ruleset with this name already exists");
      }

      // canFork blocks forks-of-forks, so the parent is always a base —
      // ancestorRulesetIds is always [baseId].
      const ancestorRulesetIds = [id];

      // 4. Create the new forked ruleset
      const newRuleset = (await Rulesets.create(tx, {
        name: body.name,
        description: body.description || ruleset.description,
        userId: session.userId,
        rulesetId: id,
        ancestorRulesetIds,
        extensionRulesetIds: ruleset.extensionRulesetIds,
        baseRules: ruleset.baseRules,
        private: body.private,
      }))[0];

      // Copy extension metadata rows
      if (ruleset.extensionRulesetIds.length > 0) {
        for (const extId of ruleset.extensionRulesetIds) {
          await RulesetExtensions.upsert(tx, { rulesetId: newRuleset.id, extensionId: extId });
        }
      }

      // 3. Copy ruleset-level properties as-is (parent entity IDs — resolveOverrides handles at read time)
      const sourceRulesetProperties = await Properties.findManyByEntity(tx, {
        entityIds: [id],
        entityType: "rulesets",
      });
      if (sourceRulesetProperties.length > 0) {
        await Properties.createMany(tx, sourceRulesetProperties.map((p) => ({
          ...p,
          id: undefined,
          entityId: newRuleset.id,
        })));
      }

      // 4. Seed template items if source ruleset didn't have any (pre-migration rulesets)
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const sourceTemplates = await Items.findTemplates(tx, { rulesetId: id });
      if (sourceTemplates.length === 0) {
        await rulesetModule.seedTemplateItems(tx, newRuleset.id);
      }

      // 5. Log the fork activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: newRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "forkRuleset",
        data: { sourceRulesetId: id },
      });

      return newRuleset;
    });

    invalidateRuleset(result.id);
    return result;
  },

  async archiveRuleset(session: Session, id: string) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await getRulesetPolicy(tx, session, ruleset)).canUpdate();

      // Archive only flips status='Archived'. Entities and overrides stay
      // live so any character or campaign still pointing here keeps
      // resolving its data; the ruleset just becomes read-only at the
      // editing surface.
      const rows = await Rulesets.archive(tx, { id });
      const archivedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: archivedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "archiveRuleset",
      });

      return archivedRuleset;
    });
  },

  async unarchiveRuleset(session: Session, id: string) {
    const result = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      new RulesetsPolicy(session, ruleset).canUnarchive();

      const rows = await Rulesets.unarchive(tx, { id });
      const unarchivedRuleset = rows[0];

      if (!unarchivedRuleset) {
        throw new InternalError("Failed to unarchive ruleset");
      }

      await Activities.create(tx, {
        userId: session.userId,
        targetId: unarchivedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "unarchiveRuleset",
      });

      return unarchivedRuleset;
    });
    invalidateRuleset(id);
    return result;
  },

  async publishRuleset(session: Session, id: string, body: { kind?: "ruleset" | "extension" } = {}) {
    const result = await withTransaction(async (tx) => {
      // First verify the ruleset exists
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      new RulesetsPolicy(session, ruleset).canPublish();

      const targetKind = body.kind ?? ruleset.kind;
      if (targetKind === "extension") {
        assertCanBeExtension(ruleset);
      }

      // Extensions don't need playable content (races/klasses/skills/feats);
      // they're add-ons layered onto rulesets that already have the basics.
      if (targetKind !== "extension") {
        const sourceChain = buildSourceChain(ruleset);
        const races = await Races.findManyByRulesetId(tx, { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" }, { limit: 1, page: 1 });
        const klasses = await Klasses.findManyByRulesetId(tx, { rulesetId: id, ancestorRulesetIds: sourceChain, kind: "pc" }, { limit: 1, page: 1 });
        const skills = await Skills.findManyByRulesetId(tx, { rulesetId: id, ancestorRulesetIds: sourceChain }, { limit: 1, page: 1 });
        const feats = await Feats.findManyByRulesetId(tx, { rulesetId: id, ancestorRulesetIds: sourceChain }, { limit: 1, page: 1 });

        const missing: string[] = [];
        if (races.items.length === 0) missing.push("race");
        if (klasses.items.length === 0) missing.push("class");
        if (skills.items.length === 0) missing.push("skill");
        if (feats.items.length === 0) missing.push("feat");

        if (missing.length > 0) {
          throw new UnprocessableEntityError(
            `Ruleset requires at least one of each: ${missing.join(", ")}`,
          );
        }
      }

      if (body.kind && body.kind !== ruleset.kind) {
        await Rulesets.update(tx, { kind: body.kind }, { id });
      }

      const rows = await Rulesets.publish(tx, { id });
      const publishedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: publishedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "publishRuleset",
      });

      return publishedRuleset;
    });

    invalidateRuleset(id);
    return result;
  },

  async starRuleset(session: Session, rulesetId: string) {
    return await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      if (!isStarrable(ruleset)) {
        throw new ForbiddenError("Only base rulesets and extensions can be starred");
      }

      await StarredRulesets.createOrRestore(tx, { userId: session.userId, rulesetId });
    });
  },

  async unstarRuleset(session: Session, rulesetId: string) {
    return await withTransaction(async (tx) => {
      await StarredRulesets.archive(tx, { userId: session.userId, rulesetId });
    });
  },

  async updateRuleset(
    session: Session,
    id: string,
    body: { name: string; description: string; private?: boolean; kind?: "ruleset" | "extension"; updatedAt?: string },
  ) {
    const result = await withTransaction(async (tx) => {
      // First verify the ruleset exists
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await getRulesetPolicy(tx, session, ruleset)).canUpdate();

      if (!ruleset.private && body.private) {
        throw new ForbiddenError("Cannot make a public ruleset private");
      }

      if (body.kind === "extension" && ruleset.kind !== "extension") {
        assertCanBeExtension(ruleset);
      }

      const { updatedAt, ...rulesetData } = body;
      const rows = await Rulesets.update(tx, rulesetData, { id, expectedUpdatedAt: updatedAt });
      if (updatedAt && rows.length === 0) {
        throw new ConflictError(STALE_ENTITY_MESSAGE);
      }
      const updatedRuleset = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: updatedRuleset.id,
        targetTable: getTableName(rulesetsInRules),
        type: "updateRuleset",
      });

      return updatedRuleset;
    });

    invalidateRuleset(id);
    return result;
  },

  async subscribeExtension(
    session: Session,
    id: string,
    extensionIds: string[],
  ) {
    const result = await withTransaction(async (tx) => {
      // 1. Validate ruleset
      const childRuleset = await Rulesets.findOne(tx, { id });
      if (!childRuleset) {
        throw new NotFoundError("Ruleset not found");
      }
      new RulesetsPolicy(session, childRuleset).canSubscribeExtension();

      // The host can't subscribe to anything if it's already being used as an
      // extension by someone else — adding extensions to it would create
      // transitive deps for those subscribers.
      if (childRuleset.userId !== null) {
        const subscribers = await Rulesets.findSubscribers(tx, id);
        if (subscribers.length > 0) {
          throw new UnprocessableEntityError(
            "Cannot subscribe to extensions while this ruleset is being used as an extension",
          );
        }
      }

      // 2. Validate each extension
      const newExtensionIds: string[] = [];
      for (const extensionId of extensionIds) {
        if (extensionId === id) {
          throw new UnprocessableEntityError("Cannot subscribe to itself");
        }
        const extension = await Rulesets.findOne(tx, { id: extensionId });
        if (!extension) {
          throw new NotFoundError("Extension not found");
        }
        if (extension.kind !== "extension") {
          throw new UnprocessableEntityError("Ruleset is not published as an extension");
        }
        if (extension.status !== "Published") {
          throw new UnprocessableEntityError("Extension must be published");
        }
        if (extension.userId !== null && extension.private) {
          throw new UnprocessableEntityError("Extension must be public");
        }
        // Both child and extension are forks of a base ruleset (fork-of-fork
        // is blocked, extensions are forks of bases) so "share a common ancestor"
        // collapses to "fork the same base."
        if (childRuleset.rulesetId !== extension.rulesetId) {
          throw new UnprocessableEntityError("Extension must share a common ancestor ruleset");
        }
        if (childRuleset.extensionRulesetIds.includes(extensionId)) {
          throw new ConflictError("Already subscribed to this extension");
        }
        newExtensionIds.push(extensionId);
      }

      await assertExtensionsNameCompatible(
        tx,
        id,
        newExtensionIds,
        childRuleset.extensionRulesetIds,
      );

      // 3. Append all to extensionRulesetIds
      await Rulesets.update(
        tx,
        { extensionRulesetIds: [...childRuleset.extensionRulesetIds, ...newExtensionIds] },
        { id },
      );

      // 4. Upsert metadata rows
      for (const extensionId of newExtensionIds) {
        await RulesetExtensions.upsert(tx, { rulesetId: id, extensionId });
      }

      // 5. Log activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetTable: getTableName(rulesetsInRules),
        type: "subscribeExtension",
        data: { extensionIds: newExtensionIds },
      });

      return { subscribed: true };
    });

    invalidateRuleset(id);
    return result;
  },

  async unsubscribeExtension(
    session: Session,
    id: string,
    extensionId: string,
  ) {
    const result = await withTransaction(async (tx) => {
      // 1. Validate
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }
      const policy = new RulesetsPolicy(session, ruleset);
      policy.canUnsubscribeExtension();

      if (!ruleset.extensionRulesetIds.includes(extensionId)) {
        throw new NotFoundError("Not subscribed to this extension");
      }

      const inUse = await isExtensionInUseByHost(tx, id, extensionId);
      policy.canUnsubscribeExtension({ inUse });

      // 2. Clean up COW copies: find snapshots whose sourceEntityId belongs to the extension
      const snapshots = await EntitySnapshots.findByRulesetId(tx, { rulesetId: id });
      const extensionSnapshots = [];
      for (const snap of snapshots) {
        const entityType = snap.entityType as EntityType;
        const repo = ENTITY_REPOS[entityType];
        if (!repo) continue;
        const sourceEntity = await repo.findOne(tx, { id: snap.sourceEntityId } as never);
        if (sourceEntity && (sourceEntity as Record<string, unknown>).rulesetId === extensionId) {
          extensionSnapshots.push(snap);
        }
      }

      // Delete COW copies and their snapshots
      for (const snap of extensionSnapshots) {
        const entityType = snap.entityType as EntityType;
        await deleteEntityWithCascade(tx, entityType, snap.forkedEntityId);
        await EntitySnapshots.deleteBySourceAndRuleset(tx, {
          sourceEntityId: snap.sourceEntityId,
          rulesetId: id,
        });
      }

      // 3. Remove extensionId from array
      await Rulesets.update(
        tx,
        { extensionRulesetIds: ruleset.extensionRulesetIds.filter((eid) => eid !== extensionId) },
        { id },
      );

      // 4. Soft-delete metadata row
      await RulesetExtensions.archive(tx, { rulesetId: id, extensionId });

      // 5. Log activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetTable: getTableName(rulesetsInRules),
        type: "unsubscribeExtension",
        data: { extensionId },
      });

      return { unsubscribed: true };
    });

    invalidateRuleset(id);
    return result;
  },

  async getChanges(session: Session, rulesetId: string) {
    const ruleset = await Rulesets.findOne(db, { id: rulesetId });
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    (await getRulesetPolicy(db, session, ruleset)).canViewChanges();

    if (!ruleset.rulesetId) {
      throw new BadRequestError("Only forked rulesets have local changes");
    }

    const snapshots = await EntitySnapshots.findByRulesetId(db, { rulesetId });

    // Group snapshots by entity type for batch fetching
    const snapshotsByType = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      if (!snapshotsByType.has(snap.entityType)) snapshotsByType.set(snap.entityType, []);
      snapshotsByType.get(snap.entityType)!.push(snap);
    }

    type ChangeRow =
      | { entityType: string; status: "modified"; sourceEntityId: string; entityId: string; name: string }
      | { entityType: string; status: "deleted";  sourceEntityId: string;                    name: string }
      | { entityType: string; status: "added";                            entityId: string; name: string };

    const changes: ChangeRow[] = [];

    // Walk every entity type so we can emit "added" rows for locally-owned
    // entities that aren't tracked by any snapshot, alongside the snapshot-
    // tracked "modified"/"deleted" rows.
    for (const entityType of Object.keys(ENTITY_TABLES) as (keyof typeof ENTITY_TABLES)[]) {
      const table = ENTITY_TABLES[entityType];
      const typeSnapshots = snapshotsByType.get(entityType) ?? [];
      const forkedIds = typeSnapshots.map((s) => s.forkedEntityId);

      // Locally-owned rows. Forked entity ids that have a snapshot are COWs
      // (modified/deleted); the rest are locally-created (added).
      const localRows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(eq(table.rulesetId, rulesetId));
      const forkedIdSet = new Set(forkedIds);
      const localById = new Map(localRows.map((r) => [r.id, r]));

      for (const local of localRows) {
        if (forkedIdSet.has(local.id)) continue;
        changes.push({
          entityType,
          status: "added",
          entityId: local.id,
          name: local.name,
        });
      }

      if (typeSnapshots.length === 0) continue;

      // Tombstones (COW hard-deleted) need the source entity's name as a fallback.
      const sourceIds = typeSnapshots.map((s) => s.sourceEntityId);
      const sourceRows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, sourceIds));
      const sourceById = new Map(sourceRows.map((r) => [r.id, r]));

      for (const snap of typeSnapshots) {
        const forked = localById.get(snap.forkedEntityId);
        if (forked) {
          changes.push({
            entityType: snap.entityType,
            status: "modified",
            sourceEntityId: snap.sourceEntityId,
            entityId: snap.forkedEntityId,
            name: forked.name,
          });
          continue;
        }
        const source = sourceById.get(snap.sourceEntityId);
        if (!source) continue;
        changes.push({
          entityType: snap.entityType,
          status: "deleted",
          sourceEntityId: snap.sourceEntityId,
          name: source.name,
        });
      }
    }

    return changes;
  },

  async revertOverride(session: Session, rulesetId: string, entityType: EntityType, entityId: string) {
    const result = await withTransaction(async (tx) => {
      const ruleset = await Rulesets.findOne(tx, { id: rulesetId });
      if (!ruleset) {
        throw new NotFoundError("Ruleset not found");
      }

      (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

      const snapshot = await EntitySnapshots.findBySourceAndRuleset(tx, {
        sourceEntityId: entityId,
        rulesetId,
      });

      if (!snapshot) {
        throw new NotFoundError("Entity is not an override in this ruleset");
      }

      // Reverting hard-deletes the COW row, and FK CASCADE then wipes any
      // character picks pointing at it. Mirror the inUse guard each delete
      // service runs (current ruleset + descendants).
      if (await entityHasCharacterPicks(tx, entityType, snapshot.forkedEntityId, rulesetId)) {
        throw new ConflictError("Cannot revert override while characters in this ruleset depend on it");
      }

      // For items, repoint copies from the COW back to the original parent template
      // before the cascade hard-deletes (RESTRICT FK). Klass_levels and dependent
      // character_levels are wiped via FK CASCADE on the parent klass row.
      if (entityType === "items") {
        await tx.update(itemsInRules)
          .set({ sourceItemId: entityId })
          .where(eq(itemsInRules.sourceItemId, snapshot.forkedEntityId));
      }
      await deleteEntityWithCascade(tx, entityType, snapshot.forkedEntityId);
      await EntitySnapshots.deleteBySourceAndRuleset(tx, {
        sourceEntityId: entityId,
        rulesetId,
      });

      return { restored: true };
    });

    invalidateRuleset(rulesetId);
    return result;
  },

  async getSubscribedExtensions(_session: Session, id: string) {
    const ruleset = await Rulesets.findOne(db, { id });
    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    const subscribed = await RulesetExtensions.findByRulesetId(db, { rulesetId: id });

    return subscribed.map((ext) => ({
      extensionId: ext.extensionId,
      extensionName: ext.extensionName,
      extensionDescription: ext.extensionDescription,
      subscribedAt: ext.subscribedAt,
      updateAvailable: ext.extensionUpdatedAt > ext.updatedAt,
    }));
  },

} as const;

class RulesetsService extends BaseService<typeof RulesetsMethods> {
  static initialize() {
    return new RulesetsService(RulesetsMethods);
  }
}

export default RulesetsService;
