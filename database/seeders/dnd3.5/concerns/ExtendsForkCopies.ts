/**
 * A core rules' update reaching the forks' own copies of what it changed: a fork that edited a core class before it went
 * past 20th has a copy of its 20 levels, and a core feat it edited a copy not in the epic bonus feat lists.
 */

import { and, inArray, ne } from "drizzle-orm";

import { Entities, EntityLinks } from "@/database/seeders/core/SeederState.ts";
import type { BaseSeeder } from "@/database/seeders/dnd3.5/BaseSeeder.ts";
import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { LAST_NONEPIC_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";

/** Bringing other rulesets' copies of the ruleset's entities up to what an update gave the entities. */
export function ExtendsForkCopies<B extends Constructor<BaseSeeder>>(Base: B) {
  abstract class ExtendingForkCopies extends Base {
    /** The copies other rulesets made of the ruleset's entities of a kind (`type`), each with its source's id. */
    private async findForkCopies(type: string): Promise<{ copyId: string; sourceId: string }[]> {
      const sources = await Entities.findMany(this.db, { entityType: type, rulesetIds: [this.ctx.rulesetId] });
      if (sources.length === 0) return [];
      const snapshots = await this.db
        .select({ copyId: entitySnapshotsInRules.forkedEntityId, sourceId: entitySnapshotsInRules.sourceEntityId })
        .from(entitySnapshotsInRules)
        .where(
          and(
            inArray(
              entitySnapshotsInRules.sourceEntityId,
              sources.map(({ id }) => id),
            ),
            ne(entitySnapshotsInRules.rulesetId, this.ctx.rulesetId),
          ),
        );
      const copies = await Entities.findMany(this.db, {
        entityType: type,
        ids: snapshots.map(({ copyId }) => copyId),
      });
      const live = new Set(copies.map(({ id }) => id));
      return snapshots.filter(({ copyId }) => live.has(copyId));
    }

    /**
     * Gives the forks' copies of the ruleset's classes the levels their source has past 20th (a core class's 21st to
     * 40th, `LAST_NONEPIC_LEVEL`): each a copy of its source's level, its fields, its links (its saves, the features it
     * grants) and its customizations (its bonuses), the copy's level of a number standing for its source's. Only a copy
     * that has exactly its 20 levels, its edits kept: one its fork shortened or gave levels of its own past 20th keeps
     * its own. Answers how many copies it extended. Safe to run again: an extended copy has more than 20 levels.
     */
    async extendForkClasses(): Promise<number> {
      let extended = 0;
      for (const { copyId, sourceId } of await this.findForkCopies("classes")) {
        const levels = await Entities.findMany<KlassLevel>(this.db, {
          entityType: "class-levels",
          ownerIds: [sourceId, copyId],
        });
        const own = new Set(levels.filter(({ ownerId }) => ownerId === copyId).map(({ position }) => position));
        const whole = own.size === LAST_NONEPIC_LEVEL && Math.max(...own) === LAST_NONEPIC_LEVEL;
        const added = levels.filter(({ ownerId, position }) => ownerId === sourceId && position > LAST_NONEPIC_LEVEL);
        if (!whole || added.length === 0) continue;
        const ids = await this.insertRows(
          "class-levels",
          added.map(({ position, fields }) => ({ ownerId: copyId, position, fields })),
        );
        const copies = new Map(added.map((level, i) => [level.id, ids[i]]));
        const links = await EntityLinks.findMany(this.db, { fromIds: added.map(({ id }) => id) });
        await this.insertLinks(
          links.map(({ id: _id, fromId, ...link }) => ({
            ...link,
            fromId: copies.get(fromId)!,
            fromType: "class-levels",
          })),
        );
        await this.copyCustomizations(copies);
        extended++;
      }
      return extended;
    }

    /**
     * Lists the forks' copies of the ruleset's feats in the pools (`poolIds`: the epic bonus feat pools an update made)
     * their source is listed in now: a fork's Dodge in Epic Fighter Bonus Feat, as the core Dodge is. Pools that didn't
     * exist when the fork copied the feat, so none it removed it from. Safe to run again.
     */
    async listForkFeatsInPools(poolIds: string[]) {
      const pools = new Set(poolIds);
      const copies = await this.findForkCopies("feats");
      const links = await EntityLinks.findMany(this.db, {
        fromIds: copies.flatMap(({ copyId, sourceId }) => [copyId, sourceId]),
        role: "listedIn",
      });
      const has = new Set(links.map(({ fromId, toId }) => `${fromId}:${toId}`));
      await this.insertListings(
        "feats",
        copies.flatMap(({ copyId, sourceId }) =>
          links
            .filter(({ fromId, toId }) => fromId === sourceId && pools.has(toId) && !has.has(`${copyId}:${toId}`))
            .map(({ toId }) => ({ fromId: copyId, toId })),
        ),
      );
    }
  }
  return ExtendingForkCopies;
}
