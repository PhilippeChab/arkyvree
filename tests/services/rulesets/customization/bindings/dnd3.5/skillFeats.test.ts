/** A skill's Skill Focus through renames, restores, a book's renames and an author's edits of it. */

import { describe, expect, test } from "bun:test";

import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { pickFeat } from "@/tests/support/dnd3.5/levels.ts";
import { createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The feat of a name, as a ruleset's view shows it. */
async function featOf(rulesetId: string, name: string) {
  const feat = Dnd35View.of(await readView(rulesetId)).feats.find((candidate) => candidate.name === name);
  if (!feat) throw new Error(`No feat ${name} in ${rulesetId}`);
  return feat;
}

/** A public fork of the seeded 3.5 core, as its owner forks it. */
async function forkCore(session: Session) {
  const { fork } = await setUp();
  return await RulesetsService.forkRuleset(session, fork.rulesetId!, { name: `Fork ${uniqueId()}`, private: false });
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

/** A fork of the seeded 3.5 core, and its owner. */
async function setUp() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  return { fork, session, user };
}

/** The skill of a name, as a ruleset's view shows it. */
async function skillOf(rulesetId: string, name: string) {
  return (await readView(rulesetId)).rows("skills").find((skill) => skill.name === name)!;
}

/**
 * A book with its own skill "Parkour", and a subscriber who edited that skill before the book's author renamed it
 * "Freerunning": the subscriber keeps "Parkour", and sees the book's "Skill Focus: Freerunning" give to it.
 */
async function subscribeToRenamedSkill() {
  const { session: author } = await createTestUser();
  const book = await forkCore(author);
  const [ability] = (await readView(book.id)).rows("abilities");
  const parkour = await EntitiesService.createEntity(author, book.id, "skills", {
    name: "Parkour",
    links: { keyAbility: ability.id },
  });
  await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
  const { session } = await createTestUser();
  const fork = await forkCore(session);
  await RulesetExtensionsService.subscribeExtension(session, fork.id, [book.id]);
  await EntitiesService.updateEntity(session, fork.id, "skills", parkour.id, {
    name: "Parkour",
    description: "The subscriber's own words",
  });
  await EntitiesService.updateEntity(author, book.id, "skills", parkour.id, { name: "Freerunning" });
  return { author, book, fork, parkour, session };
}

describe("a skill's Skill Focus", () => {
  test("of a book's skill renamed under a subscriber's copy gives up its name to the subscriber's skill of that name", async () => {
    const { fork, session } = await subscribeToRenamedSkill();
    expect(await givingTo(fork.id, "Parkour")).toEqual(["Skill Focus: Freerunning"]);
    const jump = await skillOf(fork.id, "Jump");

    await EntitiesService.updateEntity(session, fork.id, "skills", jump.id, { name: "Freerunning" });

    expect(await givingTo(fork.id, "Freerunning")).toEqual(["Skill Focus: Freerunning"]);
    expect(await givingTo(fork.id, "Parkour")).toEqual(["Skill Focus: Parkour"]);
  });

  test("restored by itself keeps its renamed skill's name, and another skill that takes the old name gets its own", async () => {
    const { fork, session } = await setUp();
    const climb = await skillOf(fork.id, "Climb");
    const jump = await skillOf(fork.id, "Jump");
    const focus = await featOf(fork.id, "Skill Focus: Climb");
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    await RulesetChangesService.revertOverride(session, fork.id, "feats", focus.id);
    expect(await givingTo(fork.id, "Scale")).toEqual(["Skill Focus: Scale"]);

    await EntitiesService.updateEntity(session, fork.id, "skills", jump.id, { name: "Climb" });

    expect(await givingTo(fork.id, "Climb")).toEqual(["Skill Focus: Climb"]);
    expect(await givingTo(fork.id, "Scale")).toEqual(["Skill Focus: Scale"]);
  });

  test("is left untouched by a restore of its skill that changes nothing of it, and keeps following its book", async () => {
    const { author, book, fork, parkour, session } = await subscribeToRenamedSkill();

    await RulesetChangesService.revertOverride(session, fork.id, "skills", parkour.id);

    expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
    await EntitiesService.updateEntity(author, book.id, "skills", parkour.id, { name: "Tracing" });
    expect(await givingTo(fork.id, "Tracing")).toEqual(["Skill Focus: Tracing"]);
  });

  test("restored, then its skill restored, leaves the ruleset with no change", async () => {
    const { fork, session } = await setUp();
    const climb = await skillOf(fork.id, "Climb");
    const focus = await featOf(fork.id, "Skill Focus: Climb");
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    await RulesetChangesService.revertOverride(session, fork.id, "feats", focus.id);

    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb.id);

    expect(await RulesetChangesService.getChanges(session, fork.id)).toEqual([]);
  });

  test.each(["rename", "delete"] as const)(
    "of another skill, which its author had give to this one too, stays as it is on this one's %s",
    async (action) => {
      const { fork, session } = await setUp();
      const climb = await skillOf(fork.id, "Climb");
      const jumpFocus = await featOf(fork.id, "Skill Focus: Jump");
      const climbFocus = await featOf(fork.id, "Skill Focus: Climb");
      await ModifiersService.createModifier(session, fork.id, "feats", jumpFocus.id, {
        operator: "add",
        target: "skills.climb.misc",
        value: "1",
      });
      await EntitiesService.deleteEntity(session, fork.id, "feats", climbFocus.id);

      if (action === "rename")
        await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
      else await EntitiesService.deleteEntity(session, fork.id, "skills", climb.id);

      expect(await givingTo(fork.id, "Jump")).toEqual(["Skill Focus: Jump"]);
    },
  );

  test("keeps the name it has, and who picked it, when its skill is restored to a name a hand-made feat holds", async () => {
    const { fork, session, user } = await setUp();
    const climb = await skillOf(fork.id, "Climb");
    await EntitiesService.updateEntity(session, fork.id, "skills", climb.id, { name: "Scale" });
    const focus = await featOf(fork.id, "Skill Focus: Scale");
    const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
    await pickFeat(user.id, fork.id, focus.id, general.id);
    await EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Skill Focus: Climb",
      links: { listedIn: [{ toId: general.id }] },
    });

    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb.id);

    expect(await givingTo(fork.id, "Climb")).toEqual(["Skill Focus: Scale"]);
  });
});
