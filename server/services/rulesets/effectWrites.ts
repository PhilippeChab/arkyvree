import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import type {
  FeatsEffects,
  GeneratedFeatRemoval,
  GeneratedFeatsWrite,
  PropertiesWrite,
  RequirementWrite,
} from "@/server/rulesets/engine/module/index.ts";

/** Whether the scope's ruleset or its chain has a feat of this name: one a write makes is made once. */
async function isFeatPresent(tx: Db, scope: RulesetScope, name: string) {
  for (const rulesetId of [scope.ruleset.id, ...scope.rulesetData.cow.sourceChain])
    if (await Feats.findOne(tx, { name, rulesetId })) return true;

  return false;
}

/** The generated feat a module's effects remove (`GeneratedFeatRemoval`), refused while a character picked it. */
export async function removeGeneratedFeat(tx: Db, scope: RulesetScope, removal: GeneratedFeatRemoval) {
  const { ruleset, rulesetData } = scope;
  const feat = rulesetData.feats.find((f) => f.name === removal.name);
  if (!feat) return;
  if (await hasCharacterPicks(tx, "feats", feat.id, ruleset.id)) throw new ConflictError(removal.inUse);

  // Deleting the local COW copy leaves a tombstone snapshot: the obsolete inherited feat disappears from this fork
  // while its ancestor stays intact. Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link, and the
  // database deletes the feat's customizations. Soft-archive would block a feat of the same name made later (the
  // unique index on feats doesn't filter deleted_at).
  const targetId = await new RulesetEdit(ruleset, rulesetData.cow).cowOwner(tx, "feats", feat.id);
  await Feats.delete(tx, { id: targetId });
}

/**
 * The feats a module's effects generate (`GeneratedFeatsWrite`), in the scope's ruleset: each in its pool, with its
 * modifiers, the properties its fields are stored as (`feats.properties`) and its requirements. None when the write's
 * `unlessPresent` feat is there already, or when the ruleset lacks a feat's pool.
 */
export async function writeGeneratedFeats(
  tx: Db,
  scope: RulesetScope,
  feats: FeatsEffects,
  write: GeneratedFeatsWrite,
) {
  if (write.unlessPresent && (await isFeatPresent(tx, scope, write.unlessPresent))) return;
  const aptitudeIds = write.feats.map((feat) => scope.rulesetData.aptitudeIdBySlug.get(feat.aptitudeSlug));
  if (aptitudeIds.some((id) => id === undefined)) return;

  for (const [i, generated] of write.feats.entries()) {
    const [feat] = await Feats.create(tx, {
      name: generated.name,
      description: generated.description,
      generated: true,
      rulesetId: scope.ruleset.id,
    });
    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: aptitudeIds[i]! });
    await Modifiers.createMany(
      tx,
      generated.modifiers.map((modifier) => ({ ...modifier, sourceId: feat.id, sourceType: "feats" })),
    );
    await Properties.createMany(tx, feats.properties(feat.id, generated.fields).rows);
    await Requirements.createMany(
      tx,
      generated.requirements.map((requirement) => ({ ...requirement, entityId: feat.id, entityType: "feats" })),
    );
  }
}

/** An entity's properties as a module's effects say (`PropertiesWrite`): those of its types give way to its rows. */
export async function writeProperties(tx: Db, write: PropertiesWrite) {
  await Properties.delete(tx, { entityIds: [write.entityId], entityType: write.entityType, types: write.types });
  await Properties.createMany(tx, write.rows);
}

/** The requirement a module's effects create, when they say one. */
export async function writeRequirement(tx: Db, write: RequirementWrite | undefined) {
  if (write) await Requirements.create(tx, write);
}
