/**
 * Two books' copies of one entity, as a ruleset subscribed to both shows it: Complete Adventurer holds its own copy of
 * every core Skill Focus feat, so a skill's rename (which renames its Skill Focus in place) made by another book, or by
 * the ruleset, leaves two copies of that feat.
 */

import { describe, expect, test } from "bun:test";

import { DND35_COMPLETE_ADVENTURER_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { findSeededRuleset, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A published book of a new author's, a fork of the seeded 3.5 core, and its author. */
async function createBook(edit: (author: Session, bookId: string) => Promise<unknown>) {
  const { session: author } = await createTestUser();
  const book = await forkCore(author);
  await edit(author, book.id);
  await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
  return { author, book };
}

/** The feat of a name, as a ruleset's view shows it. */
async function featOf(rulesetId: string, name: string) {
  const feat = Dnd35View.of(await readView(rulesetId)).feats.find((candidate) => candidate.name === name);
  if (!feat) throw new Error(`No feat ${name} in ${rulesetId}`);
  return feat;
}

/** A public fork of the seeded 3.5 core, as its owner forks it. */
async function forkCore(session: Session) {
  const { user } = await createTestUser();
  const seeded = await createSeededTestRuleset(user.id);
  return await RulesetsService.forkRuleset(session, seeded.rulesetId!, { name: `Fork ${uniqueId()}`, private: false });
}

/** The names of the Skill Focus feats with a rule on a skill of this name, in a ruleset's view. */
async function givingTo(rulesetId: string, skillName: string) {
  const view = await readView(rulesetId);
  const prefix = `skills.${stripSeparators(skillName)}.`;
  return view
    .rows("feats")
    .filter((feat) => (view.modifiersBySource.get(feat.id) ?? []).some((m) => m.target.startsWith(prefix)))
    .map((feat) => feat.name)
    .filter((name) => name.startsWith("Skill Focus: "))
    .toSorted();
}

/** The skill of a name, as a ruleset's view shows it. */
async function skillOf(rulesetId: string, name: string) {
  const skill = (await readView(rulesetId)).rows("skills").find((candidate) => candidate.name === name);
  if (!skill) throw new Error(`No skill ${name} in ${rulesetId}`);
  return skill;
}

/** A new user's fork of the seeded 3.5 core, subscribed to these books in their order, and its owner. */
async function subscriberOf(...bookIds: string[]) {
  const { session } = await createTestUser();
  const fork = await forkCore(session);
  for (const bookId of bookIds) await RulesetExtensionsService.subscribeExtension(session, fork.id, [bookId]);
  return { fork, session };
}

describe("two books' copies of a skill's Skill Focus", () => {
  test.each(["after", "before"] as const)(
    "agree on its name when a book subscribed %s Complete Adventurer renames its skill",
    async (order) => {
      const adventurer = await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME);
      const { author, book } = await createBook(async (author, bookId) => {
        const appraise = await skillOf(bookId, "Appraise");
        await EntitiesService.updateEntity(author, bookId, "skills", appraise.id, { name: "Bravo" });
      });
      const { fork } = await subscriberOf(...(order === "after" ? [adventurer.id, book.id] : [book.id, adventurer.id]));
      expect(await givingTo(fork.id, "Bravo")).toEqual(["Skill Focus: Bravo"]);

      const [ability] = (await readView(book.id)).rows("abilities");
      await EntitiesService.createEntity(author, book.id, "skills", {
        name: "Appraise",
        links: { keyAbility: ability.id },
      });

      expect(await givingTo(fork.id, "Bravo")).toEqual(["Skill Focus: Bravo"]);
      expect(await givingTo(fork.id, "Appraise")).toEqual(["Skill Focus: Appraise"]);
    },
  );

  test("keep a subscriber's edit of the book's copy once it unsubscribes from the book", async () => {
    const adventurer = await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME);
    const { fork, session } = await subscriberOf(adventurer.id);
    const climb = await skillOf(fork.id, "Climb");
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    const focus = await featOf(fork.id, "Skill Focus: Scale");
    await EntitiesService.updateEntity(session, fork.id, "feats", focus.id, {
      name: focus.name,
      description: "The fork's own words",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, adventurer.id);

    expect(await givingTo(fork.id, "Scale")).toEqual(["Skill Focus: Scale"]);
    expect((await featOf(fork.id, "Skill Focus: Scale")).description).toBe("The fork's own words");
  });

  test.each(["after", "before"] as const)(
    "leave no change once a subscriber of both, a book subscribed %s Complete Adventurer, renames the skill, then restores it",
    async (order) => {
      const adventurer = await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME);
      const { book } = await createBook(async (author, bookId) => {
        const focus = await featOf(bookId, "Skill Focus: Climb");
        await ModifiersService.createModifier(author, bookId, "feats", focus.id, {
          operator: "add",
          target: "skills.climb.misc",
          value: "1",
        });
      });
      const books = order === "after" ? [adventurer.id, book.id] : [book.id, adventurer.id];
      const { fork, session } = await subscriberOf(...books);
      const climb = await skillOf(fork.id, "Climb");
      await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });

      await RulesetChangesService.revertOverride(session, fork.id, "skills", climb.id);

      expect(await givingTo(fork.id, "Climb")).toEqual(["Skill Focus: Climb"]);
      expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
    },
  );
});
