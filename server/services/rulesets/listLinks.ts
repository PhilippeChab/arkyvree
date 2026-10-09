/** An entity's list links, as a plan gives them (`ListLink`): a feat's pools, a power's lists at its spell levels. */

import type { ListLink } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { FeatsAptitudes, PowersAptitudes, type RulesetEntityType } from "@/server/repositories/index.ts";

/** A kind's list links' table: its links written, and its entity's removed. */
interface LinkTable {
  link(tx: Db, entityId: string, links: ListLink[]): Promise<unknown>;
  unlink(tx: Db, entityId: string): Promise<unknown>;
}

/** The tables a kind's list links are kept in, by the kind's: a feat's pools, a power's lists. */
const LINK_TABLES: Partial<Record<RulesetEntityType, LinkTable>> = {
  feats: {
    link: (tx, featId, links) =>
      FeatsAptitudes.createMany(
        tx,
        links.map(({ aptitudeId }) => ({ aptitudeId, featId })),
      ),
    unlink: (tx, featId) => FeatsAptitudes.delete(tx, { featId }),
  },
  powers: {
    link: (tx, powerId, links) =>
      PowersAptitudes.createMany(
        tx,
        links.map(({ aptitudeId, level }) => ({ aptitudeId, level: level ?? null, powerId })),
      ),
    unlink: (tx, powerId) => PowersAptitudes.delete(tx, { powerId }),
  },
};

/** An entity's list links (`entityId`, of `type`): refused for a kind without lists. */
export async function createListLinks(tx: Db, type: RulesetEntityType, entityId: string, links: ListLink[]) {
  if (links.length === 0) return;
  const table = LINK_TABLES[type];
  if (!table) throw new Error(`A ${type} entity has no lists`);
  await table.link(tx, entityId, links);
}

/** An entity's list links, replaced by `links` (none given: those it has stay). */
export async function setListLinks(tx: Db, type: RulesetEntityType, entityId: string, links: ListLink[] | undefined) {
  if (links === undefined) return;
  await LINK_TABLES[type]?.unlink(tx, entityId);
  await createListLinks(tx, type, entityId, links);
}
