import { expect, test } from "bun:test";

import type { Aptitude, Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { addLists } from "@/tests/support/dnd3.5/links.ts";
import { copyEntity, createSeededTestRuleset, createTestRuleset, sourcesOf } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

/** A published extension of the seeded core rules, of a user's. */
async function createBook(userId: string, coreId: string) {
  return await createTestRuleset(userId, { rulesetId: coreId, kind: "extension", private: false, status: "Published" });
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
