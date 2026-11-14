import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { advancementsInCharacter } from "@/drizzle/schema.ts";
import type { Aptitude, Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks, EntitySnapshots } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { addCharacterLevel, findClassLevel, findPicks } from "@/tests/support/dnd3.5/levels.ts";
import { addLists, findLists } from "@/tests/support/dnd3.5/links.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createTestRuleset,
  readCowData,
  readView,
  sourcesOf,
} from "@/tests/support/rulesets.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** A published extension of the seeded core rules, of a user's. */
async function createBook(userId: string, coreId: string) {
  return await createTestRuleset(userId, { rulesetId: coreId, kind: "extension", private: false, status: "Published" });
}

/** The feats of a name a ruleset's view shows. */
async function featsNamed(rulesetId: string, name: string) {
  return Dnd35View.of(await readView(rulesetId)).feats.filter((feat) => feat.name === name);
}

/**
 * A fork of the seeded core rules, subscribed to books of its owner's that each copy the core Dodge (as many as
 * `books`), and the core Dodge.
 */
async function subscribeToCopies(books = 1) {
  const { session, user } = await createTestUser();
  const host = await createSeededTestRuleset(user.id);
  const coreId = host.rulesetId!;
  const dodge = (await Entities.findOne<Feat>(db, { entityType: "feats", name: "Dodge", rulesetId: coreId }))!;
  const copies = [];
  for (let index = 0; index < books; index++) {
    const book = await createBook(user.id, coreId);
    copies.push({ book, copy: await copyEntity(db, "feats", dodge.id, book) });
  }
  await RulesetExtensionsService.subscribeExtension(
    session,
    host.id,
    copies.map(({ book }) => book.id),
  );
  return { copies, coreId, dodge, host, session, user };
}

// The fork's copy of a feat two books copied takes the losing book's list, which the fork deleted since: the copy keeps
// naming that list as the book stored it, which the fork's view resolves to its deleted copy, and which leaves with
// the book, but names nothing the fork shows
test("unsubscribing from a book whose list the fork deleted, which a copy of another book's feat still names", async () => {
  const { session, user } = await createTestUser();
  const host = await createSeededTestRuleset(user.id);
  const coreId = host.rulesetId!;
  const dodge = (await Entities.findOne<Feat>(db, { entityType: "feats", name: "Dodge", rulesetId: coreId }))!;
  const winner = await createBook(user.id, coreId);
  const loser = await createBook(user.id, coreId);
  await copyEntity(db, "feats", dodge.id, winner);
  const loserCopy = await copyEntity(db, "feats", dodge.id, loser);
  const [list] = await Entities.create<Aptitude>(db, DND35_BASE_RULES, "aptitudes", {
    name: `Loser List ${uniqueId()}`,
    rulesetId: loser.id,
  });
  await addLists(db, "feats", loserCopy.id, [{ toId: list.id }]);
  await RulesetExtensionsService.subscribeExtension(session, host.id, [winner.id, loser.id]);
  RulesetViews.invalidate(host.id);

  await EntitiesService.deleteEntity(session, host.id, "aptitudes", list.id);
  const { sourceId: copyId } = await ModifiersService.createModifier(
    session,
    host.id,
    "feats",
    dodge.id,
    STRENGTH_BONUS,
  );
  expect((await EntityLinks.findMany(db, { fromIds: [copyId], role: "listedIn" })).map((link) => link.toId)).toContain(
    list.id,
  );

  await RulesetExtensionsService.unsubscribeExtension(session, host.id, loser.id);

  expect((await sourcesOf(host.id)).extensionIds).toEqual([winner.id]);
});

describe("unsubscribing from a book whose copy of a core entity the fork changed", () => {
  test("keeps the fork's copy, a copy of the core one, and what named the book's copy names it", async () => {
    const { copies, dodge, host, session, user } = await subscribeToCopies();
    const [{ book, copy: bookCopy }] = copies;
    const general = (await getSeedCtx()).aptMap["General"];
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { id: levelId } = (await findClassLevel((await getSeedCtx()).classMap.pc["Fighter"], 1))!;
    const level = await addCharacterLevel(character.id, levelId, { feats: { [general]: [bookCopy.id] } });
    const mine = await EntitiesService.updateEntity(session, host.id, "feats", bookCopy.id, {
      name: "Dodge",
      description: "The fork's own words",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, book.id);

    expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toMatchObject([
      { forkedEntityId: mine.id, sourceEntityId: dodge.id },
    ]);
    expect(await featsNamed(host.id, "Dodge")).toMatchObject([{ id: mine.id, description: "The fork's own words" }]);
    const [pick] = await findPicks("feats", [level.id]);
    expect((await readCowData(host.id)).resolve(pick.entityId!)).toBe(mine.id);
  });

  test("keeps the fork's delete of the book's copy: the core one doesn't show again", async () => {
    const { copies, dodge, host, session } = await subscribeToCopies();
    const [{ book, copy: bookCopy }] = copies;
    await EntitiesService.deleteEntity(session, host.id, "feats", bookCopy.id);

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, book.id);

    expect(await featsNamed(host.id, "Dodge")).toEqual([]);
    expect(await RulesetChangesService.getChanges(session, host.id)).toMatchObject([
      { entityType: "feats", name: "Dodge", sourceEntityId: dodge.id, status: "deleted" },
    ]);
  });

  test("keeps it a copy of another book's copy, which wins once the first book is gone, then of the core one", async () => {
    const { copies, dodge, host, session } = await subscribeToCopies(2);
    const [{ book: first, copy: firstCopy }, { book: second, copy: secondCopy }] = copies;
    const { sourceId: mine } = await ModifiersService.createModifier(
      session,
      host.id,
      "feats",
      firstCopy.id,
      STRENGTH_BONUS,
    );

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, first.id);
    expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toMatchObject([
      { forkedEntityId: mine, sourceEntityId: secondCopy.id },
    ]);
    expect((await featsNamed(host.id, "Dodge")).map((feat) => feat.id)).toEqual([mine]);

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, second.id);
    expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toMatchObject([
      { forkedEntityId: mine, sourceEntityId: dodge.id },
    ]);
    expect((await featsNamed(host.id, "Dodge")).map((feat) => feat.id)).toEqual([mine]);
  });

  test("shows the fork's copy alone once it subscribes again, and a restore shows the book's copy", async () => {
    const { copies, host, session } = await subscribeToCopies();
    const [{ book, copy: bookCopy }] = copies;
    const { sourceId: mine } = await ModifiersService.createModifier(
      session,
      host.id,
      "feats",
      bookCopy.id,
      STRENGTH_BONUS,
    );
    await RulesetExtensionsService.unsubscribeExtension(session, host.id, book.id);

    await RulesetExtensionsService.subscribeExtension(session, host.id, [book.id]);
    expect((await featsNamed(host.id, "Dodge")).map((feat) => feat.id)).toEqual([mine]);

    const [snapshot] = await EntitySnapshots.findMany(db, { rulesetId: host.id });
    await RulesetChangesService.revertOverride(session, host.id, "feats", snapshot.sourceEntityId);
    expect((await featsNamed(host.id, "Dodge")).map((feat) => feat.id)).toEqual([bookCopy.id]);
  });

  test("drops the fork's copy's link to a list only the book has, and refuses nothing for it", async () => {
    const { copies, host, session } = await subscribeToCopies();
    const [{ book, copy: bookCopy }] = copies;
    const [list] = await Entities.create<Aptitude>(db, DND35_BASE_RULES, "aptitudes", {
      name: `Book List ${uniqueId()}`,
      rulesetId: book.id,
    });
    await addLists(db, "feats", bookCopy.id, [{ toId: list.id }]);
    RulesetViews.invalidate(host.id);
    const { sourceId: mine } = await ModifiersService.createModifier(
      session,
      host.id,
      "feats",
      bookCopy.id,
      STRENGTH_BONUS,
    );
    expect((await findLists(db, [mine])).map((link) => link.toId)).toContain(list.id);

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, book.id);

    expect((await findLists(db, [mine])).map((link) => link.toId)).not.toContain(list.id);
    expect((await featsNamed(host.id, "Dodge")).map((feat) => feat.id)).toEqual([mine]);
  });

  test("keeps the fork's copy of a class, its levels with it: a character's level in the book's reads the fork's", async () => {
    const { session, user } = await createTestUser();
    const host = await createSeededTestRuleset(user.id);
    const fighter = (await getSeedCtx()).classMap.pc["Fighter"];
    const book = await createBook(user.id, host.rulesetId!);
    const bookFighter = await copyEntity(db, "classes", fighter, book);
    await RulesetExtensionsService.subscribeExtension(session, host.id, [book.id]);
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const level = await addCharacterLevel(character.id, (await findClassLevel(bookFighter.id, 1))!.id);
    const mine = await EntitiesService.updateEntity(session, host.id, "classes", bookFighter.id, {
      name: "Fighter",
      description: "The fork's own words",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, host.id, book.id);

    const [{ entryId }] = await db
      .select()
      .from(advancementsInCharacter)
      .where(eq(advancementsInCharacter.id, level.id));
    expect((await readCowData(host.id)).resolve(entryId)).toBe((await findClassLevel(mine.id, 1))!.id);
  });
});
