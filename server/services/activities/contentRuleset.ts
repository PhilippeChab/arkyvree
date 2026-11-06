/**
 * The walk from a row of a ruleset's content to its ruleset, which an activity's link and its notifications both take:
 * an owned entity to its owner, an edited link to the entity that holds it, a customization to its entity, until an
 * entity of the ruleset's own. Its base rules are read once, off the entity the row is or belongs to
 * (`findContentBaseRules`), and say what each step's type is.
 */

import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { BaseRules } from "@/shared/enums.ts";
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
      if (!modifier || modifier.sourceType === CUSTOMIZATION_TYPES.modifier) return undefined;
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

/**
 * The base rules of a row of a ruleset's content: its entity's, as its row names them, a customization's the entity's
 * it belongs to (a requirement's of a modifier, the modifier's). None once a row on the way is gone, or for a row of no
 * ruleset's (a character's own modifier).
 */
export async function findContentBaseRules(db: Db, { id, type }: ContentRow): Promise<BaseRules | undefined> {
  const customization = CUSTOMIZATION_OWNERS.get(type);
  if (!customization) return await Entities.findBaseRules(db, { id });
  const owner = await customization(db, id);
  return owner && (await findContentBaseRules(db, owner));
}

/**
 * The row a row of a ruleset's content beside its entities belongs to: a customization's entity, an owned entity's
 * owner (a class level's class), an edited link's owner (a class's skills' activity targets the class), by the
 * declarations of its ruleset's base rules (`baseRules`). None for a ruleset's entity, a row that's gone, or what
 * belongs to no row of a ruleset (a character's own modifiers).
 */
export async function findContentOwner(
  db: Db,
  baseRules: BaseRules,
  { id, type }: ContentRow,
): Promise<ContentRow | undefined> {
  const customization = CUSTOMIZATION_OWNERS.get(type);
  if (customization) return await customization(db, id);
  const storage = Engine.forRules(baseRules).storage();
  const ownerType = storage.ownerOf(type);
  if (ownerType) {
    const [owned] = await Entities.findPositions(db, { entityType: type, ids: [id] });
    return owned && { id: owned.ownerId, type: ownerType };
  }
  const edited = storage.editedLinks().get(type);
  return edited && { id, type: edited.from };
}

/**
 * The ruleset a row of its content is in (of `baseRules`): an entity's own, or that of the row it belongs to
 * (`findContentOwner`). None once a row on the way is gone, or for a row of no ruleset's.
 */
export async function findContentRuleset(
  db: Db,
  baseRules: BaseRules,
  { id, type }: ContentRow,
): Promise<string | undefined> {
  // A kind no other owns: the ruleset's own entity
  if (isOneOf(type, Engine.forRules(baseRules).storage().standaloneKinds()))
    return (await Entities.findOne(db, { entityType: type, id }))?.rulesetId;
  const owner = await findContentOwner(db, baseRules, { id, type });
  return owner && (await findContentRuleset(db, baseRules, owner));
}
