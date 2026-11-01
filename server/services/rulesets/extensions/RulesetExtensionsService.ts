import type { Db } from "@/drizzle/database.ts";
import { CowDataReader, EntityNames, EntityRevert, RulesetChanges, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { Activities, EntityReferences, RulesetExtensions, Rulesets } from "@/server/repositories/index.ts";
import { findReadableRuleset, getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

import { type Departures, findDepartures, repointDepartingReferences } from "./departingReferences.ts";

class RulesetExtensionsService {
  /**
   * Whether a character on the host picked what leaves its view with the extension (`departures`): one of its entities,
   * or one of the host's copies of them, with nothing in its place once it's gone (an entity only the extension has), or
   * a level of a class the class standing in its place doesn't have. The pick would dangle. A pick of what the view
   * shows something else in place of (a core feat the extension overrides) names that instead. Every type's picks at
   * once, a class's by its levels (`EntityReferences.exists`).
   */
  private async isExtensionInUseByHost(tx: Db, hostRulesetId: string, departures: Departures) {
    const ids = [...departures.values()].flatMap((fallbacks) =>
      [...fallbacks].filter(([, fallbackId]) => !fallbackId).map(([id]) => id),
    );
    return await EntityReferences.exists(tx, { ids, rulesetId: hostRulesetId });
  }

  async getExtensions(session: Session, id: string) {
    await getReadableRuleset(db, session, id);

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
      const { policy, ruleset: childRuleset } = await getReadableRuleset(tx, session, id);
      policy.canSubscribeExtension({ usedAsExtension: await Rulesets.exists(tx, { subscribedTo: id }) });
      const sources = (await Rulesets.findSources(tx, { id }))!;

      // 2. Validate each extension
      const newExtensionIds: string[] = [];
      for (const extensionId of extensionIds) {
        if (extensionId === id) throw new UnprocessableEntityError("Cannot subscribe to itself");

        // One the session may not read is refused as an unknown one is: a private ruleset's existence isn't revealed
        const readable = await findReadableRuleset(tx, session, extensionId);
        if (!readable) throw new NotFoundError("Extension not found");
        readable.policy.canBeSubscribed({ parentId: childRuleset.rulesetId });

        if (sources.extensionIds.includes(extensionId)) throw new ConflictError("Already subscribed to this extension");

        newExtensionIds.push(extensionId);
      }

      // Its view would show no two entities of a name it shows one of, nor two the extensions bring
      const names = new EntityNames(sources, await CowDataReader.read(tx, sources));
      await names.assertExtensionNamesAvailable(tx, newExtensionIds);

      // 3. The ruleset changes now, and subscribes to them after those it subscribes to, in their order. Its row's
      // update comes first: the row lock orders concurrent subscribes' places, each placed after the last one's
      await Rulesets.update(tx, {}, { id });
      await RulesetExtensions.upsert(tx, { rulesetId: id, extensionIds: newExtensionIds });

      // 4. Log activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetType: TARGET_TYPES.rulesets,
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
      const { policy } = await getReadableRuleset(tx, session, id);
      policy.canUnsubscribeExtension();

      const sources = (await Rulesets.findSources(tx, { id }))!;
      if (!sources.extensionIds.includes(extensionId)) throw new NotFoundError("Not subscribed to this extension");

      // 2. The fork's copies of the extension's entities, as copy-on-write reads its snapshots (`RulesetChanges`)
      const extensionSnapshots = await RulesetChanges.copiesOf(tx, id, extensionId);

      const copies = new Map(
        [...Map.groupBy(extensionSnapshots, (snap) => snap.entityType)].map(([type, snaps]) => [
          type,
          snaps.map((snap) => snap.forkedEntityId),
        ]),
      );
      // What the book hid shows again: its view would show no two entities of a name, as a subscribe's wouldn't
      const names = new EntityNames(sources, await CowDataReader.read(tx, sources));
      await names.assertReturningNamesAvailable(tx, extensionId, [...copies.values()].flat());
      // What leaves with the book, each with what the fork's view shows in its place once it's gone, if anything
      const departures = await findDepartures(tx, sources, extensionId, copies);
      policy.canUnsubscribeExtension({ inUse: await this.isExtensionInUseByHost(tx, id, departures) });

      // What the fork and its characters keep that names what leaves names what stands in its place, or the
      // unsubscribe refuses: before the copies go, what names the fork's copies of the book's entities included
      await repointDepartingReferences(tx, id, departures, copies);

      // The fork's copies go as a restore reverts them (`EntityRevert`): what names a copy names the extension's entity
      // first, so no copy's delete trips another's reference to it (an item's copy naming its template's), in any order
      for (const snap of extensionSnapshots) await EntityRevert.revert(tx, snap.entityType, snap.sourceEntityId, id);

      // 3. The ruleset changes now, and subscribes to the extension no more: its row is archived
      await Rulesets.update(tx, {}, { id });
      await RulesetExtensions.archive(tx, { rulesetId: id, extensionId });

      // 4. Log activity
      await Activities.create(tx, {
        userId: session.userId,
        targetId: id,
        targetType: TARGET_TYPES.rulesets,
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
