/**
 * What the rules know by name keeps working once a ruleset renames it, as a translation does: a fork of each seeded
 * base rules, its characters moved onto it, renames every entity of a kind (each copied into the fork, then renamed).
 * Every character's sheet, its bonded creatures' among them, must then read the same but for the names: a sheet that
 * changes shows a rule the engine found by its entity's name (a Small character's bonus to the skill the rules call
 * Hide, a familiar's stat block), which the translation would silently lose.
 */

import { describe, expect, test } from "bun:test";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { charactersInCharacter, entitiesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { EntityCopy, RulesetViews, withLockedRulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { type RulesetEntityType, Rulesets } from "@/server/repositories/index.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/**
 * The kinds a ruleset's author renames, and whose names the engine's own code could know: the many-rowed kinds whose
 * rows only rules name (spells, items) aren't among them. An ability, which no one renames, isn't either.
 */
const KINDS: RulesetEntityType[] = [
  "skills",
  "aptitudes",
  "races",
  "species",
  "backgrounds",
  "classes",
  "feats",
  "languages",
  "saves",
];

/** What a renamed entity's name gains, after its first word: nothing else of a sheet holds it. */
const MARK = "qqx";

/** A sheet's text as two of its builds compare: no copy's id or time of its own, no mark. */
function comparable(text: string) {
  return text
    .replaceAll(new RegExp(MARK, "gi"), "")
    .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
    .replaceAll(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?/g, "<time>");
}

/** The first values two sheets differ by, each with its place. */
function differencesOf(before: unknown, after: unknown, path = "", found: string[] = []): string[] {
  if (found.length >= 5 || JSON.stringify(before) === JSON.stringify(after)) return found;
  const nested = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  if (nested(before) && nested(after) && Array.isArray(before) === Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
      differencesOf(before[key], after[key], `${path}.${key}`, found);
  } else {
    found.push(`${path}: ${JSON.stringify(before)?.slice(0, 80)} => ${JSON.stringify(after)?.slice(0, 80)}`);
  }
  return found;
}

/** A fork of each seeded base rules that holds characters, each base's characters (bonded ones too) moved onto it. */
async function forkBasesWithCharacters() {
  const { session } = await createTestUser();
  const bases = (await Rulesets.findMany(db, { system: true })).filter((ruleset) => ruleset.rulesetId === null);
  const forks: string[] = [];
  for (const base of bases) {
    const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
    const moved = await db
      .update(charactersInCharacter)
      .set({ rulesetId: fork.id })
      .where(eq(charactersInCharacter.rulesetId, base.id))
      .returning({ id: charactersInCharacter.id });
    if (moved.length > 0) forks.push(fork.id);
  }
  return forks;
}

/** Every character's sheet, its bonded creatures' too, as text, by the character's name and kind. */
async function readSheets(rulesetIds: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select(StoredCharacters.buildColumns())
    .from(charactersInCharacter)
    .where(and(isNull(charactersInCharacter.deletedAt), inArray(charactersInCharacter.rulesetId, rulesetIds)));
  const sheets = new Map<string, string>();
  for (const row of rows) {
    const character = StoredCharacters.toCharacter(row);
    const sheet = await withRulesetScope(db, character.rulesetId, async (scope) =>
      Engine.for(scope)
        .character(await readCharacterInput(db, character))
        .describe([], "hide"),
    );
    sheets.set(`${character.name} (${character.kind}, ${character.id})`, JSON.stringify(sheet));
  }
  return sheets;
}

/**
 * Renames every entity of a kind a fork (`forkId`) inherits, as its author would: each copied into the fork (a first
 * edit's copy), then the copies renamed, their first word gaining the mark.
 */
async function renameAll(forkId: string, type: RulesetEntityType) {
  const inherited = await withRulesetScope(db, forkId, async (scope) =>
    scope.rulesetData.rows(type).filter((row) => row.ownerId === null && row.rulesetId !== forkId),
  );
  await withLockedRulesetScope(db, forkId, async (scope) => {
    for (const row of inherited) await EntityCopy.create(db, type, row.id, scope);
  });
  await db
    .update(entitiesInRules)
    .set({ name: sql`regexp_replace(${entitiesInRules.name}, '^(\\S+)', ${`\\1${MARK}`})` })
    .where(and(eq(entitiesInRules.rulesetId, forkId), eq(entitiesInRules.type, type)));
  RulesetViews.invalidate(forkId);
}

describe("a rule the rules know by name holds once a fork renames its entity", () => {
  test.each(KINDS)(
    "every %s renamed: every character's sheet reads the same but for the names",
    async (type) => {
      const forks = await forkBasesWithCharacters();
      expect(forks.length).toBeGreaterThanOrEqual(3);
      const before = await readSheets(forks);
      expect(before.size).toBeGreaterThan(20);

      for (const fork of forks) await renameAll(fork, type);

      const changed: Record<string, string[]> = {};
      for (const [character, text] of await readSheets(forks)) {
        const after = comparable(text);
        const was = comparable(before.get(character) ?? "null");
        if (after !== was) changed[character] = differencesOf(JSON.parse(was), JSON.parse(after));
      }
      expect(changed).toEqual({});
    },
    300_000,
  );
});
