import { describe, expect, test } from "bun:test";

import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLanguages, Feats, Modifiers, Requirements } from "@/server/repositories/index.ts";
import type { Character, Requirement } from "@/shared/relations.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { pickFeat } from "@/tests/support/levels.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";

/** One group holding one requirement: that the character speaks `language`, by its slug. */
function speaking(language: string): Requirement[][] {
  const now = new Date().toISOString();
  return [
    [
      {
        id: language,
        entityId: "test",
        entityType: "test",
        level: "1",
        target: `languages.${language}.known`,
        operator: "equal",
        value: "true",
        valueType: "boolean",
        chainingOperator: null,
        createdAt: now,
        deletedAt: null,
        updatedAt: now,
      },
    ],
  ];
}

/** The Bluff misc bonus of `record`, built. */
async function bluffMisc(record: Character) {
  return (await buildAs(DetailedCharacter, record)).components.skills.getSkills().bluff?.misc;
}

/** A character of the seed user's on a new fork, who picked a feat whose +2 to Bluff is gated on speaking Draconic. */
async function pickDraconicGatedFeat() {
  const { aptMap } = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const [feat] = await Feats.create(db, { name: `Wyrm Tongue ${uniqueId()}`, rulesetId: fork.id });
  const [modifier] = await Modifiers.create(db, {
    sourceId: feat.id,
    sourceType: "feats",
    target: "skills.bluff.misc",
    operator: "add",
    value: "2",
    valueType: "number",
  });
  await Requirements.create(db, {
    entityId: modifier.id,
    entityType: "modifiers",
    level: "1",
    target: "languages.draconic.known",
    operator: "equal",
    value: "true",
    valueType: "boolean",
  });
  RulesetViews.invalidate(fork.id);
  return await pickFeat(SEED_USER_ID, fork.id, feat.id, aptMap["General"]);
}

/** Whether `record`, built, meets a requirement that it speaks `language`. */
async function speaks(record: Character, language: string) {
  return (await buildAs(DetailedCharacter, record)).areRequirementsMet(speaking(language));
}

describe("A character's languages, as its requirements read them", () => {
  test("hold a language known when the character picked it", async () => {
    const { langMap } = await getSeedCtx();
    const human = await createTestCharacter(SEED_USER_ID);
    expect(await speaks(human, "draconic")).toBe(false);

    await CharacterLanguages.create(db, { characterId: human.id, languageId: langMap["Draconic"] });
    expect(await speaks(human, "draconic")).toBe(true);
  });

  test("hold a language known when a modifier grants it: its race's, or one of its own", async () => {
    const { raceMap } = await getSeedCtx();
    const dwarf = await createTestCharacter(SEED_USER_ID, { raceId: raceMap.pc["Dwarf"] });
    expect(await speaks(dwarf, "dwarven")).toBe(true);
    expect(await speaks(dwarf, "draconic")).toBe(false);

    await Modifiers.create(db, {
      sourceId: dwarf.id,
      sourceType: "characters",
      target: "languages.draconic.known",
      operator: "set",
      value: "true",
      valueType: "boolean",
    });
    const built = await buildAs(DetailedCharacter, dwarf);
    expect(built.areRequirementsMet(speaking("draconic"))).toBe(true);
    expect(built.components.languages.getGranted().map(({ name }) => name)).toEqual(["Common", "Draconic", "Dwarven"]);
  });

  test("gate a modifier on a language the character speaks, picked or granted", async () => {
    const { langMap } = await getSeedCtx();
    const picker = await pickDraconicGatedFeat();
    expect(await bluffMisc(picker)).toBe(0);
    await CharacterLanguages.create(db, { characterId: picker.id, languageId: langMap["Draconic"] });
    expect(await bluffMisc(picker)).toBe(2);

    const granted = await pickDraconicGatedFeat();
    await Modifiers.create(db, {
      sourceId: granted.id,
      sourceType: "characters",
      target: "languages.draconic.known",
      operator: "set",
      value: "true",
      valueType: "boolean",
    });
    expect(await bluffMisc(granted)).toBe(2);
  });

  test("hold the extra picks a modifier adds, none without", async () => {
    const human = await createTestCharacter(SEED_USER_ID);
    expect((await buildAs(DetailedCharacter, human)).components.languages.getExtraPicks()).toBe(0);

    await Modifiers.create(db, {
      sourceId: human.id,
      sourceType: "characters",
      target: "languages.extrapicks",
      operator: "add",
      value: "2",
      valueType: "number",
    });
    expect((await buildAs(DetailedCharacter, human)).components.languages.getExtraPicks()).toBe(2);
  });
});
