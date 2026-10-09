import { getTableName } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityRepositories, RulesetViews } from "@/server/cow/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
  RulesetExtensions,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { deleteEntityWithCascade } from "@/server/services/rulesets/deleteEntityWithCascade.ts";
import type { Session } from "@/shared/relations.ts";

import { repointDepartingReferences } from "./departingReferences.ts";

class RulesetExtensionsService {
  // Rejects a subscribe action that would surface two entities of the same name in
  // the host's source chain, as the engine pairs them: locally-owned (non-shadow)
  // rows in the host, already-subscribed extensions, and the new extensions.
  private async assertExtensionsNameCompatible(
    tx: Db,
    hostId: string,
    newExtensionIds: string[],
    existingExtensionRulesetIds: string[],
  ): Promise<void> {
    if (newExtensionIds.length === 0) return;

    const rulesetIds = [hostId, ...newExtensionIds, ...existingExtensionRulesetIds];

    const entityTypes = RULESET_ENTITY_TYPES.filter(
      (type) => !Engine.copyOnWrite().namePairedEntityTypes.includes(type),
    );
    const names = await RulesetEntities.findNativeNames(tx, { rulesetIds, entityTypes });

    Engine.copyOnWrite().checkExtensionNames(hostId, newExtensionIds, names);
  }

  // Returns true iff any character on `hostRulesetId` has picked an entity that
  // belongs to `extensionId` — either a direct extension entity or a host-owned
  // COW shadow whose source entity belongs to the extension. Unsubscribe deletes
  // those shadows, so a shadow pick would be silently orphaned without this
  // check.
  private async isExtensionInUseByHost(tx: Db, hostRulesetId: string, extensionId: string): Promise<boolean> {
    // Group snapshots by entity type, then resolve each type's source entities
    // in one batched query (avoids N+1 over snapshot count). Build a per-type
    // list of host-owned shadow IDs whose source entity belongs to the extension.
    const snapshots = await EntitySnapshots.findMany(tx, { rulesetId: hostRulesetId });
    const sourceIdsByType: Partial<Record<RulesetEntityType, string[]>> = {};
    for (const snap of snapshots) {
      const type = snap.entityType as RulesetEntityType;
      if (!EntityRepositories.of(type)) continue;
      (sourceIdsByType[type] ??= []).push(snap.sourceEntityId);
    }

    const shadowIdsByType: Partial<Record<RulesetEntityType, string[]>> = {};
    for (const [type, ids] of Object.entries(sourceIdsByType) as [RulesetEntityType, string[]][]) {
      const sources = await EntityRepositories.of(type).findMany(tx, { ids });
      const fromExt = new Set(sources.filter((s) => s.rulesetId === extensionId).map((s) => s.id));
      const forked = snapshots
        .filter((s) => s.entityType === type && fromExt.has(s.sourceEntityId))
        .map((s) => s.forkedEntityId);
      if (forked.length > 0) shadowIdsByType[type] = forked;
    }
    const shadow = (type: RulesetEntityType) => shadowIdsByType[type] ?? [];

    // Shadow ids as stored: a shadow can be a sibling loser, whose id the view would read as its winner's
    return (
      (await CharacterLevelFeats.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowFeatIds: shadow("feats"),
      })) ||
      (await CharacterLevelFeats.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowAptitudeIds: shadow("aptitudes"),
      })) ||
      (await CharacterLevelSkills.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowSkillIds: shadow("skills"),
      })) ||
      (await CharacterLevelPowers.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowPowerIds: shadow("powers"),
      })) ||
      (await CharacterLevelPowers.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowAptitudeIds: shadow("aptitudes"),
      })) ||
      (await CharacterLevels.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowKlassIds: shadow("klasses"),
      })) ||
      (await Characters.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowRaceIds: shadow("races"),
      })) ||
      (await CharacterLanguages.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowLanguageIds: shadow("languages"),
      })) ||
      (await CharacterInventory.exists(tx, {
        hostRulesetId,
        extensionRulesetId: extensionId,
        shadowItemIds: shadow("items"),
      }))
    );
  }

  async getExtensions(_session: Session, id: string) {
    const ruleset = await Rulesets.findOne(db, { id });
    if (!ruleset) throw new NotFoundError("Ruleset not found");

    const subscribed = await RulesetExtensions.findMany(db, { rulesetId: id });

    return subscribed.map((ext) => ({
      extensionId: ext.extensionId,
      extensionName: ext.extensionName,
      extensionDescription: ext.extensionDescription,
      subscribedAt: ext.subscribedAt,
      updateAvailable: ext.extensionUpdatedAt > ext.updatedAt,
    }));
  }

  async subscribeExtension(session: Session, id: string, extensionIds: string[]) {
    const result = await withTransaction(async (tx) => {
      // 1. Validate ruleset
      const childRuleset = await Rulesets.findOne(tx, { id });
      if (!childRuleset) throw new NotFoundError("Ruleset not found");

      (await RulesetsPolicy.for(tx, session, childRuleset)).canSubscribeExtension();

      // The host can't subscribe to anything if it's already being used as an
      // extension by someone else — adding extensions to it would create
      // transitive deps for those subscribers.
      if (childRuleset.userId !== null) {
        const subscribers = await Rulesets.findMany(tx, { extensionRulesetId: id });
        if (subscribers.length > 0) {
          throw new UnprocessableEntityError(
            "Cannot subscribe to extensions while this ruleset is being used as an extension",
          );
        }
      }

      // 2. Validate each extension
      const newExtensionIds: string[] = [];
      for (const extensionId of extensionIds) {
        if (extensionId === id) throw new UnprocessableEntityError("Cannot subscribe to itself");

        const extension = await Rulesets.findOne(tx, { id: extensionId });
        if (!extension) throw new NotFoundError("Extension not found");

        if (extension.kind !== "extension")
          throw new UnprocessableEntityError("Ruleset is not published as an extension");

        if (extension.status !== "Published") throw new UnprocessableEntityError("Extension must be published");

        if (extension.userId !== null && extension.private)
          throw new UnprocessableEntityError("Extension must be public");

        // Both child and extension are forks of a base ruleset (fork-of-fork
        // is blocked, extensions are forks of bases) so "share a common ancestor"
        // collapses to "fork the same base."
        if (childRuleset.rulesetId !== extension.rulesetId)
          throw new UnprocessableEntityError("Extension must share a common ancestor ruleset");

        if (childRuleset.extensionRulesetIds.includes(extensionId))
          throw new ConflictError("Already subscribed to this extension");

        newExtensionIds.push(extensionId);
      }

      await this.assertExtensionsNameCompatible(tx, id, newExtensionIds, childRuleset.extensionRulesetIds);

      // 3. Append all to extensionRulesetIds
      await Rulesets.update(
        tx,
        { extensionRulesetIds: [...childRuleset.extensionRulesetIds, ...newExtensionIds] },
        { id },
      );

      // 4. Upsert metadata rows
      for (const extensionId of newExtensionIds) await RulesetExtensions.upsert(tx, { rulesetId: id, extensionId });

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

    RulesetViews.invalidate(id);
    return result;
  }

  async unsubscribeExtension(session: Session, id: string, extensionId: string) {
    const result = await withTransaction(async (tx) => {
      // 1. Validate
      const ruleset = await Rulesets.findOne(tx, { id });
      if (!ruleset) throw new NotFoundError("Ruleset not found");

      const policy = await RulesetsPolicy.for(tx, session, ruleset);
      policy.canUnsubscribeExtension();

      if (!ruleset.extensionRulesetIds.includes(extensionId))
        throw new NotFoundError("Not subscribed to this extension");

      const inUse = await this.isExtensionInUseByHost(tx, id, extensionId);
      policy.canUnsubscribeExtension({ inUse });

      // 2. Clean up COW copies: find snapshots whose sourceEntityId belongs to the extension
      const snapshots = await EntitySnapshots.findMany(tx, { rulesetId: id });
      const extensionSnapshots = [];
      for (const snap of snapshots) {
        const entityType = snap.entityType as RulesetEntityType;
        const repo = EntityRepositories.of(entityType);
        if (!repo) continue;
        const sourceEntity = await repo.findOne(tx, { id: snap.sourceEntityId });
        if (sourceEntity?.rulesetId === extensionId) extensionSnapshots.push(snap);
      }

      // What the fork keeps that names the book's lists moves to its lists of the same name, or the unsubscribe
      // refuses: before the copies go, links to the fork's copies of the book's lists included
      const copies = new Map(
        [...Map.groupBy(extensionSnapshots, (snap) => snap.entityType)].map(([type, snaps]) => [
          type,
          snaps.map((snap) => snap.forkedEntityId),
        ]),
      );
      await repointDepartingReferences(tx, ruleset, extensionId, copies);

      // Delete COW copies and their snapshots
      for (const snap of extensionSnapshots) {
        const entityType = snap.entityType as RulesetEntityType;
        await deleteEntityWithCascade(tx, entityType, snap.forkedEntityId);
        await EntitySnapshots.delete(tx, {
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

    RulesetViews.invalidate(id);
    return result;
  }
}

export default new RulesetExtensionsService();
