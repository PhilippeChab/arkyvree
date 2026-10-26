/**
 * The bounds 3.5 holds what a user writes to (a class's hit die, a level's hit points, an ability score…), which the
 * generic tables can't know: each refused on every path a user writes it through (a service, or the route that
 * validates it), as the 3.5 module and the services hold them. And what the database still holds of a character: one
 * live child of a kind under a parent.
 */

import { afterAll, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import type { FieldsRequest } from "@/engine/core/module/index.ts";
import type { RulesetAbility } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { CharacterLinks, Characters, Entities } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { api, expectOk, expectStatus } from "@/tests/support/api.ts";
import { findLinks } from "@/tests/support/characters.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { createCharacterAs, createTestCharacter, postCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { findPlainItem } from "@/tests/support/dnd3.5/items.ts";
import {
  createSeedCharacter,
  createWizardWithFamiliar,
  FIGHTER_LEVELS,
  levelUp,
  picks,
} from "@/tests/support/dnd3.5/levelFixtures.ts";
import { levelEditPlan, levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import { findPicks } from "@/tests/support/dnd3.5/levels.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findSeededCharacter, getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_XP,
  CLASS_HD,
  ITEM_COST_GP,
  ITEM_WEIGHT,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A connection of its own, which holds a lock the test's call waits on. */
const lockPool = createTestPool();

const session = makeSession();

/** A refusal of a form's value by the rules, as a route's validation refuses it: invalid, naming its key. */
function invalidAt(category: string) {
  return { refusal: "invalid", issues: [expect.objectContaining({ category })] };
}

/** A new user's empty ruleset, with an ability and a save of it, which its classes' levels give a base bonus to. */
async function rulesetWithSave() {
  const { session: owner, ruleset } = await createTestUserAndRuleset();
  const rulesetId = ruleset.id;
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: "Dexterity",
    description: "Agility",
    rulesetId,
  });
  const save = await EntitiesService.createEntity(owner, rulesetId, "saves", { name: "Reflex", abilityId: ability.id });
  const klass = await EntitiesService.createEntity(owner, rulesetId, "classes", { name: "Rogue", hd: 6 });
  return { abilityId: ability.id, klassId: klass.id, owner, rulesetId, saveId: save.id };
}

afterAll(() => lockPool.end());

describe("a ruleset's entities", () => {
  test("refuses a hit die of 7, on a new class and an edit, and an edit that clears it", async () => {
    const { session: owner, ruleset } = await createTestUserAndRuleset();
    const refusal = invalidAt("hd");
    expect(
      EntitiesService.createEntity(owner, ruleset.id, "classes", { name: "Commoner", hd: 7 }),
    ).rejects.toMatchObject(refusal);
    const fighter = await EntitiesService.createEntity(owner, ruleset.id, "classes", { name: "Fighter", hd: 12 });
    expect(fighter.fields[CLASS_HD]).toBe(12);
    expect(
      EntitiesService.updateEntity(owner, ruleset.id, "classes", fighter.id, { name: "Fighter", hd: 7 }),
    ).rejects.toMatchObject(refusal);
    expect(
      EntitiesService.updateEntity(owner, ruleset.id, "classes", fighter.id, { name: "Fighter", hd: null }),
    ).rejects.toMatchObject(refusal);
    expect(
      (await EntitiesService.updateEntity(owner, ruleset.id, "classes", fighter.id, { name: "Fighter", hd: 4 })).fields[
        CLASS_HD
      ],
    ).toBe(4);
  });

  test("refuses a class level of 0, 21 or 1.5, and one without its number", async () => {
    const { klassId, owner, rulesetId } = await rulesetWithSave();
    for (const level of [0, 21, 1.5]) {
      expect(EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, { level })).rejects.toMatchObject(
        invalidAt("level"),
      );
    }
    expect(EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, {})).rejects.toMatchObject(
      invalidAt("level"),
    );
    expect(await EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, { level: 20 })).toMatchObject({
      position: 20,
    });
    expect(await EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, { level: 1 })).toMatchObject({
      position: 1,
    });
  });

  test("refuses a save's base bonus past 0 to 12, on a new level, an edit and the class's progression", async () => {
    const { klassId, owner, rulesetId, saveId } = await rulesetWithSave();
    for (const base of [-1, 13]) {
      expect(
        EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, {
          level: 1,
          saves: [{ base, saveId }],
        }),
      ).rejects.toMatchObject(invalidAt("saves.0.base"));
    }
    const level = await EntitiesService.createOwnedEntity(owner, rulesetId, "classes", klassId, {
      level: 1,
      saves: [{ base: 12, saveId }],
    });
    expect(await EntitiesService.getOwnedEntityWithOwner(rulesetId, "classes", level.id)).toMatchObject({
      saves: [{ base: 12, saveId }],
    });
    for (const base of [-1, 13]) {
      expect(
        EntitiesService.updateOwnedEntity(owner, rulesetId, "classes", klassId, level.id, {
          saves: [{ base, saveId }],
        }),
      ).rejects.toMatchObject(invalidAt("saves.0.base"));
      expect(
        EntitiesService.updateProgression(owner, rulesetId, "classes", klassId, {
          levels: [{ levelId: level.id, saves: [{ base, saveId }] }],
        }),
      ).rejects.toMatchObject(invalidAt("saves.0.base"));
    }
    await EntitiesService.updateProgression(owner, rulesetId, "classes", klassId, {
      levels: [{ levelId: level.id, saves: [{ base: 0, saveId }] }],
    });
    expect(await EntitiesService.getOwnedEntityWithOwner(rulesetId, "classes", level.id)).toMatchObject({
      saves: [{ base: 0, saveId }],
    });
  });

  test("refuses a race's base speed of 0, a size not among its options, and an edit that clears either", async () => {
    const { session: owner, ruleset } = await createTestUserAndRuleset();
    const elf = { name: "Elf", size: "Medium", baseSpeed: 30 };
    expect(EntitiesService.createEntity(owner, ruleset.id, "races", { ...elf, baseSpeed: 0 })).rejects.toMatchObject(
      invalidAt("baseSpeed"),
    );
    expect(
      EntitiesService.createEntity(owner, ruleset.id, "races", { ...elf, size: "Gigantic" }),
    ).rejects.toMatchObject(invalidAt("size"));
    // A new race left without them takes their defaults: a medium one, of 30 feet
    const created = await EntitiesService.createEntity(owner, ruleset.id, "races", { name: "Elf" });
    expect(created.fields).toMatchObject({ [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 });
    const edits: [string, Record<string, unknown>][] = [
      ["baseSpeed", { baseSpeed: 0 }],
      ["baseSpeed", { baseSpeed: Number.MAX_SAFE_INTEGER + 1 }],
      ["baseSpeed", { baseSpeed: null }],
      ["size", { size: null }],
      ["size", { size: "" }],
      ["size", { size: "Gigantic" }],
    ];
    for (const [key, edit] of edits) {
      expect(
        EntitiesService.updateEntity(owner, ruleset.id, "races", created.id, { ...elf, ...edit }),
      ).rejects.toMatchObject(invalidAt(key));
    }
    expect(
      await EntitiesService.updateEntity(owner, ruleset.id, "races", created.id, {
        ...elf,
        size: "Tiny",
        baseSpeed: 1,
      }),
    ).toMatchObject({ fields: { [RACE_SIZE]: "Tiny", [RACE_BASE_SPEED]: 1 } });
  });

  test("refuses an item's weight or cost below none or past what it holds exactly, and keeps them to two decimals", async () => {
    const { session: owner, ruleset } = await createTestUserAndRuleset();
    for (const key of ["weight", "costGp"]) {
      expect(
        EntitiesService.createEntity(owner, ruleset.id, "items", { name: "Gem", [key]: -0.01 }),
      ).rejects.toMatchObject(invalidAt(key));
    }
    const gem = await EntitiesService.createEntity(owner, ruleset.id, "items", { name: "Gem", weight: 0, costGp: 0 });
    expect(gem.fields).toMatchObject({ [ITEM_WEIGHT]: 0, [ITEM_COST_GP]: 0 });
    for (const key of ["weight", "costGp"]) {
      expect(
        EntitiesService.updateEntity(owner, ruleset.id, "items", gem.id, { name: "Gem", [key]: -1 }),
      ).rejects.toMatchObject(invalidAt(key));
      expect(
        EntitiesService.duplicateEntity(owner, ruleset.id, "items", gem.id, { name: "Other Gem", [key]: -1 }),
      ).rejects.toMatchObject(invalidAt(key));
    }
    // Every number field holds what it keeps exactly, to its places, and no more: none past it is stored rounded off
    for (const key of ["weight", "costGp"]) {
      for (const value of [1e21, 1e300, Number("12345678901234567.89")]) {
        expect(
          EntitiesService.updateEntity(owner, ruleset.id, "items", gem.id, { name: "Gem", [key]: value }),
        ).rejects.toMatchObject(invalidAt(key));
      }
    }
    await EntitiesService.updateEntity(owner, ruleset.id, "items", gem.id, {
      name: "Gem",
      weight: 10_000,
      costGp: 90_071_992_547_409.9,
    });
    expect((await EntitiesService.getEntity(ruleset.id, "items", gem.id)).fields).toMatchObject({
      [ITEM_WEIGHT]: 10_000,
      [ITEM_COST_GP]: 90_071_992_547_409.9,
    });
    // A third decimal is rounded off as it's written, half away from zero: their fields' scale
    await EntitiesService.updateEntity(owner, ruleset.id, "items", gem.id, {
      name: "Gem",
      weight: 0.125,
      costGp: 1.005,
    });
    expect((await EntitiesService.getEntity(ruleset.id, "items", gem.id)).fields).toMatchObject({
      [ITEM_WEIGHT]: 0.13,
      [ITEM_COST_GP]: 1.01,
    });
    const [stored] = (
      await db.execute<{ number_value: string }>(
        sql`SELECT number_value::text FROM rules.entity_fields WHERE entity_id = ${gem.id} AND field = 'ITEM_COST_GP'`,
      )
    ).rows;
    expect(stored.number_value).toBe("1.01");
  });

  test("refuses a save or a skill without its key ability", async () => {
    const { abilityId, owner, rulesetId, saveId } = await rulesetWithSave();
    expect(EntitiesService.createEntity(owner, rulesetId, "saves", { name: "Will" })).rejects.toMatchObject(
      invalidAt("abilityId"),
    );
    expect(
      EntitiesService.updateEntity(owner, rulesetId, "saves", saveId, { name: "Reflex", abilityId: null }),
    ).rejects.toMatchObject(invalidAt("abilityId"));
    expect(EntitiesService.createEntity(owner, rulesetId, "skills", { name: "Tumble" })).rejects.toMatchObject(
      invalidAt("primaryAbilityId"),
    );
    const tumble = await EntitiesService.createEntity(owner, rulesetId, "skills", {
      name: "Tumble",
      primaryAbilityId: abilityId,
    });
    expect(tumble.links).toMatchObject([{ role: "keyAbility", toId: abilityId }]);
    expect(
      EntitiesService.updateEntity(owner, rulesetId, "skills", tumble.id, { name: "Tumble", primaryAbilityId: "" }),
    ).rejects.toMatchObject(invalidAt("primaryAbilityId"));
    // One the ruleset hasn't is refused too
    expect(
      EntitiesService.updateEntity(owner, rulesetId, "skills", tumble.id, {
        name: "Tumble",
        primaryAbilityId: NIL_UUID,
      }),
    ).rejects.toThrow(`Ability ${NIL_UUID} does not belong to this ruleset`);
  });

  test("refuses a language without its type, and keeps an empty one", async () => {
    const { session: owner, ruleset } = await createTestUserAndRuleset();
    const common = await EntitiesService.createEntity(owner, ruleset.id, "languages", { name: "Common" });
    expect(common.fields).toEqual({ [LANGUAGE_TYPE]: "" });
    expect(
      EntitiesService.updateEntity(owner, ruleset.id, "languages", common.id, { name: "Common", type: null }),
    ).rejects.toMatchObject(invalidAt("type"));
    expect(
      await EntitiesService.updateEntity(owner, ruleset.id, "languages", common.id, { name: "Common", type: "Spoken" }),
    ).toMatchObject({ fields: { [LANGUAGE_TYPE]: "Spoken" } });
  });

  test("offers no write of an ability, whose description its rules seed", async () => {
    const { session: owner, ruleset } = await createTestUserAndRuleset();
    const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
      name: "Luck",
      description: "Fortune",
      rulesetId: ruleset.id,
    });
    // A character's score in it, which would make it in use: refused first, as a write its kind has none of
    const character = await createTestCharacter(owner.userId, { rulesetId: ruleset.id });
    await CharacterLinks.createMany(db, character.id, "score", [{ entityId: ability.id, amount: 12 }]);
    const form = { name: "Luck", description: null };
    expect(EntitiesService.createEntity(owner, ruleset.id, "abilities", form)).rejects.toThrow("No create");
    expect(EntitiesService.updateEntity(owner, ruleset.id, "abilities", ability.id, form)).rejects.toThrow("No update");
    expect(EntitiesService.deleteEntity(owner, ruleset.id, "abilities", ability.id)).rejects.toThrow("No delete");
  });
});

describe("a character's identity", () => {
  test("refuses a new character's negative experience, an age under 1, or either past what it holds exactly", async () => {
    expect(createCharacterAs(session, { xp: -1 })).rejects.toMatchObject(invalidAt("fields.xp"));
    expect(createCharacterAs(session, { age: 0 })).rejects.toMatchObject(invalidAt("fields.age"));
    expect(createCharacterAs(session, { xp: 1e300 })).rejects.toMatchObject(invalidAt("fields.xp"));
    expect(createCharacterAs(session, { age: 1e21 })).rejects.toMatchObject(invalidAt("fields.age"));
    expect((await createCharacterAs(session, { xp: Number.MAX_SAFE_INTEGER })).fields).toMatchObject({
      [CHARACTER_XP]: Number.MAX_SAFE_INTEGER,
    });
    expect((await createCharacterAs(session, { xp: 0, age: 1 })).fields).toMatchObject({
      [CHARACTER_XP]: 0,
      [CHARACTER_AGE]: 1,
    });
    expect((await createCharacterAs(session, { age: null })).fields).not.toHaveProperty(CHARACTER_AGE);
  });

  test("refuses a new character without an alignment, a gender or a race, or with one not among its options", async () => {
    const { abilityMap, raceMap, rulesetId } = await getSeedCtx();
    const create = (fields: FieldsRequest, raceId = raceMap.pc["Human"]) =>
      CharactersService.createCharacter(session, {
        fields: { xp: 0, ...fields },
        name: "Nameless",
        picks: { race: raceId },
        scores: {},
        rulesetId,
      });
    expect(create({ gender: "Male" })).rejects.toMatchObject(invalidAt("fields.alignment"));
    expect(create({ alignment: "Lawful Good" })).rejects.toMatchObject(invalidAt("fields.gender"));
    expect(create({ alignment: "Lawful Stupid", gender: "Male" })).rejects.toMatchObject(invalidAt("fields.alignment"));
    expect(create({ alignment: "Lawful Good", gender: "Unknown" })).rejects.toMatchObject(invalidAt("fields.gender"));
    expect(create({ alignment: "Lawful Good", gender: "Male" }, NIL_UUID)).rejects.toThrow(
      `Race ${NIL_UUID} does not belong to the character's ruleset`,
    );
    // Its creation requires its race: a request that picks none is refused
    const abilities = Object.fromEntries(Object.values(abilityMap).map((id) => [id, 10]));
    const fields = { xp: 0, alignment: "Lawful Good", gender: "Male" };
    const json = { fields, name: "Nameless", picks: {}, rulesetId, scores: { score: abilities } };
    const refused = await expectStatus(api.api.characters.$post({ json }), 400);
    expect(await refused.text()).toContain("A new character's Race is required");
  });

  test("refuses an edit's negative experience, an age under 1, either past what it holds exactly, an alignment or a gender not among their options", async () => {
    const { id } = await createCharacterAs(session, { alignment: "Lawful Good", gender: "Female" });
    const edits: [string, FieldsRequest][] = [
      ["fields.experience", { experience: -1 }],
      ["fields.experience", { experience: 1e21 }],
      ["fields.age", { age: Number.MAX_SAFE_INTEGER + 1 }],
      ["fields.age", { age: 0 }],
      ["fields.alignment", { alignment: "Lawful Stupid" }],
      ["fields.gender", { gender: "Unknown" }],
    ];
    for (const [category, fields] of edits)
      expect(CharactersService.updateCharacter(session, id, { fields })).rejects.toMatchObject(invalidAt(category));
    // An alignment or a gender left unset keeps its value: the character always has one
    const fields = { experience: 0, age: null, alignment: null, gender: null };
    const edited = await CharactersService.updateCharacter(session, id, { fields });
    expect(edited.fields).toMatchObject({
      [CHARACTER_XP]: 0,
      [CHARACTER_ALIGNMENT]: "Lawful Good",
      [CHARACTER_GENDER]: "Female",
    });
    expect(edited.fields).not.toHaveProperty(CHARACTER_AGE);
  });

  test("refuses an ability score past 1 to 100, on a new character and an edit", async () => {
    const { abilityMap } = await getSeedCtx();
    const strength = abilityMap["Strength"];
    for (const score of [0, 101]) {
      expect(createCharacterAs(session, { abilities: { [strength]: score } })).rejects.toMatchObject(
        invalidAt(`score.${strength}`),
      );
    }
    const { id } = await createCharacterAs(session, { abilities: { [strength]: 1 } });
    for (const score of [0, 101]) {
      expect(CharactersService.updateScores(session, id, "score", { [strength]: score })).rejects.toMatchObject(
        invalidAt(strength),
      );
    }
    await CharactersService.updateScores(session, id, "score", { [strength]: 100 });
    expect(await findLinks("score", id)).toContainEqual(expect.objectContaining({ entityId: strength, amount: 100 }));
  });

  test("holds an import's fields to the rules: no negative experience, no age under 1, its options, a race", async () => {
    const { rulesetId } = await getSeedCtx();
    const text = (await readPcgenFile("brannoc"))
      .replace("EXPERIENCE:29500", "EXPERIENCE:-5")
      .replace("AGE:27", "AGE:0")
      .replace("ALIGN:LN", "ALIGN:XX")
      .replace("GENDER:Male", "GENDER:Unknown");
    const { character } = await CharactersService.importCharacter(session, rulesetId, text);
    expect(character.fields).toMatchObject({
      [CHARACTER_XP]: 0,
      [CHARACTER_ALIGNMENT]: "True Neutral",
      [CHARACTER_GENDER]: "Other",
    });
    expect(character.fields).not.toHaveProperty(CHARACTER_AGE);
    expect(character.links.race).toBeString();
    const raceless = text.replace("RACE:Human", "RACE:Warforged");
    expect(CharactersService.importCharacter(session, rulesetId, raceless)).rejects.toMatchObject({
      message: "The file's race (Warforged) isn't in this ruleset",
      refusal: "unprocessable",
    });
  });
});

describe("a character's levels", () => {
  test("refuses a level's hit points of 0, forced too, on a level-up and an edit", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const first = FIGHTER_LEVELS[0];
    for (const force of [false, true]) {
      expect(levelUp(session, ctx, characterId, "Fighter", 1, { ...first, hp: 0 }, force)).rejects.toThrow(
        "HP must be between 1 and 10",
      );
    }
    const level = await levelUp(session, ctx, characterId, "Fighter", 1, { ...first, hp: 1 });
    expect(await findPicks("hp", [level.id])).toMatchObject([{ amount: 1 }]);
    const edit = levelEditPlan({ hp: 0 }, picks(ctx, first));
    for (const force of [false, true]) {
      expect(CharacterLevelsService.updatePlannedLevel(session, characterId, level.id, edit, force)).rejects.toThrow(
        "HP must be between 1 and 10",
      );
    }
  });

  test("refuses a class level a character has already, forced too", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
    expect(levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0], true)).rejects.toMatchObject({
      message: "Level 2: This level has already been finalized",
      refusal: "invalid",
    });
  });

  test("refuses negative skill points, and stores no rank for a skill a level spends none on", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const first = FIGHTER_LEVELS[0];
    const level = { klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 10 };
    const spending = (skills: Record<string, number>) =>
      levelUpPlan([level], picks(ctx, { ...first, skills: { ...first.skills, ...skills } }));
    expect(CharacterLevelsService.addLevels(session, characterId, spending({ Spot: -1 }), true)).rejects.toThrow(
      "The skills step's answer isn't a spend step's",
    );
    const [saved] = await CharacterLevelsService.addLevels(session, characterId, spending({ Spot: 0 }));
    const ranks = await findPicks("skills", [saved.id]);
    expect(ranks.map(({ entityId }) => entityId)).not.toContain(ctx.skillMap["Spot"]);
    expect(ranks.every(({ amount }) => amount! > 0)).toBe(true);
  });

  test("refuses an ability increase of 0, forced or not, on a level-up and an edit", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
    for (const [index, plan] of FIGHTER_LEVELS.slice(0, 3).entries())
      await levelUp(session, ctx, characterId, "Fighter", index + 1, plan);
    const fourth = FIGHTER_LEVELS[3];
    const strength = ctx.abilityMap["Strength"];
    const at = (amount: number) => [{ abilityId: strength, amount }];
    const plan = (amount: number) =>
      levelUpPlan(
        [{ klassId: ctx.klassMap.pc["Fighter"], level: 4, hp: 8, abilityIncreases: at(amount) }],
        picks(ctx, fourth),
      );
    for (const force of [false, true]) {
      for (const amount of [0, -1]) {
        expect(CharacterLevelsService.addLevels(session, characterId, plan(amount), force)).rejects.toThrow(
          "The abilities step's answer isn't a choose step's",
        );
      }
    }
    const [saved] = await CharacterLevelsService.addLevels(session, characterId, plan(1));
    const edit = levelEditPlan({ hp: 8, abilityIncreases: at(0) }, picks(ctx, fourth));
    for (const force of [false, true]) {
      expect(CharacterLevelsService.updatePlannedLevel(session, characterId, saved.id, edit, force)).rejects.toThrow(
        "The abilities step's answer isn't a choose step's",
      );
    }
  });
});

describe("a character's bonded creatures", () => {
  test("a player character has no master, and a bonded creature its own", async () => {
    const { id } = await createCharacterAs(session);
    expect(await Characters.findOne(db, { id })).toMatchObject({ kind: "pc", parentCharacterId: null });
    const { masterId, bonded } = await createWizardWithFamiliar();
    expect(await Characters.findOne(db, { id: masterId })).toMatchObject({ kind: "pc", parentCharacterId: null });
    expect(bonded).toMatchObject({ kind: "familiar", parentCharacterId: masterId });
    // An edit's route takes neither: a character stays the one it was made
    const json = { name: "Renamed", kind: "familiar", parentCharacterId: masterId };
    await expectOk(api.api.characters[":id"].$put({ param: { id }, json: json as never }));
    expect(await Characters.findOne(db, { id })).toMatchObject({ kind: "pc", parentCharacterId: null });
  });

  test("a level flow on a master waits on the master's lock, which it takes before reading its creatures", async () => {
    const master = await findSeededCharacter("Vex Flamecaller");
    const [familiar] = await Characters.findMany(db, { parentCharacterId: master.id });
    expect(familiar).toMatchObject({ kind: "familiar" });
    await runWhileLocked(
      lockPool,
      (blockerDb) => Characters.lock(blockerDb, { id: master.id }),
      () => CharacterLevelsService.removeLevel(session, master.id),
    );
    expect(await Characters.findMany(db, { parentCharacterId: master.id })).toMatchObject([
      { id: familiar.id, kind: "familiar" },
    ]);
  });

  test("a master keeps one live creature of a kind, which the database refuses a second of, an archived one aside", async () => {
    const master = await findSeededCharacter("Vex Flamecaller");
    const [familiar] = await Characters.findMany(db, { parentCharacterId: master.id });
    const second = {
      userId: master.userId,
      rulesetId: master.rulesetId,
      kind: "familiar",
      parentCharacterId: master.id,
    };
    // In a savepoint, which the refusal rolls back alone
    const refused = await db
      .transaction((tx) => Characters.create(tx, { ...second, name: "Second Familiar" }))
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ cause: { code: "23505", constraint: "characters_one_live_child_per_kind_idx" } });
    await Characters.update(db, { deletedAt: new Date().toISOString() }, { id: familiar.id });
    const [made] = await Characters.create(db, { ...second, name: "New Familiar" });
    expect(made).toMatchObject({ kind: "familiar", parentCharacterId: master.id });
  });
});

describe("a character's inventory", () => {
  test("refuses a location not among its options, on an add, an edit and a placement's query", async () => {
    const { rulesetId } = await getSeedCtx();
    const { id: characterId } = await postCharacter();
    const { id: itemId } = await findPlainItem(rulesetId);
    const inventory = api.api.characters.inventory[":characterId"];
    const entry = { quantity: 1, equipped: true, totalCharges: null, remainingCharges: null };
    const issue = {
      category: "location",
      message: `Invalid option: expected one of ${LOCATION_OPTIONS.map((location) => `"${location}"`).join("|")}`,
    };
    const refusedAdd = await expectStatus(
      inventory.$post({ param: { characterId }, json: { ...entry, itemId, location: "Pocket" } }),
      400,
    );
    expect(await refusedAdd.json()).toMatchObject({ message: "Request validation failed", issues: [issue] });
    const added = await expectOk(
      inventory.$post({ param: { characterId }, json: { ...entry, itemId, location: "Trinket" } }),
    );
    expect(added).toMatchObject({ location: "Trinket" });
    const refusedEdit = await expectStatus(
      inventory[":entryId"].$put({ param: { characterId, entryId: added.id }, json: { ...entry, location: "Pocket" } }),
      400,
    );
    expect(await refusedEdit.json()).toMatchObject({ message: "Request validation failed", issues: [issue] });
    const refusedQuery = await expectStatus(
      inventory.placement.$get({ param: { characterId }, query: { location: "Pocket", groups: "" } }),
      400,
    );
    expect(await refusedQuery.json()).toMatchObject({ message: "Request validation failed", issues: [issue] });
  });
});
