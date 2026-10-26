/** What saving a ruleset entity writes beside its row, as the engine plans it (`EntityWrites`): the server writes it. */

import type { Db } from "@/drizzle/database.ts";
import type { EntityRemoval, EntityWrites, MadeEntity } from "@/engine/index.ts";
import { CustomizationEdit, type RulesetScope } from "@/server/cow/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  Entities,
  Modifiers,
  Requirements,
  RULESET_ENTITY_TYPES,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

import { hasCharacterPicks } from "./characterPicks.ts";
import { createLinks } from "./linkWrites.ts";

/** An entity's table, as a plan names it: refused when it isn't a ruleset entity's. */
function entityTypeOf(type: string): RulesetEntityType {
  const entityType = RULESET_ENTITY_TYPES.find((known) => known === type);
  if (!entityType) throw new Error(`A save cannot write a ${type} entity`);
  return entityType;
}

/**
 * An entity a plan makes, in the scope's ruleset: its row (its fields and single links among it), its links, its
 * modifiers and its requirements.
 */
async function makeEntity(tx: Db, scope: RulesetScope, made: MadeEntity) {
  const type = entityTypeOf(made.type);
  const [entity] = await Entities.create(tx, type, { ...made.row, rulesetId: scope.ruleset.id });
  const owner = { entityId: entity.id, entityType: type };
  await createLinks(tx, owner, made.links);
  await Modifiers.createMany(
    tx,
    made.modifiers.map((modifier) => ({ ...modifier, sourceId: entity.id, sourceType: type })),
  );
  await Requirements.createMany(
    tx,
    made.requirements.map((requirement) => ({ ...owner, ...requirement })),
  );
}

/**
 * An entity a plan removes, refused while a character picked it. Deleting the ruleset's copy of an inherited one leaves
 * a tombstone snapshot: it disappears from the ruleset while its ancestor stays intact. A hard delete: the database
 * deletes its links and customizations with it, and a soft-archive would block an entity of the same name made later.
 */
async function removeEntity(tx: Db, scope: RulesetScope, removal: EntityRemoval) {
  const { ruleset, rulesetData } = scope;
  const type = entityTypeOf(removal.type);
  if (await hasCharacterPicks(tx, type, rulesetData.cow.getEquivalentIds(removal.id), ruleset.id))
    throw new ConflictError(removal.inUse);

  const targetId = await new CustomizationEdit(ruleset, rulesetData.cow).cowOwner(tx, type, removal.id);
  await Entities.delete(tx, { entityType: type, id: targetId });
}

/**
 * Writes what the engine plans an entity's create or edit (`entity`: its id, of its type) writes beside its row
 * (`writes`): the entities it removes, a requirement on it, and the entities it makes.
 */
export async function writeEntityWrites(
  tx: Db,
  scope: RulesetScope,
  entity: { entityId: string; entityType: string },
  writes: EntityWrites,
) {
  for (const removal of writes.removed ?? []) await removeEntity(tx, scope, removal);
  if (writes.requirement) await Requirements.create(tx, { ...entity, ...writes.requirement });
  for (const made of writes.made ?? []) await makeEntity(tx, scope, made);
}
