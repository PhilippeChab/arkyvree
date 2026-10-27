import { describe, expect, test } from "bun:test";

import { and, asc, eq, isNull } from "drizzle-orm";

import { charactersInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import type { PrivateNotes } from "@/engine/core/module/index.ts";
import { Engine } from "@/engine/index.ts";
import type { Language } from "@/engine/rulesets/dnd3.5/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterAdvancements, Characters, Entities, Visibility } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/characterInputs.ts";
import { BASE_RULES_OPTIONS, type BaseRules } from "@/shared/enums.ts";
import { createTestItem } from "@/tests/support/dnd3.5/items.ts";
import { createTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** An inventory entry's request to carry its item: unequipped, without charges. */
const CARRIED = { equipped: false, location: null, remainingCharges: null, totalCharges: null, groups: [] };

/** What opens each character's private notes, which a reader who doesn't read them must not find. */
const NOTES = "Read by its editors and its Game Master alone:";

/**
 * A seeded player character of a ruleset of `rules`: a master of bonded creatures when the seeded ones have any, so
 * what core checks of a sheet covers its creatures'.
 */
async function findSeededCharacter(rules: BaseRules) {
  const characters = await db
    .select({
      id: charactersInCharacter.id,
      kind: charactersInCharacter.kind,
      parentCharacterId: charactersInCharacter.parentCharacterId,
    })
    .from(charactersInCharacter)
    .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, charactersInCharacter.rulesetId))
    .where(and(eq(rulesetsInRules.baseRules, rules), isNull(charactersInCharacter.deletedAt)))
    .orderBy(asc(charactersInCharacter.createdAt), asc(charactersInCharacter.id));
  const masterIds = new Set(characters.map((character) => character.parentCharacterId));
  const character =
    characters.find((candidate) => masterIds.has(candidate.id)) ??
    characters.find((candidate) => candidate.kind === "pc");
  if (!character) throw new Error(`No seeded character of ${rules}`);
  return (await Characters.findOne(db, { id: character.id }, Visibility.All))!;
}

describe.each([...BASE_RULES_OPTIONS])("The %s module, as core runs its characters' operations", (rules) => {
  test("reads a character's private notes, and each bonded creature's on its own sheet, only to a reader who reads them", async () => {
    const seeded = await findSeededCharacter(rules);
    const [record] = await Characters.update(db, { privateNotes: `${NOTES} ${seeded.id}` }, { id: seeded.id });
    const creatures = await Characters.findMany(db, { parentCharacterId: record.id }, Visibility.All);
    for (const { id } of creatures) await Characters.update(db, { privateNotes: `${NOTES} ${id}` }, { id });
    const input = await readCharacterInput(db, record);
    const children = await readChildInputs(db, input, Visibility.All);

    const read = await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      // Each creature's own sheet, which holds its notes; its master's shows it without them
      const creature = (reading: PrivateNotes) =>
        children.map((input) => Engine.for(scope).character(input).describeForMember([], reading));
      return {
        hidden: [character.describeForMember(children, "hide"), ...creature("hide")],
        partial: [character.describeForMember(children, "partial")],
        shared: [character.describe(children, "hide")],
        shown: character.describeForMember(children, "show"),
        shownCreatures: creature("show"),
      };
    });

    expect(JSON.stringify(read.shown)).toContain(`${NOTES} ${record.id}`);
    for (const id of creatures.map((creature) => creature.id)) {
      expect(JSON.stringify(read.shown)).not.toContain(`${NOTES} ${id}`);
      expect(JSON.stringify(read.shownCreatures)).toContain(`${NOTES} ${id}`);
    }
    for (const reading of [read.partial, read.hidden, read.shared])
      expect(JSON.stringify(reading)).not.toContain(NOTES);
  });

  test("names none of a partly seen character's build: its card's chips its partial ones, its summary no tracks", async () => {
    const seeded = await findSeededCharacter(rules);
    const input = await readCharacterInput(db, seeded);
    const children = await readChildInputs(db, input, Visibility.All);
    const levels = await CharacterAdvancements.findMany(db, { characterIds: [seeded.id] });

    const read = await withRulesetScope(db, seeded.rulesetId, async (scope) => {
      const engine = Engine.for(scope);
      const character = engine.character(input);
      return {
        card: engine.characters().describeCard(seeded, levels, false),
        partialCard: engine.characters().describeCard(seeded, levels, true),
        partial: character.describeForMember(children, "partial"),
        shown: character.describeForMember(children, "show"),
      };
    });

    expect(read.card.chips.some((chip) => !chip.partial)).toBe(true);
    expect(read.partialCard).toEqual({ chips: read.card.chips.filter((chip) => chip.partial) });
    for (const { name } of read.shown.summary.tracks) expect(JSON.stringify(read.partialCard)).not.toContain(name);
    expect(read.shown.summary.tracks.length).toBeGreaterThan(0);
    expect(read.partial.summary.tracks).toEqual([]);
  });

  test("answers no share token, whatever the reading, and a partial reading as core's allowlist: its identity's block alone", async () => {
    const seeded = await findSeededCharacter(rules);
    const shareToken = crypto.randomUUID();
    const [record] = await Characters.update(db, { shareToken }, { id: seeded.id });
    const input = await readCharacterInput(db, record);
    const children = await readChildInputs(db, input, Visibility.All);

    const read = await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      const partial = character.describeForMember(children, "partial");
      const shown = character.describe(children);
      return { partial, shown, readings: [partial, shown, character.describe(children, "hide")] };
    });

    for (const reading of read.readings) {
      expect(reading.shareToken).toBeNull();
      expect(JSON.stringify(reading)).not.toContain(shareToken);
    }
    expect(Object.keys(read.partial)).toEqual(Object.keys(read.shown));
    expect(read.partial).toMatchObject({ id: record.id, name: record.name, validation: { valid: true, issues: [] } });
    expect({ ...read.partial.requirements, ...read.partial.modifiers }).toEqual({});
    expect(read.partial.blocks.map((block) => block.kind)).toEqual(["fields"]);
  });

  test("asks its summary's confirmations as the client's own ask theirs: what follows, then that it's for good", async () => {
    const seeded = await findSeededCharacter(rules);
    const input = await readCharacterInput(db, seeded);
    const children = await readChildInputs(db, input, Visibility.All);

    const { words } = await withRulesetScope(
      db,
      seeded.rulesetId,
      async (scope) => Engine.for(scope).character(input).describeForMember(children, "show").summary,
    );

    for (const message of [words.deleteMessage, words.removeLastMessage]) {
      expect(message).toMatch(/^Are you sure you want to [^?]+\?/);
      expect(message).toEndWith("This action cannot be undone.");
    }
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
    const kept = input.rows.links.speaks.map(({ entityId }) => entityId);
    const otherRuleset = await createTestRuleset(null, { baseRules: rules });
    const [{ id: foreign }] = await Entities.create<Language>(db, "languages", {
      rulesetId: otherRuleset.id,
      name: "Foreign",
      fields: { [LANGUAGE_TYPE]: "Common" },
    });

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const character = Engine.for(scope).character(input);
      const refusal = expect.objectContaining({
        message: `Language ${foreign} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
      expect(() => character.planLinkPicks("speaks", [...kept, foreign])).toThrow(refusal);
      expect(() => character.describeLinkPicks("speaks", [foreign])).toThrow(refusal);
      if (kept.length > 0) {
        expect(() => character.planLinkPicks("speaks", [kept[0], kept[0]])).toThrow(
          expect.objectContaining({ refusal: "invalid" }),
        );
      }
      // What it speaks without a pick isn't stored: what it stores is among what it sent
      const { entityIds } = character.planLinkPicks("speaks", kept);
      expect(entityIds.every((id) => kept.includes(id))).toBe(true);
    });
  });

  test("refuses an ability score past the ruleset's bounds, a new character's or an edit's", async () => {
    const record = await findSeededCharacter(rules);
    const [{ entityId: abilityId }] = (await readCharacterInput(db, record)).rows.links.score;
    const refusal = expect.objectContaining({ message: "Request validation failed", refusal: "invalid" });

    await withRulesetScope(db, record.rulesetId, async (scope) => {
      const characters = Engine.for(scope).characters();
      const { max, min } = characters.describeCreation("score").scores;
      for (const score of [min - 1, max + 1]) {
        expect(() => characters.planScores("score", { [abilityId]: score })).toThrow(refusal);
        const start = { picks: { race: record.links.race }, scores: { score: { [abilityId]: score } } };
        expect(() => characters.planStart(start)).toThrow(refusal);
      }
      expect(characters.planScores("score", { [abilityId]: max }).links).toEqual([
        { entityId: abilityId, amount: max },
      ]);
      const start = { picks: { race: record.links.race }, scores: { score: { [abilityId]: min } } };
      expect(characters.planStart(start).links.score).toContainEqual({ entityId: abilityId, amount: min });
    });
  });

  test("describes the links a kind's page edits by the role its storage declares edited, to their kind", () => {
    const edited = Engine.storage().editedLinks();
    const described = Engine.rules()
      .describeAll()
      [rules].kinds.flatMap(({ links, type }) => (links ? [[links.role, { from: type, to: links.type }]] : []));
    expect(described.length).toBeGreaterThan(0);
    expect(edited).toEqual(new Map(described as [string, { from: string; to: string }][]));
  });

  test("says why a new entity's required list of links is refused, in words of its own", () => {
    const fields = Object.values(Engine.rules().describeAll()[rules].fields).flatMap((kind) => kind ?? []);
    const required = fields.flatMap((field) =>
      (field.input === "links" || field.input === "leveledLinks") && field.required !== undefined
        ? [field.required]
        : [],
    );
    for (const words of required) expect(words.trim()).not.toBe("");
  });

  test("plans a new character from every field its form describes, an optional one left out, none it doesn't", async () => {
    const record = await findSeededCharacter(rules);
    const formFields = Engine.rules()
      .describeAll()
      [rules].characterForm.sections.flatMap((section) => (section.kind === "fields" ? section.lines.flat() : []))
      .filter((item) => "key" in item);
    // Its keys are its form's values' names, beside the form's own and a creation pick's picker's query's: one each, a
    // plain name, which the form's paths read as it is
    const keys = formFields.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(["limit", "name", "notes", "page", "picks", "rulesetId", "scores", "search"]).not.toContain(key);
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
      const start = { picks: { race: record.links.race }, scores: {} };
      const plan = characters.planCreate({ ...start, fields });
      // Its fields' values, and every own column its rules' fields write (its row past its kind and single links)
      const { fields: values, kind: _kind, links: _links, ...own } = plan.row;
      const written = [...Object.values(values), ...Object.values(own)];
      for (const value of Object.values(fields)) expect(written).toContain(value);
      // A field its form doesn't require can be left out
      expect(() => characters.planCreate({ ...start, fields: required })).not.toThrow();
      expect(() => characters.planCreate({ ...start, fields: { ...fields, unknownField: 1 } })).toThrow(refusal);
    });
  });
});
