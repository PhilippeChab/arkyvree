import type { Db } from "@/drizzle/database.ts";
import { EntityNames, EntityRevert, ExtensionDeparture, type LockedRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { BusyError } from "@/server/errors/index.ts";
import { Activities, RulesetExtensions, Rulesets } from "@/server/repositories/index.ts";
import type { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { findReadableRuleset, getReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { BUSY_RULESET_MESSAGE, withRulesetWrite } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class RulesetExtensionsService {
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
    // The extensions it adds are locked with its chain before they're checked: no write of theirs runs meanwhile. Only
    // what's stored as an extension (an extension subscribes to nothing, so it never waits on the ruleset): anything
    // else is refused under the lock, unlocked, as an unknown or a ruleset no extension is
    const candidates = await Rulesets.findMany(db, { ids: extensionIds.filter((extensionId) => extensionId !== id) });
    const reads = candidates.filter((ruleset) => ruleset.kind === "extension").map((ruleset) => ruleset.id);
    const write = async (tx: Db, scope: LockedRulesetScope, policy: RulesetsPolicy) => {
      // 1. Validate the ruleset, and each extension it names, between who and its state. One the session may not read
      // is refused as an unknown one is: a private ruleset's existence isn't revealed
      const { sources } = scope;
      const policies = [];
      for (const extensionId of extensionIds)
        policies.push((await findReadableRuleset(tx, session, extensionId))?.policy);
      policy.canSubscribeExtension({
        extensions: { policies, subscribed: sources.extensionIds },
        usedAsExtension: await Rulesets.exists(tx, { subscribedTo: id }),
      });

      // 2. One that became an extension after its kind was read isn't locked, as its chain is: its writes may be running
      const newExtensionIds: string[] = [];
      for (const extensionId of extensionIds) {
        if (!scope.versions.has(extensionId)) throw new BusyError(BUSY_RULESET_MESSAGE);
        newExtensionIds.push(extensionId);
      }

      // Its view would show no two entities of a name it shows one of, nor two the extensions bring
      const names = new EntityNames(scope);
      await names.assertExtensionNamesAvailable(tx, newExtensionIds);

      // 3. It subscribes to them after those it subscribes to, in their order: its lock orders concurrent subscribes'
      // places, each placed after the last one's
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
    };
    return await withRulesetWrite(session, id, write, { reads });
  }

  async unsubscribeExtension(session: Session, id: string, extensionId: string) {
    return await withRulesetWrite(session, id, async (tx, scope, policy) => {
      // 1. Validate: who, then the extension it names (one it subscribes to), then its state
      policy.canUnsubscribeExtension({ isSubscribed: scope.sources.extensionIds.includes(extensionId) });

      // 2. What leaves with the book, each with what the fork's view shows in its place once it's gone, if anything, and
      // the fork's copies of its entities, as copy-on-write reads them (`ExtensionDeparture`)
      const departure = await ExtensionDeparture.read(tx, scope, extensionId);
      // What the book hid shows again: its view would show no two entities of a name, as a subscribe's wouldn't
      await new EntityNames(scope).assertReturningNamesAvailable(tx, departure);
      policy.canUnsubscribeExtension({ inUse: await departure.isInUse(tx) });

      // What the fork and its characters keep that names what leaves names what stands in its place, or the
      // unsubscribe refuses: before the copies go, what names the fork's copies of the book's entities included
      await departure.repoint(tx);

      // The fork's copies go as a restore reverts them (`EntityRevert`): what names a copy names the extension's entity
      // first, so no copy's delete trips another's reference to it (an item's copy naming its template's), in any order
      for (const snap of departure.snapshots)
        await EntityRevert.revert(tx, snap.entityType, snap.sourceEntityId, scope);

      // 3. It subscribes to the extension no more: its row is archived
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
  }
}

export default new RulesetExtensionsService();
