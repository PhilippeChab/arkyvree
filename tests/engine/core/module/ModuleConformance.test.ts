import { describe, expect, test } from "bun:test";

import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";

import { baseRules, charactersInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Characters, Languages, Visibility } from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { createTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";

/** An inventory entry's request to carry its item: unequipped, without charges. */
const CARRIED = { equipped: false, location: null, remainingCharges: null, totalCharges: null, weaponSets: [] };

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
  test("reads a character's private notes, and each bonded creature's on its own sheet, only to a reader who reads them", async () => {
    const seeded = await findSeededCharacter(rules);
    const [record] = await Characters.update(db, { privateNotes: `${NOTES} ${seeded.id}` }, { id: seeded.id });
    const creatures = await Characters.findMany(db, { parentCharacterId: record.id }, Visibility.All);
    for (const { id } of creatures) await Characters.update(db, { privateNotes: `${NOTES} ${id}` }, { id });
    const input = await readCharacterInput(db, record);
    const bonded = await readBondedInputs(db, input, Visibility.All);

    const read = await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      // Each creature's own sheet, which holds its notes; its master's shows it without them
      const creature = (reading: "blank" | "show") =>
        bonded.map((input) => Engine.for(scope).character(input).describeForMember([], reading));
      return {
        blank: [character.describeForMember(bonded, "blank"), ...creature("blank")],
        partial: [character.describeForMember(bonded, "partial")],
        shared: [character.describe(bonded, "omit")],
        shown: character.describeForMember(bonded, "show"),
        shownCreatures: creature("show"),
      };
    });

    expect(JSON.stringify(read.shown)).toContain(`${NOTES} ${record.id}`);
    for (const id of creatures.map((creature) => creature.id)) {
      expect(JSON.stringify(read.shown)).not.toContain(`${NOTES} ${id}`);
      expect(JSON.stringify(read.shownCreatures)).toContain(`${NOTES} ${id}`);
    }
    for (const reading of [read.partial, read.blank, read.shared]) expect(JSON.stringify(reading)).not.toContain(NOTES);
  });

  test("names none of a partly seen character's build: its card's chips its partial ones, its summary no tracks", async () => {
    const seeded = await findSeededCharacter(rules);
    const input = await readCharacterInput(db, seeded);
    const bonded = await readBondedInputs(db, input, Visibility.All);
    const levels = await CharacterLevels.findMany(db, { characterIds: [seeded.id] });

    const read = await withRulesetScope(db, seeded.rulesetId, async (scope) => {
      const engine = Engine.for(scope);
      const character = engine.character(input);
      return {
        card: engine.characters().describeCard(seeded, levels, false),
        partialCard: engine.characters().describeCard(seeded, levels, true),
        partial: character.describeForMember(bonded, "partial"),
        shown: character.describeForMember(bonded, "show"),
      };
    });

    expect(read.card.chips.some((chip) => !chip.partial)).toBe(true);
    expect(read.partialCard).toEqual({ chips: read.card.chips.filter((chip) => chip.partial) });
    for (const { name } of read.shown.summary.tracks) expect(JSON.stringify(read.partialCard)).not.toContain(name);
    expect(read.shown.summary.tracks.length).toBeGreaterThan(0);
    expect(read.partial.summary.tracks).toEqual([]);
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

  test("refuses a language of another ruleset, or one sent twice, and never one a character keeps", async () => {
    const record = await findSeededCharacter(rules);
    const input = await readCharacterInput(db, record);
    const kept = input.rows.languages.map(({ languageId }) => languageId);
    const otherRuleset = await createTestRuleset(null, { baseRules: rules });
    const [{ id: foreign }] = await Languages.create(db, {
      rulesetId: otherRuleset.id,
      name: "Foreign",
      type: "Common",
    });

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      const refusal = expect.objectContaining({
        message: `Language ${foreign} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
      expect(() => character.planLanguages([...kept, foreign])).toThrow(refusal);
      expect(() => character.describeLanguages([foreign])).toThrow(refusal);
      if (kept.length > 0) {
        expect(() => character.planLanguages([kept[0], kept[0]])).toThrow(
          expect.objectContaining({ refusal: "invalid" }),
        );
      }
      // What it speaks without a pick isn't stored: what it stores is among what it sent
      const { languageIds } = character.planLanguages(kept);
      expect(languageIds.every((id) => kept.includes(id))).toBe(true);
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
        expect(() => characters.planStart({ abilities: { [abilityId]: score }, raceId: record.raceId })).toThrow(
          refusal,
        );
      }
      expect(characters.planAbilities({ [abilityId]: max }).abilities).toEqual([{ abilityId, score: max }]);
      expect(characters.planStart({ abilities: { [abilityId]: min }, raceId: record.raceId }).abilities).toContainEqual(
        { abilityId, score: min },
      );
    });
  });

  test("plans a new character from every field its form describes, an optional one left out, none it doesn't", async () => {
    const record = await findSeededCharacter(rules);
    const formFields = Engine.rules()
      .describeAll()
      [rules].characterForm.sections.flatMap((section) => (section.kind === "fields" ? section.lines.flat() : []))
      .filter((item) => "key" in item);
    // Its keys are its form's values' names, beside the form's own and the race picker's query's: one each, a plain
    // name, which the form's paths read as it is
    const keys = formFields.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(["abilities", "limit", "name", "notes", "page", "raceId", "rulesetId", "search"]).not.toContain(key);
      expect(key).toMatch(/^\w+$/);
    }
    const given = (field: (typeof formFields)[number]): number | string => {
      if (field.kind === "number") return field.start ?? field.min;
      if (field.kind === "select") return field.options[0];
      return `Given ${field.key}`;
    };
    const fields = Object.fromEntries(formFields.map((field) => [field.key, given(field)]));
    const required = Object.fromEntries(
      formFields.filter((field) => "required" in field && field.required).map((field) => [field.key, given(field)]),
    );
    const refusal = expect.objectContaining({ refusal: "invalid" });

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const characters = Engine.for(scope).characters();
      const start = { abilities: {}, raceId: record.raceId };
      const written = Object.values(characters.planCreate({ ...start, fields }).columns);
      for (const value of Object.values(fields)) expect(written).toContain(value);
      // A field its form doesn't require can be left out
      expect(() => characters.planCreate({ ...start, fields: required })).not.toThrow();
      expect(() => characters.planCreate({ ...start, fields: { ...fields, unknownField: 1 } })).toThrow(refusal);
    });
  });
});
