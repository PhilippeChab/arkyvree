import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import { invalidateAll } from "@/server/cache/index.ts";
import { EntitySnapshots, Feats, Sessions, Skills } from "@/server/repositories/index.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { hashEntity } from "@/server/services/rulesets/hashing.ts";

test("generated identity metadata preserves existing feat content hashes", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const feat = (await Feats.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const { generatedFrom, ...legacyFeat } = feat;
  const customizations = { modifiers: [], properties: [], requirements: [], modifierRequirements: [] };
  const legacyHash = hashEntity("feats", legacyFeat, customizations);
  expect(hashEntity("feats", { ...legacyFeat, generatedFrom: null }, customizations)).toBe(legacyHash);
  expect(hashEntity("feats", { ...legacyFeat, generatedFrom }, customizations)).toBe(legacyHash);
});

test("migration backfills renamed COW identities without guessing historical deletion provenance", async () => {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const fork = await createSeededTestRuleset(session.userId);
  const source = (await Feats.findOne(db, { rulesetId: fork.ancestorRulesetIds[0], name: "Skill Focus: Climb" }))!;
  const skill = (await Skills.findOne(db, { rulesetId: source.rulesetId, name: "Climb" }))!;
  const copy = await FeatsMethods.updateRulesetFeat(session, fork.id, source.id, { name: "Renamed before migration" });
  const deleted = (await Feats.findOne(db, { rulesetId: source.rulesetId, name: "Skill Focus: Swim" }))!;
  await FeatsMethods.deleteRulesetFeat(session, fork.id, deleted.id);
  await db.execute(sql`UPDATE rules.feats SET generated_from = NULL WHERE id IN (${source.id}, ${copy.id}, ${deleted.id})`);

  // The test DB already has the new columns. Exercise the actual migration's
  // data statements against legacy-shaped rows inside this rollback transaction.
  const migration = await Bun.file(new URL("../../../drizzle/0070_generated_feat_identity.sql", import.meta.url)).text();
  for (const statement of migration.split("--> statement-breakpoint").slice(2)) await db.execute(sql.raw(statement));
  const migrated = await Feats.findOne(db, { id: copy.id });
  expect(migrated?.name).toBe("Renamed before migration");
  expect(migrated?.generatedFrom).toEqual({ kind: "skills", key: skill.id, label: "Climb", family: "Skill Focus" });
  const tombstone = await EntitySnapshots.findBySourceAndRuleset(db, { rulesetId: fork.id, sourceEntityId: deleted.id });
  expect(tombstone?.generatedDeletion).toBeNull();
  expect(await Feats.findOne(db, { id: tombstone!.forkedEntityId })).toBeUndefined();
  invalidateAll();
});
