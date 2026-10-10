import { describe, expect, test } from "bun:test";

import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";

import { baseRules, charactersInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { createTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";

/** An inventory entry's request to carry its item: unequipped, without charges. */
const CARRIED = { equipped: false, location: null, remainingCharges: null, totalCharges: null, weaponSet: null };

/** What opens each character's private notes, which a reader who doesn't read them must not find. */
const NOTES = "Read by its editors and its Game Master alone:";

/**
 * A seeded player character of a ruleset of `rules`: a master of bonded creatures when the seeded ones have any, so
 * what core checks of a sheet covers its creatures'.
 */
async function findSeededCharacter(rules: BaseRules) {
  const characters = await db
    .select(getTableColumns(charactersInCharacter))
    .from(charactersInCharacter)
    .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, charactersInCharacter.rulesetId))
    .where(and(eq(rulesetsInRules.baseRules, rules), isNull(charactersInCharacter.deletedAt)))
    .orderBy(asc(charactersInCharacter.createdAt), asc(charactersInCharacter.id));
  const masterIds = new Set(characters.map((character) => character.parentCharacterId));
  const character =
    characters.find((candidate) => masterIds.has(candidate.id)) ??
    characters.find((candidate) => candidate.kind === "pc");
  if (!character) throw new Error(`No seeded character of ${rules}`);
  return character;
}

describe.each(baseRules.enumValues)("The %s module, as core runs its characters' operations", (rules) => {
  test("reads a character's private notes, its bonded creatures' too, only to a reader who reads them", async () => {
    const seeded = await findSeededCharacter(rules);
    const [record] = await Characters.update(db, { privateNotes: `${NOTES} ${seeded.id}` }, { id: seeded.id });
    const creatures = await Characters.findMany(db, { parentCharacterId: record.id }, Visibility.All);
    for (const { id } of creatures) await Characters.update(db, { privateNotes: `${NOTES} ${id}` }, { id });
    const input = await readCharacterInput(db, record);
    const bonded = await readBondedInputs(db, input, Visibility.All);

    const read = await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      return {
        blank: character.describeForMember(bonded, "blank"),
        partial: character.describeForMember(bonded, "partial"),
        shared: character.describe(bonded, "omit"),
        shown: character.describeForMember(bonded, "show"),
      };
    });

    for (const { id } of [record, ...creatures]) expect(JSON.stringify(read.shown)).toContain(`${NOTES} ${id}`);
    for (const reading of [read.partial, read.blank, read.shared]) expect(JSON.stringify(reading)).not.toContain(NOTES);
  });

  test("refuses an item of another ruleset in a character's inventory", async () => {
    const record = await findSeededCharacter(rules);
    const input = await readCharacterInput(db, record);
    const item = await createTestItem({ rulesetId: (await createTestRuleset(null, { baseRules: rules })).id });
    const own = await createTestItem({ rulesetId: record.rulesetId });
    invalidateSeededRuleset(record.rulesetId);

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      expect(() => character.planInventoryEntry({ itemId: item.id, request: CARRIED }, false)).toThrow(
        expect.objectContaining({
          message: `Item ${item.id} does not belong to the character's ruleset`,
          refusal: "invalid",
        }),
      );
      expect(character.planInventoryEntry({ itemId: own.id, request: CARRIED }, false)).toEqual({
        ...CARRIED,
        itemId: own.id,
      });
    });
  });

  test("refuses an ability score past the ruleset's bounds, a new character's or an edit's", async () => {
    const record = await findSeededCharacter(rules);
    const [{ abilityId }] = (await readCharacterInput(db, record)).rows.abilities;
    const refusal = expect.objectContaining({ message: "Request validation failed", refusal: "invalid" });

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const characters = Engine.for(scope).characters();
      const { max, min } = characters.describeCreation().scores;
      for (const score of [min - 1, max + 1]) {
        expect(() => characters.planAbilities({ [abilityId]: score })).toThrow(refusal);
        expect(() => characters.planCreate({ abilities: { [abilityId]: score }, raceId: record.raceId })).toThrow(
          refusal,
        );
      }
      expect(characters.planAbilities({ [abilityId]: max }).abilities).toEqual([{ abilityId, score: max }]);
      expect(
        characters.planCreate({ abilities: { [abilityId]: min }, raceId: record.raceId }).abilities,
      ).toContainEqual({ abilityId, score: min });
    });
  });
});
