import type { CharacterRows, DetailedCharacterInterface } from "@/engine/core/module/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db, type Db, memoizeRequest, withCowContext } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";

import { readCharacterRows } from "./characterRows.ts";

/** What a module makes a character with: the one part of its contract a build needs. */
interface CharacterFactory<C extends DetailedCharacterInterface, K extends string> {
  createDetailedCharacter(record: Character, kind?: K): C;
}

/**
 * A bonded creature's master, built once a request: its sheet is what the creature's derives from. In the creature's
 * scope, which is its master's ruleset's.
 */
async function buildMaster<C extends DetailedCharacterInterface, K extends string>(
  module: CharacterFactory<C, K>,
  masterId: string,
  scope: RulesetScope,
): Promise<C> {
  return await memoizeRequest(`bonded-master:${masterId}`, async () => {
    const masterRecord = await Characters.findOne(db, { id: masterId }, Visibility.All);
    if (!masterRecord) throw new Error(`Bonded's master not found: ${masterId}`);
    return await buildCharacter(module, masterRecord, { scope });
  });
}

/**
 * Runs `fn` in the scope the caller holds, when it's the character's ruleset's: its copy-on-write context and its view,
 * without reading the ruleset or composing its view again. Without one, `fn` runs in a scope of its own.
 */
async function inScope<T>(
  database: Db,
  rulesetId: string,
  scope: RulesetScope | undefined,
  fn: (scope: RulesetScope) => Promise<T>,
) {
  if (scope?.ruleset.id !== rulesetId) return await withRulesetScope(database, rulesetId, fn);
  return await withCowContext(scope.rulesetData.cow, () => fn(scope));
}

/**
 * A character, built: made by its ruleset's module (`module`, whose type its character keeps), of its `kind` (a bonded
 * creature's), with a level-up's `projected` levels and picks, in `scope` when the caller holds the character's ruleset's.
 * Its rows are read through `database` (a transaction's, to see what it wrote), in that scope, unless the caller read
 * them (`rows`: one read for several builds of the character); a bonded creature's master is built first. The one way
 * the server builds a character: the module's build reads nothing.
 */
export async function buildCharacter<C extends DetailedCharacterInterface, K extends string>(
  module: CharacterFactory<C, K>,
  record: Character,
  {
    database = db,
    kind,
    projected,
    rows,
    scope,
  }: {
    database?: Db;
    kind?: K;
    projected?: Parameters<C["build"]>[2];
    rows?: CharacterRows;
    scope?: RulesetScope;
  } = {},
): Promise<C> {
  return await inScope(database, record.rulesetId, scope, async (view) => {
    const character = module.createDetailedCharacter(record, kind);
    const master = record.parentCharacterId ? await buildMaster(module, record.parentCharacterId, view) : undefined;
    character.build(rows ?? (await readCharacterRows(database, record)), view, projected, master);
    return character;
  });
}
