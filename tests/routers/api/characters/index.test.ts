import { describe, expect, test } from "bun:test";

import type { RulesetAbility } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Entities } from "@/server/repositories/index.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { notesOf, postCharacter } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import { createWizardWithFamiliar } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

const characters = api.api.characters;
const character = characters[":id"];

/** The words of a 3.5 character page's own level actions, its summary's. */
const LEVEL_WORDS = {
  add: "Add Level",
  removeLast: "Remove Last Level",
  removeLastMessage: "Are you sure you want to remove the last level? This action cannot be undone.",
  deleteMessage:
    "Are you sure you want to permanently delete this character? Its levels, abilities, inventory, attachments and customizations go with it. This action cannot be undone.",
  removed: "Level removed",
  removeFailed: "Failed to remove level",
};

/** What only a character's editors read, and its campaign's Game Master. */
const PRIVATE_NOTES = "Plans to betray the party";

async function languageNames(id: string) {
  return (await sheetOf(id)).identity.physiology.languages.map((l) => l.name).sort();
}

/** Every ability at 10 but `ability`, at `score`: a new character's scores. */
async function scoresWith(ability: string, score: number) {
  const { abilityMap } = await getSeedCtx();
  return Object.fromEntries(
    Object.entries(abilityMap).map(([name, abilityId]) => [abilityId, name === ability ? score : 10]),
  );
}

describe("characters", () => {
  test("creates, reads, lists and updates a character", async () => {
    const ctx = await getSeedCtx();
    const created = await postCharacter({ name: "Router Character" });
    expect(created).toMatchObject({
      name: "Router Character",
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
    });

    expect(await expectOk(character.$get({ param: { id: created.id } }))).toMatchObject({ id: created.id });
    const list = await expectOk(characters.$get({ query: { search: "Router Character" } }));
    expect(list.items.map((c) => c.id)).toEqual([created.id]);
    expect((await expectOk(characters.$get({ query: { limit: "1" } }))).items).toHaveLength(1);

    const fields = {
      age: 30,
      gender: "Female",
      height: "5'6\"",
      weight: "130 lbs",
      experience: 1000,
      alignment: "Chaotic Good",
    };
    expect(await expectOk(character.$put({ param: { id: created.id }, json: { fields } }))).toMatchObject({
      age: 30,
      gender: "Female",
      height: "5'6\"",
      weight: "130 lbs",
      xp: 1000,
      alignment: "Chaotic Good",
    });
  });

  test("clears a character's age, height and weight with null, and refuses an age below 1", async () => {
    const { id } = await postCharacter({ age: 30, height: "180", weight: "80" });
    const cleared = await expectOk(
      character.$put({ param: { id }, json: { fields: { age: null, height: null, weight: null } } }),
    );
    expect(cleared).toMatchObject({ age: null, height: null, weight: null });
    await expectStatus(character.$put({ param: { id }, json: { fields: { age: 0 } } }), 400);
    await expectStatus(character.$put({ param: { id }, json: { fields: { age: 2.5 } } }), 400);
  });

  test("lists the races a new character can pick", async () => {
    const ctx = await getSeedCtx();
    const races = await expectOk(
      characters.creation[":column"].$get({
        param: { column: "raceId" },
        query: { rulesetId: ctx.rulesetId, search: "Human" },
      }),
    );
    expect(races.items.map((r) => r.id)).toContain(ctx.raceMap.pc["Human"]);
  });

  test("answers how a new character of a ruleset sets its ability scores, and refuses a ruleset that isn't", async () => {
    const ctx = await getSeedCtx();
    const creation = await expectOk(
      characters.creation.$get({ query: { link: "abilities", rulesetId: ctx.rulesetId } }),
    );
    expect(creation.methods.map((method) => method.label)).toEqual([
      "4d6 Drop Lowest",
      "3d6 Straight",
      "Standard Array",
      "Point Buy",
    ]);
    expect(creation.scores).toEqual({ max: 100, min: 1, start: 10 });
    expect(creation.entities).toEqual(ABILITY_NAMES.map((name) => ({ id: ctx.abilityMap[name], name })));
    expect(creation.modifiers[15]).toBe(2);

    await expectStatus(characters.creation.$get({ query: { link: "abilities", rulesetId: NIL_UUID } }), 404);
    await expectStatus(characters.creation.$get({ query: { link: "abilities", rulesetId: "not-an-id" } }), 400);
    await expectStatus(
      guestApi.api.characters.creation.$get({ query: { link: "abilities", rulesetId: ctx.rulesetId } }),
      401,
    );
  });

  test("lists the characters not linked to a campaign yet", async () => {
    const campaign = await postCampaign();
    const created = await postCharacter();
    const unlinked = await expectOk(
      characters.unlinked[":campaignId"].$get({ param: { campaignId: campaign.id }, query: {} }),
    );
    expect(unlinked.items.map((c) => c.id)).toContain(created.id);

    await expectOk(
      api.api.campaigns[":id"].characters.$post({ param: { id: campaign.id }, json: { characterId: created.id } }),
    );
    const after = await expectOk(
      characters.unlinked[":campaignId"].$get({ param: { campaignId: campaign.id }, query: {} }),
    );
    expect(after.items.map((c) => c.id)).not.toContain(created.id);
  });

  test("archives, unarchives and permanently deletes a character", async () => {
    const { id } = await postCharacter();
    expect(await expectOk(character.$delete({ param: { id } }))).toEqual({
      message: "Character archived successfully",
    });
    expect(await expectOk(character.unarchive.$post({ param: { id } }))).toEqual({
      message: "Character unarchived successfully",
    });

    await expectOk(character.$delete({ param: { id } }));
    await expectOk(character.permanent.$delete({ param: { id } }));
    await expectStatus(character.$get({ param: { id } }), 404);
  });

  test("only deletes an archived character permanently", async () => {
    const { id } = await postCharacter();
    await expectStatus(character.permanent.$delete({ param: { id } }), 404);
  });

  test("enqueues a PDF of the character", async () => {
    const { id } = await postCharacter();
    expect((await characters[":characterId"].pdf.$post({ param: { characterId: id } })).status).toBe(202);
  });

  test("tags a caster's spells with the domains the character picked", async () => {
    // Theron, a seeded cleric, picked the Healing and Sun domains.
    const [theron] = (await expectOk(characters.$get({ query: { search: "Theron Lightbringer" } }))).items;
    const detail = await sheetOf(theron.id);

    const spells = detail.spellGroups.flatMap((list) => list.levels.flatMap((group) => group.spells));
    const tags = [...new Set(spells.flatMap((spell) => spell.tags?.map((tag) => tag.name) ?? []))].sort();
    expect(tags).toEqual(["Healing Domain", "Sun Domain"]);
    const classPowerIds = new Set(
      Object.values(detail.classes).flatMap((klass) => klass.levels.flatMap((level) => level.powers.map((p) => p.id))),
    );
    expect(spells.some((spell) => spell.tags && classPowerIds.has(spell.id))).toBe(true);
  });

  describe("import", () => {
    test("imports the character a PCGen file holds, with the report of what it imported and couldn't", async () => {
      const { rulesetId } = await getSeedCtx();
      const imported = await expectOk(
        characters.import.$post({ json: { rulesetId, text: await readPcgenFile("brannoc") } }),
      );
      expect(imported.character).toMatchObject({ name: "Brannoc Vale", rulesetId, userId: SEED_USER_ID });
      expect(imported.report.imported).toContain("Race: Human");
      expect(imported.report.unmatched.map(({ reason }) => reason)).toContain(
        "Potion (Cure Light Wounds) isn't an item of the ruleset",
      );
      const sheet = await expectOk(character.$get({ param: { id: imported.character.id } }));
      expect(sheet).toMatchObject({ id: imported.character.id, name: "Brannoc Vale" });
    });

    test("answers what a picked file is, and the base rules whose rulesets import it", async () => {
      const text = await readPcgenFile("brannoc");
      expect(await expectOk(characters.import.source.$post({ json: { text } }))).toEqual({
        baseRules: ["Dungeons & Dragons: 3.5"],
        source: { format: "2.0", program: "PCGen", rules: "35e", version: "6.09.08.RC1" },
      });
      await expectStatus(characters.import.source.$post({ json: { text: "" } }), 400);
    });

    test("refuses a file no importer reads, and an empty one", async () => {
      const { rulesetId } = await getSeedCtx();
      await expectStatus(characters.import.$post({ json: { rulesetId, text: "Not a character" } }), 422);
      await expectStatus(characters.import.$post({ json: { rulesetId, text: "" } }), 400);
    });
  });

  describe("abilities", () => {
    test("sets an ability's base score", async () => {
      const { abilityMap } = await getSeedCtx();
      const { id } = await postCharacter();
      await expectOk(
        character.scores[":link"].$put({ param: { id, link: "abilities" }, json: { [abilityMap["Strength"]]: 18 } }),
      );

      const detail = await sheetOf(id);
      const strength = Object.values(detail.abilities).find((a) => a.abilityId === abilityMap["Strength"]);
      expect(strength).toMatchObject({ base: 18, total: 18, modifier: 4 });
    });

    test("lists the abilities in the order a sheet does, each named as its ruleset names it", async () => {
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const [forcePoints] = await Entities.create<RulesetAbility>(db, "abilities", {
        name: "Force Points",
        description: "",
        rulesetId: fork.id,
      });
      RulesetViews.invalidate(fork.id);
      const { abilityMap } = await getSeedCtx();
      const scores = Object.fromEntries(Object.values(abilityMap).map((abilityId) => [abilityId, 10]));
      const { id } = await postCharacter({ rulesetId: fork.id, abilities: { ...scores, [forcePoints.id]: 12 } });

      const { abilities } = await sheetOf(id);
      // The books' six first, then the ruleset's own
      expect(abilities.map((ability) => ability.name)).toEqual([...ABILITY_NAMES, "Force Points"]);
      expect(abilities[0]).toMatchObject({ abilityId: abilityMap["Strength"], key: "strength", abbreviation: "STR" });
      expect(abilities[6]).toMatchObject({
        abilityId: forcePoints.id,
        key: "forcepoints",
        abbreviation: "FOR",
        base: 12,
      });
    });

    test("lists a bonded creature's abilities on its own sheet, each with its abbreviation", async () => {
      const { bonded } = await createWizardWithFamiliar();
      const familiar = await expectOk(character.$get({ param: { id: bonded.id } }));
      const abilities = familiar.blocks.find((block) => block.key === "abilities");
      if (abilities?.kind !== "scores") throw new Error("no abilities block");
      expect(abilities.scores.map(({ short }) => short)).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
    });

    test("refuses an ability the ruleset doesn't have", async () => {
      const { id } = await postCharacter();
      await expectStatus(
        character.scores[":link"].$put({ param: { id, link: "abilities" }, json: { [NIL_UUID]: 15 } }),
        400,
      );
    });

    test("refuses a score past the ruleset's bounds", async () => {
      const { abilityMap } = await getSeedCtx();
      const { id } = await postCharacter();
      for (const score of [0, 1000])
        {await expectStatus(
          character.scores[":link"].$put({
            param: { id, link: "abilities" },
            json: { [abilityMap["Strength"]]: score },
          }),
          400,
        );}
    });
  });

  describe("sheet blocks", () => {
    test("describes the sheet's scores and its combat as blocks, in its order, each titled in its words", async () => {
      const { abilityMap } = await getSeedCtx();
      const { id } = await postCharacter({ abilities: await scoresWith("Strength", 18) });

      const { blocks } = await expectOk(character.$get({ param: { id } }));
      const { combat } = await sheetOf(id);
      expect(blocks.map(({ kind, key, title }) => [kind, key, title])).toEqual([
        ["fields", "identity", "Personal Details"],
        ["scores", "abilities", "Ability Scores"],
        ["scores", "saves", "Saving Throws"],
        ["stats", "combat", "Combat"],
        ["table", "skills", "Skills"],
        ["entries", "feats", "Feats & Special Abilities"],
        ["inventory", "equipment", "Equipment & Inventory"],
      ]);
      const [, abilities, saves, stats] = blocks;
      // An ability's total over its modifier, its base its owner sets within the rules' bounds
      expect(abilities).toMatchObject({ kind: "scores", edit: { lower: { confirm: "Decrease Ability Score" } } });
      expect(abilities.kind === "scores" && abilities.scores[0]).toEqual({
        key: abilityMap["Strength"],
        label: "Strength",
        short: "STR",
        value: 18,
        badge: 4,
        base: { label: "Base", value: 18, min: 1, max: 100 },
        parts: [
          { label: "Level", value: "+0" },
          { label: "Misc", value: "+0" },
        ],
      });
      // A save's total, signed, with no base of the character's own to edit
      expect(saves).not.toHaveProperty("edit");
      expect(saves.kind === "scores" && saves.scores.map(({ label, signed, base }) => [label, signed, base])).toEqual([
        ["Fortitude", true, undefined],
        ["Reflex", true, undefined],
        ["Will", true, undefined],
      ]);
      // Its line, then its one loadout, striking unarmed, with no set's heading
      expect(stats.kind === "stats" && stats.stats).toEqual(combat.stats);
      expect(stats.kind === "stats" && stats.panels).toEqual([
        expect.objectContaining({
          boxes: [
            { label: "AC", value: "10" },
            { label: "Touch", value: "10" },
            { label: "Flat-footed", value: "10" },
          ],
        }),
      ]);
      expect(stats.kind === "stats" && stats.panels[0]).not.toHaveProperty("heading");
    });

    test("sums a character's classes up for its header, each at its level, with its levels and their words", async () => {
      const { masterId } = await createWizardWithFamiliar();
      const { summary } = await expectOk(character.$get({ param: { id: masterId } }));
      const { classes } = await sheetOf(masterId);
      const [wizard] = Object.values(classes);
      expect(summary).toEqual({
        separator: " · ",
        tracks: [
          {
            id: wizard.klass.id,
            entityType: "klasses",
            name: "Wizard",
            label: "Wizard 1",
            words: { open: "Wizard 1 Levels", levels: "Wizard Levels", add: "Add Wizard Level" },
            advancements: [{ id: wizard.levels[0].characterLevel.id, label: "Level 1", edit: "Edit Wizard Level 1" }],
          },
        ],
        words: LEVEL_WORDS,
      });
      // A new character has no track yet
      const { id } = await postCharacter();
      expect((await expectOk(character.$get({ param: { id } }))).summary).toEqual({
        separator: " · ",
        tracks: [],
        words: LEVEL_WORDS,
      });
    });

    test("lists each character's card chips: its race, then its classes at their highest level", async () => {
      const { masterId } = await createWizardWithFamiliar();
      const { items } = await expectOk(characters.$get({ query: { limit: "100" } }));
      const card = items.find((item) => item.id === masterId);
      if (!card) throw new Error("no card");
      expect(card.chips).toEqual([
        { label: "Elf", partial: true, tone: "secondary" },
        { label: "Wizard 1", partial: false, tone: "primary" },
      ]);
    });

    test("describes a bonded creature's sheet in the same blocks", async () => {
      const { bonded } = await createWizardWithFamiliar();
      const familiar = await expectOk(character.$get({ param: { id: bonded.id } }));
      expect(familiar.blocks.map(({ key }) => key)).toEqual([
        "identity",
        "abilities",
        "saves",
        "combat",
        "skills",
        "feats",
        "equipment",
      ]);
    });

    test("lists the skills by name, a class skill marked and a family grouped, each with its figures", async () => {
      const { id } = await postCharacter();
      const { blocks } = await expectOk(character.$get({ param: { id } }));
      const { skills } = await sheetOf(id);
      const block = blocks.find((each) => each.key === "skills");
      if (block?.kind !== "table") throw new Error("no skills table");
      expect(block.note).toBe("* indicates a class skill");
      expect(block.table.rows).toHaveLength(Object.keys(skills).length);
      const arcana = block.table.rows.find((row) => row.key === "Knowledge (Arcana)");
      expect(arcana).toMatchObject({ group: "Knowledge", short: "Arcana", cells: { rank: "0", total: "+0" } });
      expect(block.table.rows.map((row) => row.key)).toEqual(
        Object.values(skills)
          .map((skill) => skill.name)
          .sort((a, b) => a.localeCompare(b)),
      );
    });

    test("puts a bonded creature in the details of its master's feat that bonds it, and lists its spells", async () => {
      const { masterId, bonded } = await createWizardWithFamiliar();
      const master = await expectOk(character.$get({ param: { id: masterId } }));
      const feats = master.blocks.find((block) => block.key === "feats");
      if (feats?.kind !== "entries") throw new Error("no feats");
      const bonding = feats.entries.find((entry) => entry.subsheet);
      expect(bonding?.name).toBe("Cat Familiar");
      expect(bonding?.subsheet).toMatchObject({
        id: bonded.id,
        name: bonded.name,
        scores: { title: "Abilities" },
        stats: { title: "Combat & Saves" },
        chips: { title: "Feats" },
      });
      expect(bonding?.subsheet?.scores.scores.map(({ short }) => short)).toEqual([
        "STR",
        "DEX",
        "CON",
        "INT",
        "WIS",
        "CHA",
      ]);
      // A wizard's spells, by list and level, and its slots per day
      const spells = master.blocks.find((block) => block.key === "spells");
      if (spells?.kind !== "pools") throw new Error("no spells");
      expect(spells).toMatchObject({ title: "Spells", entityType: "powers", counts: { title: "Spells per Day" } });
      expect(spells.pools.map(({ name }) => name)).toEqual(
        (await sheetOf(masterId)).spellGroups.map(({ aptitudeName }) => aptitudeName),
      );
    });
  });

  describe("languages", () => {
    test("sets, replaces and clears a character's picks, beside the languages its race gives it", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await postCharacter({ abilities: await scoresWith("Intelligence", 14) });
      const put = (languageIds: string[]) =>
        character.links[":link"].$put({ param: { id, link: "languages" }, json: { entityIds: languageIds } });

      // A human speaks Common, which its race grants, and picks a language per point of Intelligence bonus: two
      await expectOk(put([langMap["Draconic"], langMap["Elven"]]));
      expect(await languageNames(id)).toEqual(["Common", "Draconic", "Elven"]);
      await expectOk(put([langMap["Common"], langMap["Elven"]]));
      expect(await languageNames(id)).toEqual(["Common", "Elven"]);
      await expectOk(put([]));
      expect(await languageNames(id)).toEqual(["Common"]);
    });

    test("refuses a pick past the character's room, or a secret language, naming it", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await postCharacter({ abilities: await scoresWith("Intelligence", 12) });
      const put = (languageIds: string[]) =>
        character.links[":link"].$put({ param: { id, link: "languages" }, json: { entityIds: languageIds } });

      expect(await (await expectStatus(put([langMap["Draconic"], langMap["Elven"]]), 400)).text()).toContain("Elven");
      expect(await (await expectStatus(put([langMap["Druidic"]]), 400)).text()).toContain("Druidic");
      expect(await languageNames(id)).toEqual(["Common"]);
    });

    test("answers what the character speaks, its picks and what one more pick may add", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await postCharacter({ abilities: await scoresWith("Intelligence", 12) });
      const languages = (languageIds: string[]) =>
        expectOk(
          character.links[":link"].$get({
            param: { id, link: "languages" },
            query: { entityIds: languageIds.join(",") },
          }),
        );

      const open = await languages([]);
      expect(open.automatic.map((language) => language.name)).toEqual(["Common"]);
      expect(open.options.map((language) => language.name)).toContain("Draconic");
      expect(open.options.map((language) => language.name)).not.toContain("Druidic");

      const full = await languages([langMap["Common"], langMap["Draconic"]]);
      expect(full.picks.map((language) => language.name)).toEqual(["Draconic"]);
      // Its Intelligence of 12 gives it one pick: none more once it's made
      expect(full.options).toEqual([]);
    });

    test("rejects a language the ruleset doesn't have", async () => {
      const { id } = await postCharacter();
      await expectStatus(
        character.links[":link"].$put({ param: { id, link: "languages" }, json: { entityIds: [NIL_UUID] } }),
        400,
      );
      await expectStatus(
        character.links[":link"].$get({ param: { id, link: "languages" }, query: { entityIds: NIL_UUID } }),
        400,
      );
    });

    test("rejects a language its fork deleted, or one sent twice", async () => {
      const { langMap } = await getSeedCtx();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const entity = api.api.rulesets[":id"].entities[":entityType"][":entityId"];
      await expectOk(
        entity.$delete({ param: { id: fork.id, entityType: "languages", entityId: langMap["Draconic"] } }),
      );
      const { id } = await postCharacter({ rulesetId: fork.id });

      const put = (languageIds: string[]) =>
        character.links[":link"].$put({ param: { id, link: "languages" }, json: { entityIds: languageIds } });
      await expectStatus(put([langMap["Draconic"]]), 400);
      await expectStatus(put([langMap["Common"], langMap["Common"]]), 400);
      await expectOk(put([langMap["Common"]]));
    });

    test("answers a bonded creature's languages, as its master's editor reads them", async () => {
      const { bonded } = await createWizardWithFamiliar();
      const languages = await expectOk(
        character.links[":link"].$get({ param: { id: bonded.id, link: "languages" }, query: {} }),
      );
      // A cat speaks nothing its race grants, and its Intelligence gives it no pick
      expect(languages).toEqual({ automatic: [], options: [], picks: [] });
    });

    test("answers another user's character's languages as not found", async () => {
      const { id } = await postCharacter();
      const { api: otherApi } = await createSignedInUser();
      const other = otherApi.api.characters[":id"];
      await expectStatus(other.links[":link"].$get({ param: { id, link: "languages" }, query: {} }), 404);
    });
  });

  describe("fields", () => {
    test("describes the identity's fields, each by the key its edit sends it, its value as the character has it", async () => {
      const { id } = await postCharacter({ notes: "Public notes" });
      const { blocks } = await expectOk(character.$get({ param: { id } }));
      const identity = blocks.find((block) => block.key === "identity");
      if (identity?.kind !== "fields") throw new Error("no identity");
      expect(identity.lines.map((line) => line.map(({ key, kind }) => `${key}:${kind}`))).toEqual([
        ["race:text", "alignment:select", "experience:number", "deity:text"],
        ["age:number", "gender:select", "height:text", "weight:text"],
      ]);
      expect(identity.lines[0][0]).toMatchObject({ value: "Human", fixed: true });
      expect(identity.fields.map(({ key }) => key)).toEqual(["description"]);
      expect(identity.notes).toEqual({ notes: "Public notes", privateNotes: "" });
      expect(identity.links?.map(({ label, link }) => [link, label])).toEqual([["languages", "Languages"]]);
    });

    test("saves the fields an edit sends by their keys, each as its ruleset writes it", async () => {
      const { id } = await postCharacter();
      const saved = await expectOk(
        character.$put({
          param: { id },
          json: {
            fields: {
              alignment: "Chaotic Good",
              experience: 1200,
              deity: "Pelor",
              age: null,
              gender: null,
              height: "",
              weight: "75",
              description: "Tall",
            },
          },
        }),
      );
      // An age cleared, an empty height cleared, an unset gender left as it is, experience its xp
      expect(saved).toMatchObject({
        alignment: "Chaotic Good",
        xp: 1200,
        deity: "Pelor",
        age: null,
        gender: "Male",
        height: null,
        weight: "75",
        description: "Tall",
      });
    });

    test("leaves a field the edit doesn't send as it is", async () => {
      const { id } = await postCharacter({ age: 30, deity: "Pelor" });
      const saved = await expectOk(character.$put({ param: { id }, json: { fields: { deity: "Moradin" } } }));
      expect(saved).toMatchObject({ deity: "Moradin", age: 30, gender: "Male", alignment: "True Neutral" });
    });

    test("saves its fields and its languages together, and neither when a field is refused", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await postCharacter({ abilities: await scoresWith("Intelligence", 14) });
      await expectOk(
        character.$put({
          param: { id },
          json: { fields: { deity: "Pelor" }, links: { languages: [langMap["Elven"]] } },
        }),
      );
      expect(await languageNames(id)).toContain("Elven");
      // A refused field writes nothing: not its other fields, not its languages
      await expectStatus(
        character.$put({ param: { id }, json: { fields: { deity: "Moradin", age: 0 }, links: { languages: [] } } }),
        400,
      );
      expect((await sheetOf(id)).identity.beliefs.deity).toBe("Pelor");
      expect(await languageNames(id)).toContain("Elven");
    });

    test("refuses a field the identity hasn't, its race, or a value its field doesn't take", async () => {
      const { id } = await postCharacter();
      const refused: Record<string, number | string>[] = [
        { nonsense: "x" },
        { race: "Elf" },
        { alignment: "Evil-ish" },
        { experience: -1 },
        { experience: 2.5 },
        { age: 0 },
        { deity: "Pelor", nonsense: "x" },
      ];
      for (const fields of refused) await expectStatus(character.$put({ param: { id }, json: { fields } }), 400);
    });
  });

  describe("private notes", () => {
    test("saves a character's private notes, which its editors read and no one else", async () => {
      const { id } = await postCharacter({ notes: "Public notes" });
      const saved = await expectOk(character.$put({ param: { id }, json: { privateNotes: PRIVATE_NOTES } }));
      expect(saved).toMatchObject({ notes: "Public notes", privateNotes: PRIVATE_NOTES });
      expect(notesOf(await expectOk(character.$get({ param: { id } })))).toEqual({
        notes: "Public notes",
        privateNotes: PRIVATE_NOTES,
      });

      const contributor = await createSignedInUser("contributor");
      await addCharacterContributor(id, contributor.user, SEED_USER_ID);
      const theirs = contributor.api.api.characters[":id"];
      await expectOk(theirs.$put({ param: { id }, json: { privateNotes: "Edited by a contributor" } }));
      expect(notesOf(await expectOk(theirs.$get({ param: { id } })))).toMatchObject({
        privateNotes: "Edited by a contributor",
      });

      const { api: outsider } = await createSignedInUser("outsider");
      await expectStatus(outsider.api.characters[":id"].$get({ param: { id } }), 404);
      await expectStatus(outsider.api.characters[":id"].$put({ param: { id }, json: { privateNotes: "" } }), 404);
    });

    test("saves a bonded creature's private notes, which its own sheet holds", async () => {
      const { bonded } = await createWizardWithFamiliar();
      await expectOk(character.$put({ param: { id: bonded.id }, json: { privateNotes: PRIVATE_NOTES } }));

      const own = await expectOk(character.$get({ param: { id: bonded.id } }));
      expect(notesOf(own)).toMatchObject({ privateNotes: PRIVATE_NOTES });
    });
  });

  describe("sharing", () => {
    test("shares a character with anyone holding its token, without its private notes", async () => {
      const { id } = await postCharacter();
      await expectOk(character.$put({ param: { id }, json: { privateNotes: PRIVATE_NOTES } }));
      const { shareToken } = await expectOk(character.share.$post({ param: { id } }));
      expect(shareToken).toEqual(expect.any(String));
      expect(await expectOk(character.$get({ param: { id } }))).toMatchObject({ shareToken });

      const shared = guestApi.api.shared.characters[":shareToken"];
      const sheet = await expectOk(shared.$get({ param: { shareToken: shareToken! } }));
      expect(sheet.id).toBe(id);
      // Its identity's block holds its notes, its private ones not
      const identity = sheet.blocks.find((block) => block.key === "identity");
      expect(identity?.kind === "fields" && identity.notes).toEqual({ notes: "" });
      expect(JSON.stringify(sheet)).not.toContain(PRIVATE_NOTES);

      const pdf = await shared.pdf.$get({ param: { shareToken: shareToken! } });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    });

    test("shares a master's bonded creature without its private notes", async () => {
      const { masterId, bonded } = await createWizardWithFamiliar();
      await expectOk(character.$put({ param: { id: bonded.id }, json: { privateNotes: PRIVATE_NOTES } }));
      const { shareToken } = await expectOk(character.share.$post({ param: { id: masterId } }));

      const sheet = await expectOk(
        guestApi.api.shared.characters[":shareToken"].$get({ param: { shareToken: shareToken! } }),
      );
      expect(JSON.stringify(sheet)).not.toContain(PRIVATE_NOTES);
    });

    test("stops sharing once the token is revoked", async () => {
      const { id } = await postCharacter();
      const { shareToken } = await expectOk(character.share.$post({ param: { id } }));
      expect(await expectOk(character.share.$delete({ param: { id } }))).toMatchObject({ shareToken: null });
      const shared = guestApi.api.shared.characters[":shareToken"];
      await expectStatus(shared.$get({ param: { shareToken: shareToken! } }), 404);
      await expectStatus(shared.pdf.$get({ param: { shareToken: shareToken! } }), 404);
    });

    test("returns 404 for an unknown token, the sheet's PDF too", async () => {
      const shared = guestApi.api.shared.characters[":shareToken"];
      await expectStatus(shared.$get({ param: { shareToken: NIL_UUID } }), 404);
      await expectStatus(shared.pdf.$get({ param: { shareToken: NIL_UUID } }), 404);
    });
  });

  test("requires a session", async () => {
    const { id } = await postCharacter();
    await expectStatus(guestApi.api.characters.$get({ query: {} }), 401);
    await expectStatus(guestApi.api.characters[":id"].share.$post({ param: { id } }), 401);
    await expectStatus(
      guestApi.api.characters[":id"].scores[":link"].$put({ param: { id, link: "abilities" }, json: {} }),
      401,
    );
  });

  test("rejects a character without a name or fields, or with a field its form refuses", async () => {
    const ctx = await getSeedCtx();
    const fields = { xp: 0, alignment: "True Neutral", age: 25, gender: "Male", height: "5'10\"", weight: "170 lbs" };
    const valid = {
      rulesetId: ctx.rulesetId,
      picks: { raceId: ctx.raceMap.pc["Human"] },
      name: "Test",
      scores: {},
      fields,
    };
    const { alignment: _alignment, ...withoutAlignment } = fields;
    for (const json of [
      { fields },
      { ...valid, fields: undefined },
      { ...valid, fields: { ...fields, alignment: "Invalid Alignment" } },
      { ...valid, fields: { ...fields, gender: "InvalidGender" } },
      { ...valid, fields: { ...fields, xp: -1 } },
      { ...valid, fields: { ...fields, age: 0 } },
      { ...valid, fields: withoutAlignment },
      { ...valid, fields: { ...fields, strength: 18 } },
    ])
      await expectStatus(characters.$post({ json: json as never }), 400);
  });

  test("writes a new character's fields, an empty one left at its column's default", async () => {
    const { id } = await postCharacter({
      xp: 1500,
      alignment: "Lawful Good",
      gender: "Female",
      age: null,
      height: "",
      weight: "60",
      deity: "",
      description: "Tall",
    });
    expect(await Characters.findOne(db, { id })).toMatchObject({
      xp: 1500,
      alignment: "Lawful Good",
      gender: "Female",
      age: null,
      height: null,
      weight: "60",
      deity: null,
      description: "Tall",
    });
  });

  test("returns 404 for a missing character", async () => {
    const param = { id: NIL_UUID };
    await expectStatus(character.$get({ param }), 404);
    await expectStatus(character.$put({ param, json: { fields: { age: 30 } } }), 404);
    await expectStatus(character.$delete({ param }), 404);
    await expectStatus(character.unarchive.$post({ param }), 404);
  });
});
