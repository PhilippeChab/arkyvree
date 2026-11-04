import { describe, expect, test } from "bun:test";

import { RulesError } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Activities, Entities, EntitySnapshots } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { findLists } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { createSeededTestRuleset, createTestRuleset, ownerSessionOf } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The spells of the seeded core this file lists, by name. */
const SPELLS = ["Bless", "Cure Light Wounds", "Fireball", "Magic Missile"] as const;

/** The types of the activities a user recorded, the latest first. */
async function activityTypesOf(userId: string) {
  return (await Activities.findPage(db, { userId }, { limit: 10, page: 1 })).items.map((activity) => activity.type);
}

/** A spell's lists as stored (`spellId`'s `listedIn` links), each its list (`toId`) and its level there (`tier`). */
async function listingsOf(spellId: string) {
  return (await findLists(db, [spellId]))
    .map(({ tier, toId }) => ({ tier, toId }))
    .sort((a, b) => a.toId.localeCompare(b.toId));
}

/** The names of the spells on a list (`listId`) at a level (`tier`), as the class's Spell List tab reads them. */
async function namesOn(rulesetId: string, listId: string, tier: number) {
  const session = await ownerSessionOf(rulesetId);
  const page = await EntitiesService.getEntities(
    session,
    rulesetId,
    "spells",
    { listedIn: listId, tier },
    { limit: 1000, page: 1 },
  );
  return page.items.map((spell) => spell.name);
}

/**
 * A seeded fork as its owner reads it, its inherited Wizard and Fighter, the Wizard's spell list and the Cleric's, and
 * the seeded spells this file lists, by name.
 */
async function setup() {
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const session = await ownerSessionOf(fork.id);
  const { classMap } = await getSeedCtx();
  const [wizard, fighter, cleric] = [classMap.pc["Wizard"], classMap.pc["Fighter"], classMap.pc["Cleric"]];
  const listOf = async (classId: string) =>
    ((await EntitiesService.getEntityTable(session, fork.id, "classes", classId, "spell-lists")) as { id: string }[])[0]
      .id;
  const spells = await EntitiesService.getEntities(
    session,
    fork.id,
    "spells",
    { search: "" },
    { limit: 1000, page: 1 },
  );
  const spellId = (name: (typeof SPELLS)[number]) => spells.items.find((spell) => spell.name === name)!.id;
  return {
    fork,
    session,
    wizard,
    fighter,
    wizardList: await listOf(wizard),
    clericList: await listOf(cleric),
    spellId,
  };
}

describe("EntitiesService: a class's spell lists", () => {
  test("adds spells to a class's list at a spell level, on the fork's copies of inherited spells, keeping their other lists", async () => {
    const { fork, session, wizard, wizardList, clericList, spellId } = await setup();
    const [bless, cure] = [spellId("Bless"), spellId("Cure Light Wounds")];
    const coreListings = await listingsOf(bless);
    // The parent's cached rows, which every fork of it reads, stay
    const parentRows = await RulesetViews.getRawData(fork.rulesetId!);

    const added = await EntitiesService.addListedEntities(
      session,
      fork.id,
      "classes",
      wizard,
      wizardList,
      [bless, cure],
      1,
    );

    expect(added.map((spell) => spell.name)).toEqual(["Bless", "Cure Light Wounds"]);
    expect(added.map((spell) => spell.id)).not.toContain(bless);
    expect(await RulesetViews.getRawData(fork.rulesetId!)).toBe(parentRows);
    expect(await listingsOf(bless)).toEqual(coreListings);
    // The copy keeps the inherited spell's lists, the Wizard's added at its level
    const copied = await listingsOf(added[0].id);
    expect(copied).toContainEqual({ toId: wizardList, tier: 1 });
    expect(copied).toContainEqual({ toId: clericList, tier: 1 });
    expect(copied).toHaveLength(coreListings.length + 1);
    expect(await namesOn(fork.id, wizardList, 1)).toEqual(expect.arrayContaining(["Bless", "Cure Light Wounds"]));

    expect(await activityTypesOf(SEED_USER_ID)).toContain("addClassSpell");
    const [activity] = (await Activities.findPage(db, { userId: SEED_USER_ID }, { limit: 1, page: 1 })).items;
    expect(activity).toMatchObject({
      type: "addClassSpell",
      targetId: wizard,
      targetType: "classes",
      data: { entityName: "Wizard", listName: "Wizard Spells", tier: 1, toNames: ["Bless", "Cure Light Wounds"] },
    });
  });

  test("removes a spell from a class's list, keeping its other lists", async () => {
    const { fork, session, wizard, wizardList, spellId } = await setup();
    const fireball = spellId("Fireball");
    const before = await listingsOf(fireball);

    const removed = await EntitiesService.removeListedEntity(session, fork.id, "classes", wizard, wizardList, fireball);

    expect(removed.name).toBe("Fireball");
    expect(await listingsOf(removed.id)).toEqual(before.filter((listing) => listing.toId !== wizardList));
    expect(await namesOn(fork.id, wizardList, 3)).not.toContain("Fireball");
    const [activity] = (await Activities.findPage(db, { userId: SEED_USER_ID }, { limit: 1, page: 1 })).items;
    expect(activity).toMatchObject({
      type: "removeClassSpell",
      data: { entityName: "Wizard", listName: "Wizard Spells", tier: 3, toId: fireball, toName: "Fireball" },
    });
    // Added back, at another level
    await EntitiesService.addListedEntities(session, fork.id, "classes", wizard, wizardList, [fireball], 4);
    expect(await namesOn(fork.id, wizardList, 4)).toContain("Fireball");
  });

  // What the removal's confirmation reads, which says whether Local Changes can restore the removal
  test("answers a removal restorable for an inherited spell and the fork's copy of one, never for its own spell", async () => {
    const { fork, session, wizard, wizardList, spellId } = await setup();
    const fireball = spellId("Fireball");
    const restorable = async (id: string) =>
      (await EntitiesService.getEntity(session, fork.id, "spells", id)).restorableDelete;
    expect(await restorable(fireball)).toBe(true);
    // The fork edited Fireball earlier: its copy is restorable too
    const copy = await EntitiesService.updateEntity(session, fork.id, "spells", fireball, {
      name: "Fireball",
      description: "Edited in the fork",
    });
    expect(copy.id).not.toBe(fireball);
    expect(await restorable(copy.id)).toBe(true);
    const own = await EntitiesService.createEntity(session, fork.id, "spells", {
      name: "Fork Bolt",
      links: { listedIn: [{ toId: wizardList, tier: 2 }] },
    });
    expect(await restorable(own.id)).toBe(false);
    await EntitiesService.removeListedEntity(session, fork.id, "classes", wizard, wizardList, own.id);
    expect(await namesOn(fork.id, wizardList, 2)).not.toContain("Fork Bolt");
  });

  test("makes a new class's own list on its first add, with the spells, which its Spell List then shows, and keeps it once emptied", async () => {
    const { fork, session, spellId } = await setup();
    const witch = await EntitiesService.createEntity(session, fork.id, "classes", {
      name: "Witch",
      fields: { [CLASS_HD]: 6 },
    });
    const listsOf = async () =>
      (await EntitiesService.getEntityTable(session, fork.id, "classes", witch.id, "spell-lists")) as {
        id: string;
        name: string;
      }[];
    expect(await listsOf()).toEqual([]);
    const progression = await EntitiesService.getProgression(session, fork.id, "classes", witch.id);
    expect(progression.ownSpellList).toEqual({ id: null, name: "Witch Spells" });

    const [bless, magicMissile] = [spellId("Bless"), spellId("Magic Missile")];
    // All or none: a refused spell makes no list
    expect(
      EntitiesService.addListedEntities(session, fork.id, "classes", witch.id, undefined, [bless, NIL_UUID], 1),
    ).rejects.toEqual(new RulesError("invalid", `Spell ${NIL_UUID} does not belong to this ruleset`));
    expect(await listsOf()).toEqual([]);
    expect(await Entities.findOne(db, { entityType: "aptitudes", name: "Witch Spells", rulesetId: fork.id })).toBe(
      undefined,
    );

    const added = await EntitiesService.addListedEntities(
      session,
      fork.id,
      "classes",
      witch.id,
      undefined,
      [bless, magicMissile],
      1,
    );
    expect(added.map((spell) => spell.name)).toEqual(["Bless", "Magic Missile"]);
    const [list] = await listsOf();
    expect(list).toMatchObject({ name: "Witch Spells" });
    expect(await namesOn(fork.id, list.id, 1)).toEqual(["Bless", "Magic Missile"]);
    // Its own list now: a second add to its own list goes to it
    await EntitiesService.addListedEntities(session, fork.id, "classes", witch.id, undefined, [spellId("Fireball")], 3);
    expect(await namesOn(fork.id, list.id, 3)).toEqual(["Fireball"]);
    expect((await EntitiesService.getProgression(session, fork.id, "classes", witch.id)).ownSpellList).toEqual(list);

    for (const spell of [bless, magicMissile, spellId("Fireball")])
      await EntitiesService.removeListedEntity(session, fork.id, "classes", witch.id, list.id, spell);
    expect(await listsOf()).toEqual([list]);
    expect([await namesOn(fork.id, list.id, 1), await namesOn(fork.id, list.id, 3)]).toEqual([[], []]);
  });

  // As its Spells tab makes it: a class with no spell list gets its own, with no spells, and its spell tables a save
  test("makes a class's own list with no spells, once, whose spell tables then take a save", async () => {
    const { fork, session, fighter, wizard } = await setup();
    const progressionOf = (classId: string) => EntitiesService.getProgression(session, fork.id, "classes", classId);
    const before = await progressionOf(fighter);
    expect([before.spellList, before.ownSpellList, before.spellTablesRefusal]).toEqual([
      null,
      { id: null, name: "Fighter Spells" },
      "Fighter has no spell list to give spells in",
    ]);

    const created = await EntitiesService.createOwnList(session, fork.id, "classes", fighter);
    expect(created).toMatchObject({ name: "Fighter Spells", type: "aptitudes" });
    expect((await activityTypesOf(SEED_USER_ID))[0]).toBe("createAptitude");
    RulesetViews.invalidate(fork.id);
    const after = await progressionOf(fighter);
    const list = { id: created.id, name: "Fighter Spells" };
    expect([after.spellList, after.ownSpellList, after.spellTablesRefusal]).toEqual([list, list, null]);
    expect(await EntitiesService.getEntityTable(session, fork.id, "classes", fighter, "spell-lists")).toMatchObject([
      list,
    ]);

    expect(EntitiesService.createOwnList(session, fork.id, "classes", fighter)).rejects.toEqual(
      new RulesError("conflict", "Fighter Spells already exists"),
    );
    // The wizard casts from its own list already
    expect(EntitiesService.createOwnList(session, fork.id, "classes", wizard)).rejects.toEqual(
      new RulesError("conflict", "Wizard Spells already exists"),
    );
  });

  // A list the fork deleted leaves a tombstone, which the list its add makes takes over, as a create from its tab does
  test("makes a class's own list a fork deleted again, standing for the deleted one with its spells", async () => {
    const {
      session,
      user,
      ruleset: parent,
      aptitudeIds: [witchList, cleric],
    } = await createTestUserAndRuleset(["Witch Spells", "Cleric Spells"]);
    const witch = await EntitiesService.createEntity(session, parent.id, "classes", {
      name: "Witch",
      fields: { [CLASS_HD]: 6 },
    });
    const evilEye = await EntitiesService.createEntity(session, parent.id, "spells", {
      name: "Evil Eye",
      links: { listedIn: [{ toId: witchList, tier: 1 }] },
    });
    const guidance = await EntitiesService.createEntity(session, parent.id, "spells", {
      name: "Guidance",
      links: { listedIn: [{ toId: cleric, tier: 0 }] },
    });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id });
    await EntitiesService.deleteEntity(session, fork.id, "aptitudes", witchList);
    expect(await EntitiesService.getEntityTable(session, fork.id, "classes", witch.id, "spell-lists")).toEqual([]);

    await EntitiesService.addListedEntities(session, fork.id, "classes", witch.id, undefined, [guidance.id], 1);
    const made = await Entities.findOne(db, { entityType: "aptitudes", name: "Witch Spells", rulesetId: fork.id });
    const tombstone = await EntitySnapshots.findOne(db, { sourceEntityId: witchList, rulesetId: fork.id });
    expect(tombstone?.forkedEntityId).toBe(made!.id);
    expect((await namesOn(fork.id, made!.id, 1)).sort()).toEqual([evilEye.name, guidance.name]);
  });

  // A spell an add or a removal writes keeps the lists the fork's view holds: a deleted one's link names a gone copy
  test("adds and removes a spell still on a list the fork deleted: dropped from its lists, or kept as the list remade for it", async () => {
    const {
      session,
      user,
      ruleset: parent,
      aptitudeIds: [witchList],
    } = await createTestUserAndRuleset(["Witch Spells"]);
    const create = (type: "classes" | "spells", body: Parameters<typeof EntitiesService.createEntity>[3]) =>
      EntitiesService.createEntity(session, parent.id, type, body);
    const witch = await create("classes", { name: "Witch", fields: { [CLASS_HD]: 6 } });
    const oracle = await create("classes", { name: "Oracle", fields: { [CLASS_HD]: 8 } });
    const evilEye = await create("spells", { name: "Evil Eye", links: { listedIn: [{ toId: witchList, tier: 1 }] } });
    const guidance = await create("spells", { name: "Guidance", links: { listedIn: [{ toId: witchList, tier: 0 }] } });
    const add = (forkId: string, classId: string, spellId: string, tier: number) =>
      EntitiesService.addListedEntities(session, forkId, "classes", classId, undefined, [spellId], tier);
    const listOf = async (forkId: string, classId: string) => {
      const [list] = (await EntitiesService.getEntityTable(session, forkId, "classes", classId, "spell-lists")) as {
        id: string;
      }[];
      return list.id;
    };

    // Deleted: the spell's add to another list drops it
    const deleted = await createTestRuleset(user.id, { rulesetId: parent.id });
    await EntitiesService.deleteEntity(session, deleted.id, "aptitudes", witchList);
    const [copy] = await add(deleted.id, oracle.id, evilEye.id, 2);
    expect(await listingsOf(copy.id)).toEqual([{ toId: await listOf(deleted.id, oracle.id), tier: 2 }]);

    // Remade by the Witch's first add: the spell keeps it, by the remade list's id, and loses it again on its removal
    const remade = await createTestRuleset(user.id, { rulesetId: parent.id });
    await EntitiesService.deleteEntity(session, remade.id, "aptitudes", witchList);
    await add(remade.id, witch.id, guidance.id, 0);
    const witchSpells = await listOf(remade.id, witch.id);
    const [onBoth] = await add(remade.id, oracle.id, evilEye.id, 2);
    const oracleSpells = await listOf(remade.id, oracle.id);
    expect(await listingsOf(onBoth.id)).toEqual(
      [
        { toId: witchSpells, tier: 1 },
        { toId: oracleSpells, tier: 2 },
      ].sort((a, b) => a.toId.localeCompare(b.toId)),
    );
    await EntitiesService.removeListedEntity(session, remade.id, "classes", oracle.id, oracleSpells, evilEye.id);
    expect(await listingsOf(onBoth.id)).toEqual([{ toId: witchSpells, tier: 1 }]);
  });

  test("makes a class's own list in a ruleset of its owner's own too", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [cleric],
    } = await createTestUserAndRuleset(["Cleric Spells"]);
    const oracle = await EntitiesService.createEntity(session, ruleset.id, "classes", {
      name: "Oracle",
      fields: { [CLASS_HD]: 8 },
    });
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Guidance",
      links: { listedIn: [{ toId: cleric, tier: 0 }] },
    });

    const [added] = await EntitiesService.addListedEntities(
      session,
      ruleset.id,
      "classes",
      oracle.id,
      undefined,
      [spell.id],
      0,
    );
    expect(added.id).toBe(spell.id);
    const made = await Entities.findOne(db, { entityType: "aptitudes", name: "Oracle Spells", rulesetId: ruleset.id });
    expect(await listingsOf(spell.id)).toEqual(
      [
        { toId: cleric, tier: 0 },
        { toId: made!.id, tier: 0 },
      ].sort((a, b) => a.toId.localeCompare(b.toId)),
    );
  });

  test("refuses a spell already on the list, at any level, writing none of the spells sent", async () => {
    const { fork, session, wizard, wizardList, spellId } = await setup();
    const [bless, fireball] = [spellId("Bless"), spellId("Fireball")];

    expect(
      EntitiesService.addListedEntities(session, fork.id, "classes", wizard, wizardList, [bless, fireball], 1),
    ).rejects.toEqual(new RulesError("conflict", "Fireball is already on Wizard Spells"));
    expect(await namesOn(fork.id, wizardList, 1)).not.toContain("Bless");
    expect(await activityTypesOf(SEED_USER_ID)).not.toContain("addClassSpell");
  });

  test("refuses a level past the rules' bounds, a spell of no list's ruleset, and one sent twice", async () => {
    const { fork, session, wizard, wizardList, spellId } = await setup();
    const bless = spellId("Bless");
    const add = (ids: string[], tier: number | undefined) =>
      EntitiesService.addListedEntities(session, fork.id, "classes", wizard, wizardList, ids, tier);

    expect(add([bless], 10)).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "tier" }] });
    expect(add([bless], undefined)).rejects.toMatchObject({ refusal: "invalid", issues: [{ category: "tier" }] });
    expect(add([NIL_UUID], 1)).rejects.toEqual(
      new RulesError("invalid", `Spell ${NIL_UUID} does not belong to this ruleset`),
    );
    expect(add([bless, bless], 1)).rejects.toEqual(new RulesError("invalid", `Spell ${bless} is given more than once`));
  });

  test("refuses a list the class doesn't count on, a spell that isn't on it, and a kind without lists", async () => {
    const { fork, session, wizard, fighter, wizardList, clericList, spellId } = await setup();
    const [bless, magicMissile] = [spellId("Bless"), spellId("Magic Missile")];

    expect(
      EntitiesService.addListedEntities(session, fork.id, "classes", wizard, clericList, [magicMissile], 1),
    ).rejects.toEqual(new RulesError("not-found", "Spell list not found for Wizard"));
    expect(
      EntitiesService.addListedEntities(session, fork.id, "classes", fighter, wizardList, [bless], 1),
    ).rejects.toEqual(new RulesError("not-found", "Spell list not found for Fighter"));
    expect(EntitiesService.removeListedEntity(session, fork.id, "classes", wizard, wizardList, bless)).rejects.toEqual(
      new RulesError("not-found", "Bless is not on Wizard Spells"),
    );
    await expectRefusedWith(
      EntitiesService.removeListedEntity(session, fork.id, "classes", wizard, wizardList, NIL_UUID),
      404,
    );
    expect(
      EntitiesService.addListedEntities(session, fork.id, "races", wizard, wizardList, [bless], 1),
    ).rejects.toEqual(new RulesError("not-found", "No lists for races"));
  });

  test("refuses changes from anyone but who may edit the ruleset's content", async () => {
    const { fork, wizard, wizardList, spellId } = await setup();
    const { session: stranger } = await createTestUserAndRuleset();
    const bless = spellId("Bless");
    // A private ruleset isn't revealed to a stranger
    expect(
      EntitiesService.addListedEntities(stranger, fork.id, "classes", wizard, wizardList, [bless], 1),
    ).rejects.toThrow(NotFoundError);
    expect(
      EntitiesService.removeListedEntity(stranger, fork.id, "classes", wizard, wizardList, spellId("Fireball")),
    ).rejects.toThrow(NotFoundError);
    expect(EntitiesService.createOwnList(stranger, fork.id, "classes", wizard)).rejects.toThrow(NotFoundError);
  });
});
