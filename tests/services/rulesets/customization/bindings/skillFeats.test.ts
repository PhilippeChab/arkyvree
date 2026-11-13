/** A skill's own feats (its Skill Focus; 5e's Skill Proficiency and Expertise), told by what they give to. */

import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { invalidateSeededRuleset, readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** Whether a feat's name is the one a skill of this name brings ("Skill Focus: Climb"). */
function of(skillName: string) {
  return (featName: string) => featName.endsWith(`: ${skillName}`);
}

/**
 * Leaves a skill's own feats under another name (`name`'s) than their skill's, as a book's rename of a skill under the
 * ruleset's copy of it does: the skill renamed, its feats with it, then its row given its name back past the app.
 */
async function driftFeats(session: Session, rulesetId: string, skill: { id: string; name: string }, name: string) {
  await EntitiesService.updateEntity(session, rulesetId, "skills", skill.id, { name });
  const copy = (await readView(rulesetId)).rows("skills").find((row) => row.name === name)!;
  await db.execute(sql`update rules.entities set name = ${skill.name} where id = ${copy.id}`);
  invalidateSeededRuleset(rulesetId);
}

/** A fork of each seeded base rules, with its owner's session. */
async function forkEachBase() {
  const bases = (await Rulesets.findMany(db, { system: true })).filter((ruleset) => ruleset.rulesetId === null);
  expect(bases.length).toBeGreaterThanOrEqual(3);
  return await Promise.all(
    bases.map(async (base) => {
      const { session } = await createTestUser();
      const fork = await RulesetsService.forkRuleset(session, base.id, { name: `Fork ${uniqueId()}`, private: false });
      return { fork, rules: base.baseRules, session };
    }),
  );
}

/** The names of the feats with a rule on a skill of this name, in a ruleset's view. */
async function givingTo(rulesetId: string, skillName: string) {
  const view = await readView(rulesetId);
  const prefix = `skills.${stripSeparators(skillName)}.`;
  return view
    .rows("feats")
    .filter((feat) => (view.modifiersBySource.get(feat.id) ?? []).some((m) => m.target.startsWith(prefix)))
    .map((feat) => feat.name)
    .toSorted();
}

describe("a skill's own feats, in every base rules", () => {
  test("take their skill's name back when a renamed skill is restored", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const [skill] = (await readView(fork.id)).rows("skills");
      const before = await givingTo(fork.id, skill.name);
      expect({ rules, own: before.some(of(skill.name)) }).toEqual({ rules, own: true });

      await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name: `Renamed ${uniqueId()}` });
      await RulesetChangesService.revertOverride(session, fork.id, "skills", skill.id);

      expect({ rules, feats: await givingTo(fork.id, skill.name) }).toEqual({ rules, feats: before });
      expect({ rules, changes: await RulesetChangesService.getChanges(session, fork.id) }).toEqual({
        rules,
        changes: [],
      });
    }
  }, 60_000);

  test("stay each its own skill's when a second skill takes a name the first one left", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const [first, second] = (await readView(fork.id)).rows("skills");
      const own = (await givingTo(fork.id, second.name)).filter(of(second.name)).length;
      const firstBefore = await givingTo(fork.id, first.name);
      const name = `Athletics ${uniqueId()}`;

      await EntitiesService.updateEntity(session, fork.id, "skills", first.id, { name });
      await RulesetChangesService.revertOverride(session, fork.id, "skills", first.id);
      await EntitiesService.updateEntity(session, fork.id, "skills", second.id, { name });

      expect({ rules, feats: (await givingTo(fork.id, name)).filter(of(name)).length }).toEqual({ rules, feats: own });
      expect({ rules, feats: await givingTo(fork.id, first.name) }).toEqual({ rules, feats: firstBefore });

      const renamed = (await readView(fork.id)).rows("skills").find((skill) => skill.name === name)!;
      await EntitiesService.deleteEntity(session, fork.id, "skills", renamed.id);

      expect({ rules, feats: await givingTo(fork.id, first.name) }).toEqual({ rules, feats: firstBefore });
      expect({ rules, left: await givingTo(fork.id, name) }).toEqual({ rules, left: [] });
    }
  }, 60_000);

  test("give up a name they hold for another skill's own, taking their skill's back", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const [first, second] = (await readView(fork.id)).rows("skills");
      const own = (await givingTo(fork.id, second.name)).filter(of(second.name)).length;
      const firstBefore = await givingTo(fork.id, first.name);
      const name = `Athletics ${uniqueId()}`;
      await driftFeats(session, fork.id, first, name);
      expect({ rules, drifted: (await givingTo(fork.id, first.name)).filter(of(name)).length > 0 }).toEqual({
        rules,
        drifted: true,
      });

      await EntitiesService.updateEntity(session, fork.id, "skills", second.id, { name });

      expect({ rules, feats: (await givingTo(fork.id, name)).filter(of(name)).length }).toEqual({ rules, feats: own });
      expect({ rules, feats: await givingTo(fork.id, first.name) }).toEqual({ rules, feats: firstBefore });
    }
  }, 60_000);

  test("are made for a new skill whose name another skill's feats hold", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const [first] = (await readView(fork.id)).rows("skills");
      const firstBefore = await givingTo(fork.id, first.name);
      const own = firstBefore.filter(of(first.name)).length;
      const name = `Athletics ${uniqueId()}`;
      await driftFeats(session, fork.id, first, name);

      const [ability] = (await readView(fork.id)).rows("abilities");

      await EntitiesService.createEntity(session, fork.id, "skills", { name, links: { keyAbility: ability.id } });

      expect({ rules, feats: (await givingTo(fork.id, name)).filter(of(name)).length }).toEqual({ rules, feats: own });
      expect({ rules, feats: await givingTo(fork.id, first.name) }).toEqual({ rules, feats: firstBefore });
    }
  }, 60_000);

  test("come back with their skill when a deleted skill is restored", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const [skill] = (await readView(fork.id)).rows("skills");
      const before = await givingTo(fork.id, skill.name);
      await EntitiesService.deleteEntity(session, fork.id, "skills", skill.id);
      expect({
        rules,
        shown: (await readView(fork.id)).rows("feats").some((feat) => of(skill.name)(feat.name)),
      }).toEqual({ rules, shown: false });

      await RulesetChangesService.revertOverride(session, fork.id, "skills", skill.id);

      expect({ rules, feats: await givingTo(fork.id, skill.name) }).toEqual({ rules, feats: before });
      expect({ rules, changes: await RulesetChangesService.getChanges(session, fork.id) }).toEqual({
        rules,
        changes: [],
      });
    }
  }, 60_000);

  test("keep their skill's name when one is restored by itself", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const view = await readView(fork.id);
      const [skill] = view.rows("skills");
      const own = view.rows("feats").filter((feat) => of(skill.name)(feat.name));
      const name = `Renamed ${uniqueId()}`;
      await EntitiesService.updateEntity(session, fork.id, "skills", skill.id, { name });
      const renamed = (await givingTo(fork.id, name)).filter(of(name));
      expect({ rules, renamed: renamed.length }).toEqual({ rules, renamed: own.length });

      for (const feat of own) await RulesetChangesService.revertOverride(session, fork.id, "feats", feat.id);

      expect({ rules, feats: (await givingTo(fork.id, name)).filter(of(name)) }).toEqual({ rules, feats: renamed });
    }
  }, 60_000);

  test("of a deleted skill, restored without it, give their names up to a new skill of that name", async () => {
    for (const { fork, rules, session } of await forkEachBase()) {
      const view = await readView(fork.id);
      const [skill] = view.rows("skills");
      const [ability] = view.rows("abilities");
      const own = view.rows("feats").filter((feat) => of(skill.name)(feat.name));
      await EntitiesService.deleteEntity(session, fork.id, "skills", skill.id);
      for (const feat of own) await RulesetChangesService.revertOverride(session, fork.id, "feats", feat.id);
      expect({ rules, giving: await givingTo(fork.id, skill.name) }).toEqual({ rules, giving: [] });

      await EntitiesService.createEntity(session, fork.id, "skills", {
        name: skill.name,
        links: { keyAbility: ability.id },
      });

      expect({ rules, feats: (await givingTo(fork.id, skill.name)).filter(of(skill.name)).length }).toEqual({
        rules,
        feats: own.length,
      });
    }
  }, 60_000);
});
