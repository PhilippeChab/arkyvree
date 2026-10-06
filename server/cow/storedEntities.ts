/** An entity locked or read by its stored id, as the copy-on-write writes need it. */

import { type Db, withCowContext } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Feats } from "@/server/repositories/index.ts";

import { ENTITY_REPOS } from "./constants.ts";
import type { EntityType } from "./hashing.ts";

/** Serialize child writes with deletion/revert of their stored owner. */
export async function lockEntityForMutation(tx: Db, entityType: EntityType, entityId: string): Promise<void> {
  if (!(await ENTITY_REPOS[entityType].lock(tx, { id: entityId }))) {
    throw new NotFoundError("Customization source no longer exists; refresh the entity");
  }
}

/**
 * Whether the ancestor feat a fork deleted was generated, read by its stored id: a new feat with its name stands in
 * for it (`RulesetEdit.repointTombstone`), and takes its mark.
 */
export async function wasGeneratedFeat(tx: Db, ancestorFeatId: string): Promise<boolean> {
  const feat = await withCowContext(undefined, () => Feats.findOne(tx, { id: ancestorFeatId }));
  return feat?.generated ?? false;
}
