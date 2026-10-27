/**
 * The walk from a row of a ruleset's content to its ruleset, which an activity's link and its notifications both take:
 * an owned entity to its owner, an edited link to the entity that holds it, a customization to its entity, until an
 * entity of the ruleset's own.
 */

import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { Entities, Modifiers, Requirements, RULESET_ENTITY_TYPES } from "@/server/repositories/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

/** A row of a ruleset's content, by its type: an entity, or what belongs to one (a class level, a customization). */
export interface ContentRow {
  id: string;
  type: string;
}

/**
 * The customizations of a ruleset's content, by their type, and the row each belongs to: a customization's entity (a
 * requirement's may be a modifier).
 */
const CUSTOMIZATION_OWNERS = new Map<string, (db: Db, id: string) => Promise<ContentRow | undefined>>([
  [
    TARGET_TYPES.modifiers,
    async (db, id) => {
      const modifier = await Modifiers.findOne(db, { id });
      // A modifier is an entity's (or a character's), never another modifier's: a row saying so belongs to none
      if (!modifier || modifier.sourceType === TARGET_TYPES.modifiers) return undefined;
      return { id: modifier.sourceId, type: modifier.sourceType };
    },
  ],
  [
    TARGET_TYPES.requirements,
    async (db, id) => {
      const requirement = await Requirements.findOne(db, { id });
      return requirement && { id: requirement.entityId, type: requirement.entityType };
    },
  ],
]);

/** Whether a type is of a ruleset's content: one the walk to its ruleset climbs (`findContentRuleset`). */
export function isContentType(type: string) {
  return (
    isOneOf(type, RULESET_ENTITY_TYPES) ||
    Engine.storage().ownerOf(type) !== undefined ||
    Engine.storage().editedLinks().has(type) ||
    CUSTOMIZATION_OWNERS.has(type)
  );
}

/**
 * The row a row of a ruleset's content beside its entities belongs to: an owned entity's owner (a class level's class),
 * an edited link's owner (a class's skills' activity targets the class), a customization's entity. None for a ruleset's
 * entity, a row that's gone, or what belongs to no row of a ruleset (a character's own modifiers).
 */
export async function findContentOwner(db: Db, { id, type }: ContentRow): Promise<ContentRow | undefined> {
  const ownerType = Engine.storage().ownerOf(type);
  if (ownerType) {
    const [owned] = await Entities.findPositions(db, { entityType: type, ids: [id] });
    return owned && { id: owned.ownerId, type: ownerType };
  }
  const edited = Engine.storage().editedLinks().get(type);
  if (edited) return { id, type: edited.from };
  return await CUSTOMIZATION_OWNERS.get(type)?.(db, id);
}

/**
 * The ruleset a row of its content is in: an entity's own, or that of the row it belongs to (`findContentOwner`). None
 * once a row on the way is gone, or for a row of no ruleset's.
 */
export async function findContentRuleset(db: Db, { id, type }: ContentRow): Promise<string | undefined> {
  if (isOneOf(type, RULESET_ENTITY_TYPES)) return (await Entities.findOne(db, { entityType: type, id }))?.rulesetId;
  const owner = await findContentOwner(db, { id, type });
  return owner && (await findContentRuleset(db, owner));
}
