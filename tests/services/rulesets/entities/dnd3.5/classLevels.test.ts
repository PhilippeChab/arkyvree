import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_DIVINE_NAME, DND35_RULESET_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import type {
  Aptitude,
  Feat,
  Klass,
  KlassLevel,
  RulesetAbility,
  RulesetSave,
  Spell,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, toJson } from "@/server/errors/index.ts";
import { Entities, EntityLinks, EntitySnapshots, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { readClassTable } from "@/tests/support/dnd3.5/classTables.ts";
import { addCharacterLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addGrants } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findFormValues } from "@/tests/support/ownerValues.ts";
import { copyEntity, createTestRuleset, ownerSessionOf } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, NIL_UUID } from "@/tests/support/seed.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS, FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

type LevelBody = Parameters<typeof EntitiesService.createOwnedEntity>[4];

function createLevel(
  session: Session,
  rulesetId: string,
  classId: string,
  level: number,
  body: Partial<LevelBody> = {},
) {
  return EntitiesService.createOwnedEntity(session, rulesetId, "classes", classId, {
    fields: { [CLASS_LEVEL_BAB]: level, [CLASS_LEVEL_SKILL_POINTS]: 4 },
    position: level,
    ...body,
  });
}

/** A level's fields as its answer holds them: its base attack bonus and its skill points, by their stored fields. */
function levelFields(bab: number, skills: number) {
  return { [CLASS_LEVEL_BAB]: bab, [CLASS_LEVEL_SKILL_POINTS]: skills };
}

function modifier(sourceId: string, target: string, value: string) {
  return { sourceId, sourceType: "class-levels", target, value, valueType: "number", operator: "add" } as const;
}

async function createSave(rulesetId: string, name: string) {
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    name: `${name} Ability`,
    description: name,
    rulesetId,
  });
  const [save] = await Entities.create<RulesetSave>(db, "saves", {
    name,
    rulesetId,
    links: { keyAbility: ability.id },
  });
  // Written past the services, which drop the ruleset's view on a save
  RulesetViews.invalidate(rulesetId);
  return save;
}

/** A new user's empty ruleset with a class and an aptitude. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const klass = await EntitiesService.createEntity(session, ruleset.id, "classes", { name: "Test Class" });
  const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
    name: "Fighter Bonus Feat",
    rulesetId: ruleset.id,
  });
  // Written past the services, after the class's create read the ruleset's view
  RulesetViews.invalidate(ruleset.id);
  return { user, session, ruleset, klass, aptitude, poolTarget: `aptitudes.${stripSeparators(aptitude.name)}.allowed` };
}

/** A fork of `setup()`'s ruleset, whose class has a first level. */
async function setupFork() {
  const context = await setup();
  const inheritedLevel = await createLevel(context.session, context.ruleset.id, context.klass.id, 1);
  const fork = await createTestRuleset(context.user.id, {
    rulesetId: context.ruleset.id,
    ancestorRulesetIds: [context.ruleset.id],
  });
  return { ...context, parent: context.ruleset, fork, inheritedLevel };
}

// Creating, reading, updating and deleting a level are covered in the class levels router test.
describe("EntitiesService: a class's levels", () => {
  describe("feats and saves", () => {
    test("lists a class's levels in order, with the feats they grant through an aptitude and their base saves", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Cleave",
        links: { listedIn: [{ toId: aptitude.id }] },
      });
      const fortitude = await createSave(ruleset.id, "Fortitude");
      await createLevel(session, ruleset.id, klass.id, 2);
      await createLevel(session, ruleset.id, klass.id, 1, {
        links: {
          grants: [{ toId: feat.id, viaId: aptitude.id, free: false }],
          baseBonus: [{ toId: fortitude.id, amount: 2 }],
        },
      });

      expect(
        await EntitiesService.getOwnedEntities(await ownerSessionOf(ruleset.id), ruleset.id, "classes", klass.id),
      ).toMatchObject([
        {
          position: 1,
          fields: levelFields(1, 4),
          links: [
            {
              role: "grants",
              toId: feat.id,
              toName: "Cleave",
              toDescription: null,
              viaId: aptitude.id,
              viaName: aptitude.name,
              free: false,
            },
            { role: "baseBonus", toId: fortitude.id, toName: "Fortitude", amount: 2 },
          ],
        },
        { position: 2, fields: { [CLASS_LEVEL_BAB]: 2 }, links: [] },
      ]);
    });

    test("answers a level's links alike in its create, its edit and its read", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const ids = new Map<string, string>();
      for (const name of ["Dodge", "Cleave"]) {
        const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
          name,
          description: `${name}'s benefit`,
          links: { listedIn: [{ toId: aptitude.id }] },
        });
        ids.set(name, feat.id);
      }
      const idOf = (name: string) => ids.get(name)!;
      const fortitude = await createSave(ruleset.id, "Fortitude");
      // A pool that doesn't list the feat granted through it: the grant names none
      const [other] = await Entities.create<Aptitude>(db, "aptitudes", { name: "Other Pool", rulesetId: ruleset.id });
      RulesetViews.invalidate(ruleset.id);

      const created = await createLevel(session, ruleset.id, klass.id, 1, {
        links: {
          grants: [
            { toId: idOf("Dodge"), viaId: aptitude.id },
            { toId: idOf("Cleave"), viaId: other.id, free: false },
          ],
          baseBonus: [{ toId: fortitude.id, amount: 2 }],
        },
      });
      // The feats it grants by their names, each its pool's name where the pool lists it, and its saves' base bonuses
      const links = [
        {
          role: "grants",
          toId: idOf("Cleave"),
          toName: "Cleave",
          toDescription: "Cleave's benefit",
          viaId: other.id,
          viaName: null,
          free: false,
        },
        {
          role: "grants",
          toId: idOf("Dodge"),
          toName: "Dodge",
          toDescription: "Dodge's benefit",
          viaId: aptitude.id,
          viaName: aptitude.name,
          free: true,
        },
        { role: "baseBonus", toId: fortitude.id, toName: "Fortitude", amount: 2 },
      ];
      expect(created.links).toMatchObject(links);
      expect(
        (
          await EntitiesService.getOwnedEntityWithOwner(
            await ownerSessionOf(ruleset.id),
            ruleset.id,
            "classes",
            created.id,
          )
        ).links,
      ).toMatchObject(links);

      const edited = await EntitiesService.updateOwnedEntity(session, ruleset.id, "classes", klass.id, created.id, {
        links: { baseBonus: [{ toId: fortitude.id, amount: 3 }] },
      });
      const editedLinks = links.map((link) => (link.role === "baseBonus" ? { ...link, amount: 3 } : link));
      expect(edited.links).toMatchObject(editedLinks);
      expect(
        (await EntitiesService.getOwnedEntities(await ownerSessionOf(ruleset.id), ruleset.id, "classes", klass.id))[0]
          .links,
      ).toMatchObject(editedLinks);
    });

    test("answers a grant whose feat and pool its fork copied after the class as the copies, in its edit as in its read", async () => {
      const { session, fork, klass, aptitude, inheritedLevel } = await setupFork();
      const feat = await EntitiesService.createEntity(session, fork.id, "feats", {
        name: "Dodge",
        links: { listedIn: [{ toId: aptitude.id }] },
      });
      // The fork copies the class (and its level) first, while its grant names the inherited pool
      const level = await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, inheritedLevel.id, {
        links: { grants: [{ toId: feat.id, viaId: aptitude.id }] },
      });
      const pool = await EntitiesService.updateEntity(session, fork.id, "aptitudes", aptitude.id, { name: "Our Pool" });

      // Its stored grant names the original pool, which its view reads as the fork's copy
      const edited = await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, level.id, {
        fields: { [CLASS_LEVEL_SKILL_POINTS]: 6 },
      });
      const read = await EntitiesService.getOwnedEntityWithOwner(session, fork.id, "classes", level.id);
      expect(edited.links).toEqual([
        expect.objectContaining({ toId: feat.id, viaId: pool.id, toName: "Dodge", viaName: "Our Pool" }),
      ]);
      expect(edited.links).toEqual(read.links);
    });

    test("writes each level's base attack bonus as the sheet does: its attacks a round", async () => {
      const { session, ruleset, klass } = await setup();
      for (const [level, bab] of [
        [1, 0],
        [2, 6],
        [3, 11],
      ]) {
        await createLevel(session, ruleset.id, klass.id, level, {
          fields: { [CLASS_LEVEL_BAB]: bab, [CLASS_LEVEL_SKILL_POINTS]: 4 },
        });
      }

      expect(
        (await EntitiesService.getOwnedEntities(await ownerSessionOf(ruleset.id), ruleset.id, "classes", klass.id)).map(
          (level) => level.babLabel,
        ),
      ).toEqual(["+0", "+6/+1", "+11/+6/+1"]);
    });

    test("names what its fork copied as the copy, sent by its source's id, and refuses one it lacks by name", async () => {
      const { user, session, ruleset, klass, aptitude } = await setup();
      const feat = await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Cleave",
        links: { listedIn: [{ toId: aptitude.id }] },
      });
      const fortitude = await createSave(ruleset.id, "Fortitude");
      const fork = await createTestRuleset(user.id, { rulesetId: ruleset.id, ancestorRulesetIds: [ruleset.id] });
      const copies = {
        aptitude: (await copyEntity(db, "aptitudes", aptitude.id, fork)).id,
        feat: (await copyEntity(db, "feats", feat.id, fork)).id,
        save: (await copyEntity(db, "saves", fortitude.id, fork)).id,
      };
      RulesetViews.invalidate(fork.id);
      const grantsOf = async (levelId: string) => ({
        feats: await EntityLinks.findMany(db, { fromIds: [levelId], role: "grants" }),
        saves: await EntityLinks.findMany(db, { fromIds: [levelId], role: "baseBonus" }),
      });
      const copied = {
        feats: [{ viaId: copies.aptitude, toId: copies.feat }],
        saves: [{ toId: copies.save, amount: 2 }],
      };

      // The parent's ids are the sources': the API takes them, as it takes the copies' the client sends
      const grants = {
        links: { grants: [{ toId: feat.id, viaId: aptitude.id }], baseBonus: [{ toId: fortitude.id, amount: 2 }] },
      };
      const level = await createLevel(session, fork.id, klass.id, 1, grants);
      expect(await grantsOf(level.id)).toMatchObject(copied);
      await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, level.id, {
        links: { grants: [], baseBonus: [] },
      });
      await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, level.id, grants);
      expect(await grantsOf(level.id)).toMatchObject(copied);

      // An id it lacks was a 500; one save named by both its ids, two rows of it
      const lacking = (label: string) => ({ message: `${label} ${NIL_UUID} does not belong to this ruleset` });
      const unknownFeat = { links: { grants: [{ toId: NIL_UUID, viaId: aptitude.id }] } };
      expect(createLevel(session, fork.id, klass.id, 2, unknownFeat)).rejects.toMatchObject(lacking("Feat"));
      const unknownSave = { links: { baseBonus: [{ toId: NIL_UUID, amount: 1 }] } };
      expect(createLevel(session, fork.id, klass.id, 2, unknownSave)).rejects.toMatchObject(lacking("Save"));
      const twice = { links: { baseBonus: [...grants.links.baseBonus, { toId: copies.save, amount: 1 }] } };
      expect(createLevel(session, fork.id, klass.id, 2, twice)).rejects.toMatchObject({
        message: `Save ${copies.save} is given more than once`,
        refusal: "invalid",
      });
    });

    test("an update replaces them, keeps them when it omits them, and clears them", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const [cleave, dodge] = await Entities.createMany<Feat>(db, "feats", [
        { name: "Cleave", rulesetId: ruleset.id },
        { name: "Dodge", rulesetId: ruleset.id },
      ]);
      const [fortitude, reflex] = [await createSave(ruleset.id, "Fortitude"), await createSave(ruleset.id, "Reflex")];
      const level = await createLevel(session, ruleset.id, klass.id, 1, {
        links: { grants: [{ toId: cleave.id, viaId: aptitude.id }], baseBonus: [{ toId: fortitude.id, amount: 2 }] },
      });
      const update = (body: Partial<LevelBody>) =>
        EntitiesService.updateOwnedEntity(session, ruleset.id, "classes", klass.id, level.id, body);
      const links = async () => ({
        feats: (await EntityLinks.findMany(db, { fromIds: [level.id], role: "grants" })).map((f) => f.toId),
        saves: (await EntityLinks.findMany(db, { fromIds: [level.id], role: "baseBonus" })).map((s) => s.toId),
      });

      await update({
        links: { grants: [{ toId: dodge.id, viaId: aptitude.id }], baseBonus: [{ toId: reflex.id, amount: 2 }] },
      });
      expect(await links()).toEqual({ feats: [dodge.id], saves: [reflex.id] });
      await update({ fields: { [CLASS_LEVEL_BAB]: 2 } });
      expect(await links()).toEqual({ feats: [dodge.id], saves: [reflex.id] });
      await update({ links: { grants: [], baseBonus: [] } });
      expect(await links()).toEqual({ feats: [], saves: [] });
    });
  });

  test("reads a level with its customizations, and by id alone with its class's name", async () => {
    const { session, ruleset, klass } = await setup();
    await createLevel(session, ruleset.id, klass.id, 1);
    const level = await createLevel(session, ruleset.id, klass.id, 2);
    await Modifiers.create(db, modifier(level.id, "combat.bab", "1"));
    await Requirements.create(db, {
      entityId: level.id,
      entityType: "class-levels",
      level: "1",
      target: "abilities.strength.total",
      operator: "greater_than_or_equal",
      value: "13",
      valueType: "number",
    });

    const detail = {
      id: level.id,
      position: 2,
      fields: levelFields(2, 4),
      modifiers: [{ target: "combat.bab" }],
      requirements: [{ target: "abilities.strength.total", value: "13" }],
    };
    expect(
      await EntitiesService.getOwnedEntityWithOwner(await ownerSessionOf(ruleset.id), ruleset.id, "classes", level.id),
    ).toMatchObject({
      ...detail,
      name: "Test Class",
    });
  });

  test("keeps the level's other fields when its BAB changes", async () => {
    // Regression: saving BAB or skill points once replaced every field of the level.
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);

    expect(
      await EntitiesService.updateOwnedEntity(session, ruleset.id, "classes", klass.id, level.id, {
        fields: { [CLASS_LEVEL_BAB]: 3 },
      }),
    ).toMatchObject({ fields: levelFields(3, 4) });
    const { fields } = await findFormValues("class-levels", level.id);
    expect(Object.keys(fields).sort()).toEqual([CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS]);
  });

  test("refuses an edit started from a stale level, unless it sends no token", async () => {
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    const update = (bab: number, updatedAt?: string) =>
      EntitiesService.updateOwnedEntity(session, ruleset.id, "classes", klass.id, level.id, {
        fields: { [CLASS_LEVEL_BAB]: bab },
        updatedAt,
      });

    const edited = await update(2, level.updatedAt);
    expect(edited.updatedAt).not.toBe(level.updatedAt);
    await expectRefusedWith(update(3, level.updatedAt), 409);
    expect(await update(4, edited.updatedAt)).toMatchObject({ fields: { [CLASS_LEVEL_BAB]: 4 } });
    expect(await update(5)).toMatchObject({ fields: { [CLASS_LEVEL_BAB]: 5 } });
  });

  describe("feat pools", () => {
    test("add up the picks each level grants, leaving spell slots out", async () => {
      const { session, ruleset, klass, aptitude, poolTarget } = await setup();
      const [first, second] = [
        await createLevel(session, ruleset.id, klass.id, 1),
        await createLevel(session, ruleset.id, klass.id, 2),
      ];
      await createLevel(session, ruleset.id, klass.id, 3);
      await Modifiers.createMany(db, [
        modifier(first.id, poolTarget, "1"),
        modifier(second.id, poolTarget, "1"),
        modifier(first.id, "aptitudes.wizardspells.1.uses", "1"),
      ]);

      expect((await readClassTable(ruleset.id, klass.id, "feat-pools")).map((l) => l.featPools)).toEqual([
        { [aptitude.name]: 1 },
        { [aptitude.name]: 2 },
        { [aptitude.name]: 2 },
      ]);
    });

    test("count a stackable feat's picks at every level that grants it", async () => {
      // Regression: only the levels' own modifiers were read, so a pool granted through a feat was missing.
      const { session, ruleset, klass, aptitude, poolTarget } = await setup();
      const [bonusFeat] = await Entities.create<Feat>(db, "feats", {
        name: "Bonus Feat",
        rulesetId: ruleset.id,
        fields: { [FEAT_STACKABLE]: true },
      });
      await Modifiers.create(db, { ...modifier(bonusFeat.id, poolTarget, "1"), sourceType: "feats" });
      for (const level of [1, 2]) {
        const created = await createLevel(session, ruleset.id, klass.id, level);
        await addGrants(db, created.id, "feats", [{ toId: bonusFeat.id, viaId: aptitude.id, free: true }]);
      }

      expect((await readClassTable(ruleset.id, klass.id, "feat-pools")).map((l) => l.featPools)).toEqual([
        { [aptitude.name]: 1 },
        { [aptitude.name]: 2 },
      ]);
    });
  });

  test("adds up the spells per day each level grants, leaving feat pools out", async () => {
    const { session, ruleset, klass, poolTarget } = await setup();
    const [first, second] = [
      await createLevel(session, ruleset.id, klass.id, 1),
      await createLevel(session, ruleset.id, klass.id, 2),
    ];
    await Modifiers.createMany(db, [
      modifier(first.id, "aptitudes.wizardspells.0.uses", "3"),
      modifier(first.id, "aptitudes.wizardspells.1.uses", "1"),
      modifier(first.id, poolTarget, "1"),
      modifier(second.id, "aptitudes.wizardspells.0.uses", "1"),
      modifier(second.id, "aptitudes.wizardspells.1.uses", "1"),
    ]);

    expect((await readClassTable(ruleset.id, klass.id, "spells")).map((l) => l.spellsPerDay)).toEqual([
      { 0: 3, 1: 1 },
      { 0: 4, 1: 2 },
    ]);
  });

  test("writes 0 spells a day at a spell level the class casts but gives no uses at yet, as the SRD: a paladin's", async () => {
    const core = await findSeededRuleset(DND35_RULESET_NAME);
    const paladin = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Paladin",
      rulesetId: core.id,
    }))!;
    const perDay = (await readClassTable(core.id, paladin.id, "spells")).map((l) => l.spellsPerDay);
    // None before the 4th level, its 1st-level spells its bonus spells alone fill at the 4th and 5th, one at the 6th
    expect(perDay.slice(2, 6)).toEqual([{}, { 1: 0 }, { 1: 0 }, { 1: 1 }]);
  });

  test("reads a spell list's slots whatever its class's name holds: the Ur-priest's", async () => {
    const divine = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
    const urPriest = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Ur-priest",
      rulesetId: divine.id,
    }))!;
    const perDay = (await readClassTable(divine.id, urPriest.id, "spells")).map((l) => l.spellsPerDay);
    // Complete Divine's table: 4 and 2 at the 1st level; at the 4th, 6/3/2/1/0 (its 4th-level spells its bonus spells
    // alone fill)
    expect([perDay[0], perDay[3]]).toEqual([
      { 0: 4, 1: 2 },
      { 0: 6, 1: 3, 2: 2, 3: 1, 4: 0 },
    ]);
    const known = (await readClassTable(divine.id, urPriest.id, "spells-known")).map((l) => l.spellsKnown);
    expect(known[0]).toMatchObject({ 0: "All", 1: "All" });
  });

  test("refuses changes from anyone but the owner", async () => {
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    const { session: other } = await createTestUserAndRuleset();
    for (const change of [
      () => createLevel(other, ruleset.id, klass.id, 2),
      () =>
        EntitiesService.updateOwnedEntity(other, ruleset.id, "classes", klass.id, level.id, {
          fields: { [CLASS_LEVEL_BAB]: 3 },
        }),
      () => EntitiesService.deleteOwnedEntity(other, ruleset.id, "classes", klass.id, level.id),
      // Its access checked before its class is looked up
      () => EntitiesService.deleteOwnedEntity(other, ruleset.id, "classes", NIL_UUID, level.id),
    ])
      // A private ruleset isn't revealed to a stranger, its own 404 before its class's
      expect(change()).rejects.toThrow("Ruleset not found");
  });

  test("doesn't find a missing ruleset, class or level, nor a level through another ruleset", async () => {
    const { session, ruleset, klass } = await setup();
    const level = await createLevel(session, ruleset.id, klass.id, 1);
    const other = await setup();
    const cases: [string, () => Promise<unknown>][] = [
      ["create in a missing ruleset", () => createLevel(session, NIL_UUID, klass.id, 2)],
      ["create for a missing class", () => createLevel(session, ruleset.id, NIL_UUID, 2)],
      [
        "update in a missing ruleset",
        () =>
          EntitiesService.updateOwnedEntity(session, NIL_UUID, "classes", klass.id, level.id, {
            fields: { [CLASS_LEVEL_BAB]: 2 },
          }),
      ],
      [
        "update for a missing class",
        () =>
          EntitiesService.updateOwnedEntity(session, ruleset.id, "classes", NIL_UUID, level.id, {
            fields: { [CLASS_LEVEL_BAB]: 2 },
          }),
      ],
      [
        "delete in a missing ruleset",
        () => EntitiesService.deleteOwnedEntity(session, NIL_UUID, "classes", klass.id, level.id),
      ],
      [
        "delete for a missing class",
        () => EntitiesService.deleteOwnedEntity(session, ruleset.id, "classes", NIL_UUID, level.id),
      ],
      [
        "read a missing level",
        async () =>
          EntitiesService.getOwnedEntityWithOwner(await ownerSessionOf(ruleset.id), ruleset.id, "classes", NIL_UUID),
      ],
      [
        "read by id through another ruleset",
        async () =>
          EntitiesService.getOwnedEntityWithOwner(
            await ownerSessionOf(other.ruleset.id),
            other.ruleset.id,
            "classes",
            level.id,
          ),
      ],
      ["feat pools of a missing ruleset", () => readClassTable(NIL_UUID, klass.id, "feat-pools")],
      ["feat pools of a missing class", () => readClassTable(ruleset.id, NIL_UUID, "feat-pools")],
      ["spells of a missing ruleset", () => readClassTable(NIL_UUID, klass.id, "spells")],
    ];
    // One at a time: each write opens a savepoint on the test's single connection.
    for (const [what, call] of cases) {
      expect({
        what,
        status: await call().then(
          () => null,
          (error: Error) => toJson(error)[1],
        ),
      }).toEqual({ what, status: 404 });
    }
  });

  describe("deleting a level", () => {
    test("deletes its feats, spells, saves and customizations", async () => {
      const { session, ruleset, klass, aptitude } = await setup();
      const [feat] = await Entities.create<Feat>(db, "feats", { name: "Cleave", rulesetId: ruleset.id });
      const [spell] = await Entities.create<Spell>(db, "spells", { name: "Rage", rulesetId: ruleset.id });
      const save = await createSave(ruleset.id, "Fortitude");
      await createLevel(session, ruleset.id, klass.id, 1);
      const level = await createLevel(session, ruleset.id, klass.id, 2, {
        links: { grants: [{ toId: feat.id, viaId: aptitude.id }], baseBonus: [{ toId: save.id, amount: 2 }] },
      });
      // A spell grant, which no form writes, as its storage declares it: the delete removes it
      await addGrants(db, level.id, "spells", [{ toId: spell.id, viaId: aptitude.id }]);
      await Modifiers.create(db, modifier(level.id, "combat.bab", "1"));

      await EntitiesService.deleteOwnedEntity(session, ruleset.id, "classes", klass.id, level.id);

      expect(await Entities.findOne<KlassLevel>(db, { entityType: "class-levels", id: level.id })).toBeUndefined();
      expect(await EntityLinks.findMany(db, { fromIds: [level.id] })).toEqual([]);

      expect(await Modifiers.findMany(db, { sourceIds: [level.id], sourceType: "class-levels" })).toEqual([]);
      expect(await Requirements.findMany(db, { entityIds: [level.id], entityType: "class-levels" })).toEqual([]);
      expect(await findFormValues("class-levels", level.id)).toEqual({ fields: {}, links: {} });
    });

    test("is refused while a character has taken it", async () => {
      const { user, session, ruleset, klass } = await setup();
      const level = await createLevel(session, ruleset.id, klass.id, 1);
      const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
      await addCharacterLevel(character.id, level.id);

      expect(EntitiesService.deleteOwnedEntity(session, ruleset.id, "classes", klass.id, level.id)).rejects.toThrow(
        ConflictError,
      );
      // Checked before its class is looked up: sent with a class the ruleset has none of too
      expect(EntitiesService.deleteOwnedEntity(session, ruleset.id, "classes", NIL_UUID, level.id)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe("in a fork", () => {
    test("reads the inherited class's levels", async () => {
      const { parent, fork, klass, inheritedLevel } = await setupFork();
      expect(
        await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", klass.id),
      ).toMatchObject([{ id: inheritedLevel.id, position: 1, fields: { [CLASS_LEVEL_BAB]: 1 } }]);
      expect(
        await EntitiesService.getOwnedEntityWithOwner(
          await ownerSessionOf(fork.id),
          fork.id,
          "classes",
          inheritedLevel.id,
        ),
      ).toMatchObject({
        id: inheritedLevel.id,
      });
      // Held by the parent, as its class is: a delete of it in the fork can be undone
      expect(
        await EntitiesService.getOwnedEntityWithOwner(
          await ownerSessionOf(fork.id),
          fork.id,
          "classes",
          inheritedLevel.id,
        ),
      ).toMatchObject({
        id: inheritedLevel.id,
        name: klass.name,
        rulesetId: parent.id,
      });
    });

    test("adds a level to the fork's copy of the class, not to the parent's", async () => {
      const { session, parent, fork, klass } = await setupFork();
      // The fork's change is its copy's: the parent's cached rows, which every fork of it reads, stay
      const parentRows = await RulesetViews.getRawData(parent.id);
      const created = await createLevel(session, fork.id, klass.id, 2);
      expect(await RulesetViews.getRawData(parent.id)).toBe(parentRows);

      const snapshot = await EntitySnapshots.findOne(db, {
        sourceEntityId: klass.id,
        rulesetId: fork.id,
      });
      expect(created.ownerId).toBe(snapshot!.forkedEntityId);
      expect(
        (await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [klass.id] })).map(
          (l) => l.position,
        ),
      ).toEqual([1]);
    });

    test("edits and deletes the fork's copy of an inherited level, leaving the parent's", async () => {
      const { session, parent, fork, klass, inheritedLevel } = await setupFork();
      const parentRows = await RulesetViews.getRawData(parent.id);
      // Regression: the first edit copies the level mid-save, and a stat the edit leaves out was read as 0.
      expect(
        await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, inheritedLevel.id, {
          fields: { [CLASS_LEVEL_BAB]: 5 },
          updatedAt: inheritedLevel.updatedAt,
        }),
      ).toMatchObject({ fields: levelFields(5, 4) });

      await EntitiesService.deleteOwnedEntity(session, fork.id, "classes", klass.id, inheritedLevel.id);
      expect(await RulesetViews.getRawData(parent.id)).toBe(parentRows);
      expect(
        await EntitiesService.getOwnedEntities(await ownerSessionOf(fork.id), fork.id, "classes", klass.id),
      ).toEqual([]);
      expect(
        await EntitiesService.getOwnedEntities(await ownerSessionOf(parent.id), parent.id, "classes", klass.id),
      ).toMatchObject([{ id: inheritedLevel.id, fields: levelFields(1, 4) }]);
    });

    test("doesn't find a class of an unrelated ruleset", async () => {
      const { session, fork } = await setupFork();
      const other = await setup();
      const otherLevel = await createLevel(other.session, other.ruleset.id, other.klass.id, 1);

      await expectRefusedWith(createLevel(session, fork.id, other.klass.id, 1), 404);
      await expectRefusedWith(
        EntitiesService.updateOwnedEntity(session, fork.id, "classes", other.klass.id, otherLevel.id, {
          fields: { [CLASS_LEVEL_BAB]: 2 },
        }),
        404,
      );
      await expectRefusedWith(readClassTable(fork.id, other.klass.id, "spells"), 404);
    });
  });
});
