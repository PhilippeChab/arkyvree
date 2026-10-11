import { getTableName } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import { CowDataReader, EntityNames, EntityRepositories, EntityRevert, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Activities,
  EntityReferences,
  EntitySnapshots,
  type RulesetEntityType,
  RulesetExtensions,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

import { type Departures, findDepartures, repointDepartingReferences } from "./departingReferences.ts";

class RulesetExtensionsService {
  /**
   * Whether a character on the host picked what leaves its view with the extension (`departures`): one of its entities,
   * or one of the host's copies of them, with nothing in its place once it's gone (an entity only the extension has), or
   * a level of a class the class standing in its place doesn't have. The pick would dangle. A pick of what the view
   * shows something else in place of (a core feat the extension overrides) names that instead. Every type's picks, a
   * class's by its levels (`EntityReferences.exists`).
   */
  private async isExtensionInUseByHost(tx: Db, hostRulesetId: string, departures: Departures) {
    for (const [entityType, fallbacks] of departures) {
      const ids = [...fallbacks].filter(([, fallbackId]) => !fallbackId).map(([id]) => id);
      if (await EntityReferences.exists(tx, { entityType, ids, rulesetId: hostRulesetId })) return true;
    }
    return false;
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

      // Its view would show no two entities of a name it shows one of, nor two the extensions bring
      const names = new EntityNames(childRuleset, await CowDataReader.read(tx, childRuleset));
      await names.assertExtensionNamesAvailable(tx, newExtensionIds);

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

      // 2. The fork's copies of the extension's entities: the snapshots whose sourceEntityId belongs to the extension
      const snapshots = await EntitySnapshots.findMany(tx, { rulesetId: id });
      const extensionSnapshots = [];
      for (const snap of snapshots) {
        const entityType = snap.entityType as RulesetEntityType;
        const repo = EntityRepositories.of(entityType);
        if (!repo) continue;
        const sourceEntity = await repo.findOne(tx, { id: snap.sourceEntityId });
        if (sourceEntity?.rulesetId === extensionId) extensionSnapshots.push(snap);
      }

      const copies = new Map(
        [...Map.groupBy(extensionSnapshots, (snap) => snap.entityType)].map(([type, snaps]) => [
          type,
          snaps.map((snap) => snap.forkedEntityId),
        ]),
      );
      // What the book hid shows again: its view would show no two entities of a name, as a subscribe's wouldn't
      const names = new EntityNames(ruleset, await CowDataReader.read(tx, ruleset));
      await names.assertReturningNamesAvailable(tx, extensionId, [...copies.values()].flat());
      // What leaves with the book, each with what the fork's view shows in its place once it's gone, if anything
      const departures = await findDepartures(tx, ruleset, extensionId, copies);
      policy.canUnsubscribeExtension({ inUse: await this.isExtensionInUseByHost(tx, id, departures) });

      // What the fork and its characters keep that names what leaves names what stands in its place, or the
      // unsubscribe refuses: before the copies go, what names the fork's copies of the book's entities included
      await repointDepartingReferences(tx, id, departures, copies);

      // The fork's copies go as a restore reverts them (`EntityRevert`): what names a copy names the extension's entity
      // first, so no copy's delete trips another's reference to it (an item's copy naming its template's), in any order
      for (const snap of extensionSnapshots)
        await EntityRevert.revert(tx, snap.entityType as RulesetEntityType, snap.sourceEntityId, id);

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
