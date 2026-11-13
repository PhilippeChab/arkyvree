/**
 * Writes every active character's sheet, as the engine describes it with its validation, to a folder, one file per
 * character: what a change to how sheets are built is compared by, before and after it, on a copy of a database.
 *
 * Usage: bun --env-file=<file> scripts/ops/snapshot-sheets.ts <folder>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isNull } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character } from "@/shared/relations.ts";

/** A character's sheet, or why it failed to build. */
async function describeSheet(character: Character): Promise<{ failed: boolean; sheet: unknown }> {
  try {
    const sheet = await withRulesetScope(db, character.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, character))
        .describe([], "hide"),
    );
    return { failed: false, sheet };
  } catch (error) {
    return { failed: true, sheet: { failed: error instanceof Error ? error.message : String(error) } };
  }
}

async function main() {
  const [folder] = process.argv.slice(2);
  if (!folder) throw new Error("Usage: snapshot-sheets.ts <folder>");
  mkdirSync(folder, { recursive: true });
  const rows = await db
    .select(StoredCharacters.buildColumns())
    .from(charactersInCharacter)
    .where(isNull(charactersInCharacter.deletedAt));
  const index: { characterId: string; failed: boolean; rulesetId: string }[] = [];
  for (const row of rows) {
    const character = StoredCharacters.toCharacter(row);
    // A bonded creature's sheet is its master's
    if (character.parentCharacterId) continue;
    const { failed, sheet } = await describeSheet(character);
    writeFileSync(join(folder, `${character.id}.json`), JSON.stringify(sheet, null, 1));
    index.push({ characterId: character.id, failed, rulesetId: character.rulesetId });
  }
  writeFileSync(join(folder, "index.json"), JSON.stringify({ characters: index }, null, 1));
  const failures = index.filter((entry) => entry.failed).length;
  console.log(`${index.length} sheets written to ${folder} (${failures} failed to build)`);
  process.exit(0);
}

await main();
