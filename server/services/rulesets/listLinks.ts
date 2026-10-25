/** An entity's list links, as a plan gives them (`ListLink`): a feat's pools, a spell's lists at its spell levels. */

import type { Db } from "@/drizzle/database.ts";
import { Engine, type ListLink } from "@/engine/index.ts";
import { Joins, type RulesetEntityType } from "@/server/repositories/index.ts";

/** An entity's list links (`entityId`, of `type`), as its kind's list's join rows: refused for a kind without lists. */
export async function createListLinks(tx: Db, type: RulesetEntityType, entityId: string, links: ListLink[]) {
  if (links.length === 0) return;
  const list = Engine.storage().listRowsOf(type, entityId, links);
  if (!list) throw new Error(`A ${type} entity has no lists`);
  await Joins.createMany(tx, list.join, list.rows);
}

/** An entity's list links, replaced by `links` (none given: those it has stay). */
export async function setListLinks(tx: Db, type: RulesetEntityType, entityId: string, links: ListLink[] | undefined) {
  if (links === undefined) return;
  const list = Engine.storage().listRowsOf(type, entityId, []);
  if (list) await Joins.delete(tx, { join: list.join, fromId: entityId });
  await createListLinks(tx, type, entityId, links);
}
