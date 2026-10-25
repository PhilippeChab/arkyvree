/**
 * What an entity's save writes of its links, as its plan sets them by role (`LinkSet`: a feat's pools, a class level's
 * grants), whichever save writes it: its own form's, its owner's progression's, or that of the entity a plan makes.
 */

import type { Db } from "@/drizzle/database.ts";
import type { LinkSet } from "@/engine/index.ts";
import { EntityLinks } from "@/server/repositories/index.ts";

/** The links a set holds, each from the entity (`entity`: its id, of its type). */
function linksOf(entity: { entityId: string; entityType: string }, { links, role, toType }: LinkSet) {
  return links.map((link) => ({ ...link, fromId: entity.entityId, fromType: entity.entityType, role, toType }));
}

/** Writes the links a plan sets on a new entity (`entity`: its id, of its type), each set's in its order. */
export async function createLinks(tx: Db, entity: { entityId: string; entityType: string }, sets: LinkSet[]) {
  await EntityLinks.createMany(
    tx,
    sets.flatMap((set) => linksOf(entity, set)),
  );
}

/**
 * Writes the links a plan sets on an entity (`entity`: its id, of its type), each set replacing the entity's links of
 * its role to its kind, in its order: a role it leaves out keeps its links (none given: every one).
 */
export async function setLinks(tx: Db, entity: { entityId: string; entityType: string }, sets: LinkSet[] | undefined) {
  for (const set of sets ?? []) {
    await EntityLinks.delete(tx, { fromId: entity.entityId, role: set.role, toType: set.toType });
    await EntityLinks.createMany(tx, linksOf(entity, set));
  }
}
