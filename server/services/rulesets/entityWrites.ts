/** What saving a ruleset entity writes beside its row, as the engine plans it (`EntityWrites`): the server writes it. */

import type { EntityWrites, GeneratedFeatRemoval, GeneratedFeatsWrite } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

/** A generated feat a save removes, refused while a character picked it. */
async function removeGeneratedFeat(tx: Db, scope: RulesetScope, removal: GeneratedFeatRemoval) {
  const { ruleset, rulesetData } = scope;
  if (await hasCharacterPicks(tx, "feats", removal.featId, ruleset.id)) throw new ConflictError(removal.inUse);

  // Deleting the local COW copy leaves a tombstone snapshot: the obsolete inherited feat disappears from this fork
  // while its ancestor stays intact. Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link, and the
  // database deletes the feat's customizations. Soft-archive would block a feat of the same name made later (the
  // unique index on feats doesn't filter deleted_at).
  const targetId = await new RulesetEdit(ruleset, rulesetData.cow).cowOwner(tx, "feats", removal.featId);
  await Feats.delete(tx, { id: targetId });
}

/**
 * The feats a save makes, in the scope's ruleset: each in its pool, with its modifiers, its properties and its
 * requirements.
 */
async function writeGeneratedFeats(tx: Db, scope: RulesetScope, write: GeneratedFeatsWrite) {
  for (const generated of write.feats) {
    const [feat] = await Feats.create(tx, {
      name: generated.name,
      description: generated.description,
      generated: true,
      rulesetId: scope.ruleset.id,
    });
    const owner = { entityId: feat.id, entityType: "feats" };
    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: generated.aptitudeId });
    await Modifiers.createMany(
      tx,
      generated.modifiers.map((modifier) => ({ ...modifier, sourceId: feat.id, sourceType: "feats" })),
    );
    await Properties.createMany(
      tx,
      generated.properties.map((property) => ({ ...owner, ...property })),
    );
    await Requirements.createMany(
      tx,
      generated.requirements.map((requirement) => ({ ...owner, ...requirement })),
    );
  }
}

/**
 * Writes what the engine plans a save of an entity (`entityId`, of `entityType`) writes beside its row (`writes`): the
 * feats it removes, its properties (those of their types it had give way), a requirement on it and the feats it
 * makes. Answers the properties it wrote, which describe the entity as saved.
 */
export async function writeEntityWrites(
  tx: Db,
  scope: RulesetScope,
  entity: { entityId: string; entityType: PropertyEntityType },
  writes: EntityWrites,
) {
  for (const removal of writes.removedFeats) await removeGeneratedFeat(tx, scope, removal);
  const properties = writes.properties?.values.map((property) => ({ ...entity, ...property })) ?? [];
  if (writes.properties) {
    const { types } = writes.properties;
    await Properties.delete(tx, { entityIds: [entity.entityId], entityType: entity.entityType, types });
    await Properties.createMany(tx, properties);
  }
  if (writes.requirement) await Requirements.create(tx, { ...entity, ...writes.requirement });
  for (const generated of writes.generatedFeats) await writeGeneratedFeats(tx, scope, generated);
  return properties;
}
