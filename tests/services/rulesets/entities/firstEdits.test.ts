/**
 * An inherited entity's first save, which copies it: checked against the page that sent it (its `updatedAt`, the
 * inherited row's as the page read it), as a save of the ruleset's own entity is, in every base rules.
 */

import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const RULES = { dnd35: "Dungeons & Dragons: 3.5", dnd5: "Dungeons & Dragons: 5", pf1: "Pathfinder: 1" } as const;

const ALL = Object.values(RULES);

const STALE = new ConflictError(STALE_ENTITY_MESSAGE);

/** A fork of a seeded base rules, with its owner's session. */
async function forkOf(rules: string) {
  const bases = await Rulesets.findMany(db, { system: true });
  const base = bases.find((ruleset) => ruleset.rulesetId === null && ruleset.baseRules === rules)!;
  const { session } = await createTestUser();
  const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
  return { fork, session };
}

/** The first skill and the first class a ruleset's view shows. */
async function inheritedOf(rulesetId: string) {
  const view = await readView(rulesetId);
  const [skill] = view.rows("skills");
  const [klass] = view.rows("classes");
  return { klass, skill };
}

describe("an inherited entity's first save", () => {
  test.each(ALL)("goes through from a page read fresh: an entity's, and an owned entity's (%s)", async (rules) => {
    const { fork, session } = await forkOf(rules);
    const { klass, skill } = await inheritedOf(fork.id);

    const read = await EntitiesService.getEntity(session, fork.id, "skills", skill.id);
    const saved = await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, {
      name: read.name,
      description: "Mine",
      updatedAt: read.updatedAt,
    });
    const [level] = await EntitiesService.getOwnedEntities(session, fork.id, "classes", klass.id);
    const edited = await EntitiesService.updateOwnedEntity(session, fork.id, "classes", klass.id, level.id, {
      updatedAt: level.updatedAt,
    });

    expect({ rules, copied: saved.id !== skill.id, description: saved.description }).toEqual({
      rules,
      copied: true,
      description: "Mine",
    });
    expect({ rules, copied: edited.id !== level.id }).toEqual({ rules, copied: true });
  });

  test.each(ALL)("is stale from a page read before the book's author changed it (%s)", async (rules) => {
    const { fork: book, session: author } = await forkOf(rules);
    const { klass, skill } = await inheritedOf(book.id);
    const tome = await EntitiesService.updateEntity(author, book.id, "skills", skill.id, {
      name: `Tome ${uniqueId()}`,
      description: "The book's",
    });
    await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
    const { fork: host, session } = await forkOf(rules);
    await RulesetExtensionsService.subscribeExtension(session, host.id, [book.id]);
    const read = await EntitiesService.getEntity(session, host.id, "skills", tome.id);
    const [level] = await EntitiesService.getOwnedEntities(session, host.id, "classes", klass.id);

    // The author renames the skill, with new words, and edits the class's level
    await EntitiesService.updateEntity(author, book.id, "skills", tome.id, {
      name: `Renamed ${uniqueId()}`,
      description: "The book's, rewritten",
    });
    const [bookLevel] = await EntitiesService.getOwnedEntities(author, book.id, "classes", klass.id);
    await EntitiesService.updateOwnedEntity(author, book.id, "classes", klass.id, bookLevel.id, {
      updatedAt: bookLevel.updatedAt,
    });

    expect(
      EntitiesService.updateEntity(session, host.id, "skills", tome.id, {
        name: read.name,
        description: "Mine",
        updatedAt: read.updatedAt,
      }),
    ).rejects.toEqual(STALE);
    expect(
      EntitiesService.updateOwnedEntity(session, host.id, "classes", klass.id, level.id, {
        updatedAt: level.updatedAt,
      }),
    ).rejects.toEqual(STALE);
    expect({ rules, changes: await RulesetChangesService.getChanges(session, host.id) }).toEqual({
      rules,
      changes: [],
    });
  });

  test.each(ALL)("is stale from a page that showed the fork's change a restore undid since (%s)", async (rules) => {
    const { fork, session } = await forkOf(rules);
    const { skill } = await inheritedOf(fork.id);
    await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name: skill.name, description: "Ours" });
    // One user's page shows the fork's change, by the skill's address; another restores the skill
    const read = await EntitiesService.getEntity(session, fork.id, "skills", skill.id);
    await RulesetChangesService.revertOverride(session, fork.id, "skills", skill.id);

    expect(
      EntitiesService.updateEntity(session, fork.id, "skills", skill.id, {
        name: read.name,
        description: "Ours, again",
        updatedAt: read.updatedAt,
      }),
    ).rejects.toEqual(STALE);
    expect({ rules, changes: await RulesetChangesService.getChanges(session, fork.id) }).toEqual({
      rules,
      changes: [],
    });
  });
});

describe("an inherited modifier's first change", () => {
  test("3.5: goes through from a page read fresh, and is stale from one read before its book changed it", async () => {
    const { fork: book, session: author } = await forkOf(RULES.dnd35);
    const view = await readView(book.id);
    // A feat's modifier that adds a number, which the book makes its own
    const feats = new Set(view.rows("feats").map((feat) => feat.id));
    const [inherited] = [...view.modifiersBySource]
      .filter(([id]) => feats.has(id))
      .flatMap(([, modifiers]) => modifiers)
      .filter((each) => each.operator === "add" && /^\d+$/.test(each.value));
    const { operator, target } = inherited;
    const modifier = await ModifiersService.updateModifier(author, book.id, "feats", inherited.sourceId, inherited.id, {
      operator,
      target,
      value: "5",
    });
    const featId = modifier.resolvedEntityId;
    await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
    const { fork: host, session } = await forkOf(RULES.dnd35);
    await RulesetExtensionsService.subscribeExtension(session, host.id, [book.id]);
    const read = { operator, target, value: "6", updatedAt: modifier.updatedAt };

    // The author changes the modifier again: the subscriber's page read before it is stale
    const changed = await ModifiersService.updateModifier(author, book.id, "feats", featId, modifier.id, {
      ...read,
      value: "7",
    });
    expect(ModifiersService.updateModifier(session, host.id, "feats", featId, modifier.id, read)).rejects.toEqual(
      STALE,
    );

    const saved = await ModifiersService.updateModifier(session, host.id, "feats", featId, modifier.id, {
      ...read,
      value: "9",
      updatedAt: changed.updatedAt,
    });
    expect(saved).toMatchObject({ value: "9" });
  });
});
