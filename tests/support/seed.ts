import { getSeedContext, type SeedContext } from "@/database/seeders/dnd3.5/characters/seedContext.ts";
import type { ViewEntities } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters, Entities, fetchEveryPage, Rulesets } from "@/server/repositories/index.ts";

/** An item, as the view registers it. */
type Item = ViewEntities["items"];

let seedContext: Promise<SeedContext> | undefined;

/** An id no row has: for "not found" cases. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Ids of the seeded D&D 3.5 content, by name. Loaded once per test process. */
export function getSeedCtx() {
  seedContext ??= getSeedContext(db);
  return seedContext;
}

/** A short random suffix that keeps names and emails unique between tests. */
export function uniqueId() {
  return Math.random().toString(36).slice(2, 11);
}

/** An item of the ruleset's own that is neither a template nor a variant: one of type "Other". */
export async function findPlainItem(rulesetId: string) {
  const items = await fetchEveryPage((pagination) =>
    Entities.findPage<Item>(
      db,
      { entityType: "items", rulesetId, childOnly: true, columns: { isTemplate: false } },
      pagination,
    ),
  );
  const item = items.find((candidate) => candidate.sourceItemId === null && candidate.type === "Other");
  if (!item) throw new Error(`The ruleset ${rulesetId} has no plain item`);
  return item;
}

/** A seeded character of the seed user's, by name. */
export async function findSeededCharacter(name: string) {
  const { items } = await Characters.findPage(
    db,
    { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly },
    { limit: 100, page: 1 },
  );
  const character = items.find((c) => c.name === name);
  if (!character) throw new Error(`Seeded character ${name} not found`);
  return character;
}

/** A seeded ruleset, by its name. */
export async function findSeededRuleset(name: string) {
  const ruleset = await Rulesets.findOne(db, { name });
  if (!ruleset) throw new Error(`Seeded ruleset ${name} not found`);
  return ruleset;
}
