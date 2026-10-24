import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import type { CharacterLanguage, Feat, Race } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLinks, Entities, Modifiers } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import type { Character } from "@/shared/relations.ts";
import { createCharacterAs, sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestKlassLevel, findKlassLevel, pickFeat } from "@/tests/support/dnd3.5/levels.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** Languages any seeded race or class picks freely, in the order a room fills: none of them granted, none secret. */
const FREE_PICKS = ["Abyssal", "Aquan", "Auran", "Celestial", "Draconic", "Ignan", "Infernal", "Terran"];

/** The names of described languages. */
function namesOf(languages: { name: string }[]) {
  return languages.map(({ name }) => name);
}

/** A new race of a new fork of the seed user's, whose one modifier on an ability is `adjustment`. */
async function createAdjustingRace(adjustment: { operator: string; target: string; value: string }) {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const [race] = await Entities.create<Race>(db, "races", {
    name: `Kin ${uniqueId()}`,
    size: "Medium",
    baseSpeed: 30,
    rulesetId: fork.id,
  });
  await Modifiers.create(db, { sourceId: race.id, sourceType: "races", valueType: "number", ...adjustment });
  RulesetViews.invalidate(fork.id);
  return { fork, race };
}

/** A new character of the seed user's: of the race `raceId`, every ability at 10 but those `scores` gives by name. */
async function createOfRace(raceId: string, scores: Record<string, number> = {}, rulesetId?: string) {
  const { abilityMap } = await getSeedCtx();
  const abilities = Object.fromEntries(Object.entries(abilityMap).map(([name, id]) => [id, scores[name] ?? 10]));
  return await createCharacterAs(makeSession(), { raceId, abilities, ...(rulesetId && { rulesetId }) });
}

/** What the character speaks and may pick, with its picks `picks` (by name), as the engine answers it. */
async function describeLanguages(record: Character, picks: string[] = []) {
  const { langMap } = await getSeedCtx();
  return await languagesOf(record, (engine) =>
    engine.describeLinkPicks(
      "languages",
      picks.map((name) => langMap[name]),
    ),
  );
}

/** The engine bound to the character, from its rows, in its ruleset's view. */
async function languagesOf<T>(
  record: Character,
  run: (engine: ReturnType<ReturnType<typeof Engine.for>["character"]>) => T,
) {
  return await withRulesetScope(db, record.rulesetId, async (scope) =>
    run(Engine.for(scope).character(await readCharacterInput(db, record))),
  );
}

/** A new character of the seed user's: of the core race `race`, every ability at 10 but those `scores` gives by name. */
async function newCharacter(race: string, scores: Record<string, number> = {}, rulesetId?: string) {
  const { raceMap } = await getSeedCtx();
  return await createOfRace(raceMap.pc[race], scores, rulesetId);
}

/** What the character's languages edit to `picks` (by name) stores, by name, as the engine plans it. */
async function planLanguages(record: Character, picks: string[]) {
  const { langMap } = await getSeedCtx();
  const plan = await languagesOf(record, (engine) =>
    engine.planLinkPicks(
      "languages",
      picks.map((name) => langMap[name]),
    ),
  );
  const names = new Map(Object.entries(langMap).map(([name, id]) => [id, name]));
  return plan.entityIds.map((id) => names.get(id));
}

/** How many languages the character picks: the picks its picker takes before it offers none. */
async function roomOf(record: Character) {
  for (let room = 0; room < FREE_PICKS.length; room++)
    if ((await describeLanguages(record, FREE_PICKS.slice(0, room))).options.length === 0) return room;
  return FREE_PICKS.length;
}

describe("A character's languages", () => {
  test("are those its race's modifiers grant from its creation, which no row stores", async () => {
    const dwarf = await newCharacter("Dwarf");
    const sheet = await sheetOf(dwarf.id);

    expect(namesOf(sheet.identity.physiology.languages)).toEqual(["Common", "Dwarven"]);
    expect(namesOf((await describeLanguages(dwarf)).automatic)).toEqual(["Common", "Dwarven"]);
    expect(await CharacterLinks.findMany<CharacterLanguage>(db, { link: "languages", characterId: dwarf.id })).toEqual(
      [],
    );
  });

  test("take any language but a secret one, a pick per point of the permanent Intelligence modifier", async () => {
    const { langMap } = await getSeedCtx();
    const dwarf = await newCharacter("Dwarf", { Intelligence: 14 });
    const described = await describeLanguages(dwarf);

    // No race lists the languages it picks from: a dwarf picks Sylvan or Abyssal as well as Giant
    const others = Object.keys(langMap).filter((name) => !["Common", "Druidic", "Dwarven"].includes(name));
    expect(namesOf(described.options)).toEqual(others.toSorted((a, b) => a.localeCompare(b)));
    expect(namesOf(described.options)).toEqual(expect.arrayContaining(["Abyssal", "Giant", "Sylvan"]));
    expect(await roomOf(dwarf)).toBe(2);
    // What its race grants isn't a pick
    expect(await planLanguages(dwarf, ["Common", "Sylvan", "Abyssal"])).toEqual(["Sylvan", "Abyssal"]);
  });

  test("count the Intelligence its race adjusts, but no other bonus to it", async () => {
    // A half-orc's -2 Intelligence: 12 is 10, which gives no pick
    const halfOrc = await newCharacter("Half-Orc", { Intelligence: 12 });
    expect(await roomOf(halfOrc)).toBe(0);
    expect(planLanguages(halfOrc, ["Draconic"])).rejects.toMatchObject({
      message: expect.stringContaining("Draconic is past the languages the character may pick"),
    });

    // An enhancement of its own to Intelligence (an item's, a spell's) gives none either
    await Modifiers.create(db, {
      sourceId: halfOrc.id,
      sourceType: "characters",
      target: "abilities.intelligence.misc",
      operator: "add",
      value: "4",
      valueType: "number",
    });
    expect(await roomOf(halfOrc)).toBe(0);
    expect(await roomOf(await newCharacter("Half-Orc", { Intelligence: 14 }))).toBe(1);
  });

  test.each([
    // To every ability: 14 is 10, no pick
    [{ target: "abilities.*.misc", operator: "add", value: "-4" }, 10, 0],
    // Subtracted: 14 is 12, a pick
    [{ target: "abilities.intelligence.misc", operator: "subtract", value: "2" }, 12, 1],
  ])("count the race's adjustment as the sheet applies it: %p", async (adjustment, intelligence, picks) => {
    const { fork, race } = await createAdjustingRace(adjustment);
    const character = await createOfRace(race.id, { Intelligence: 14 }, fork.id);

    const sheet = await sheetOf(character.id);
    expect(sheet.abilities.find((ability) => ability.key === "intelligence")?.total).toBe(intelligence);
    expect(await roomOf(character)).toBe(picks);
  });

  test("refuse a new pick past their room, naming it, and offer none once it's full", async () => {
    const dwarf = await newCharacter("Dwarf", { Intelligence: 12 });
    expect((await describeLanguages(dwarf, ["Giant"])).options).toEqual([]);

    expect(planLanguages(dwarf, ["Giant", "Orc"])).rejects.toMatchObject({
      message: expect.stringContaining("Orc is past the languages the character may pick (1 picked, room for 1)"),
      refusal: "invalid",
    });
  });

  test("never take a secret language, which only a modifier grants: a druid's Druidic", async () => {
    const { klassMap } = await getSeedCtx();
    const human = await newCharacter("Human", { Intelligence: 14 });
    expect(namesOf((await describeLanguages(human)).options)).not.toContain("Druidic");
    expect(planLanguages(human, ["Druidic"])).rejects.toMatchObject({
      message: expect.stringContaining("Druidic is a secret language"),
      refusal: "invalid",
    });

    // A druid's first level grants it, which no pick stores
    await addCharacterLevel(human.id, (await findKlassLevel(klassMap.pc["Druid"], 1))!.id);
    expect(namesOf((await describeLanguages(human)).automatic)).toEqual(["Common", "Druidic"]);
    expect(await planLanguages(human, ["Druidic", "Sylvan"])).toEqual(["Sylvan"]);
  });

  test("take a pick of any kind but a secret one per Speak Language rank", async () => {
    const { klassMap, skillMap } = await getSeedCtx();
    const bard = await newCharacter("Human");
    const level = await findKlassLevel(klassMap.pc["Bard"], 1);
    await addCharacterLevel(bard.id, level!.id, { skills: [{ skillId: skillMap["Speak Language"], rank: 2 }] });

    // Its Intelligence of 10 gives none: both are its ranks'
    expect(await roomOf(bard)).toBe(2);
    expect(namesOf((await describeLanguages(bard, ["Sylvan"])).options)).not.toContain("Druidic");
    expect(await planLanguages(bard, ["Sylvan", "Aquan"])).toEqual(["Sylvan", "Aquan"]);
    expect(planLanguages(bard, ["Sylvan", "Aquan", "Auran"])).rejects.toMatchObject({
      message: expect.stringContaining("Auran"),
    });
  });

  test("take one more pick per extra pick a class level's modifier adds", async () => {
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await Modifiers.create(db, {
      sourceId: klassLevel.id,
      sourceType: "class_levels",
      target: "languages.extrapicks",
      operator: "add",
      value: "1",
      valueType: "number",
    });
    RulesetViews.invalidate(fork.id);
    const human = await newCharacter("Human", {}, fork.id);
    expect(await roomOf(human)).toBe(0);
    await addCharacterLevel(human.id, klassLevel.id);

    expect(await roomOf(human)).toBe(1);
    expect(await planLanguages(human, ["Aquan"])).toEqual(["Aquan"]);
  });

  test("are a feat's too, which its modifier grants without a pick", async () => {
    const { aptMap } = await getSeedCtx();
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    const [feat] = await Entities.create<Feat>(db, "feats", { name: `Sylvan Lore ${uniqueId()}`, rulesetId: fork.id });
    await Modifiers.create(db, {
      sourceId: feat.id,
      sourceType: "feats",
      target: "languages.sylvan.known",
      operator: "set",
      value: "true",
      valueType: "boolean",
    });
    RulesetViews.invalidate(fork.id);
    const character = await pickFeat(SEED_USER_ID, fork.id, feat.id, aptMap["General"]);

    expect(namesOf((await describeLanguages(character)).automatic)).toEqual(["Common", "Sylvan"]);
    const sheet = await sheetOf(character.id);
    expect(namesOf(sheet.identity.physiology.languages)).toEqual(["Common", "Sylvan"]);
    expect(await planLanguages(character, ["Sylvan"])).toEqual([]);
  });

  test("keep the picks a character has past its room, and drop any, but refuse a new one", async () => {
    const { langMap } = await getSeedCtx();
    const human = await newCharacter("Human");
    for (const name of ["Abyssal", "Aquan"])
      await CharacterLinks.create(db, "languages", { characterId: human.id, languageId: langMap[name] });

    // Its picks stand, and the picker offers none more
    const described = await describeLanguages(human, ["Abyssal", "Aquan"]);
    expect(namesOf(described.picks)).toEqual(["Abyssal", "Aquan"]);
    expect(described.options).toEqual([]);
    expect(await planLanguages(human, ["Abyssal", "Aquan"])).toEqual(["Abyssal", "Aquan"]);
    // A removal always saves
    expect(await planLanguages(human, ["Aquan"])).toEqual(["Aquan"]);
    expect(await planLanguages(human, [])).toEqual([]);
    expect(planLanguages(human, ["Abyssal", "Aquan", "Auran"])).rejects.toMatchObject({
      message: expect.stringContaining("Auran"),
    });
  });
});
