/**
 * A randomized check of the feats the app makes for a skill (its Skill Focus; 5e's Skill Proficiency and Expertise).
 * A fork of each seeded base rules takes random skill renames, name reuses, creates, deletes and restores, and
 * restores of those feats, through the services. After every step: each skill has one feat of each kind, a feat named
 * after a skill gives to that skill, and none gives to a skill that isn't there.
 */

import { describe, expect, test } from "bun:test";

import RulesError from "@/engine/core/RulesError.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The names a run gives skills, beside those its skills had and lost. */
const NAMES = ["Alpha", "Bravo", "Charlie", "Delta"];

const SEEDS = [1, 2, 3];

const STEPS = 30;

/** A fork of a base rules, the kinds of feats its skills bring (by their names' prefix), and its generator. */
async function setUp(baseId: string, seed: number) {
  const { session } = await createTestUser();
  const fork = await RulesetsService.forkRuleset(session, baseId, { name: `Fork ${uniqueId()}`, private: false });
  const view = await readView(fork.id);
  const [skill] = view.rows("skills");
  const suffix = `: ${skill.name}`;
  const kinds = view
    .rows("feats")
    .filter((feat) => feat.name.endsWith(suffix))
    .map((feat) => feat.name.slice(0, -suffix.length));
  expect(kinds.length).toBeGreaterThan(0);
  // The skills the base rules give no such feat (3.5's Speak Language): the run leaves them as they are
  const prefix = (name: string) => `skills.${stripSeparators(name)}.`;
  const given = new Set(
    view
      .rows("feats")
      .filter((feat) => kinds.some((kind) => feat.name.startsWith(`${kind}: `)))
      .flatMap((feat) => (view.modifiersBySource.get(feat.id) ?? []).map((modifier) => modifier.target)),
  );
  const bare = view
    .rows("skills")
    .flatMap(({ name }) => ([...given].some((t) => t.startsWith(prefix(name))) ? [] : name));
  return new World(session, fork.id, kinds, new Set(bare), new Random(seed), seed % 2 === 0);
}

/** A small seeded generator, so a failing run can be run again. */
class Random {
  constructor(private state: number) {}

  /** An integer from 0 up to `bound`, not included. */
  below(bound: number): number {
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return Math.floor((this.state / 4294967296) * bound);
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[this.below(items.length)];
  }
}

/** The world a run plays in: its fork, the session that writes it, its generator, and what it did. */
class World {
  constructor(
    private readonly session: Session,
    private readonly rulesetId: string,
    private readonly kinds: string[],
    private readonly bare: ReadonlySet<string>,
    private readonly random: Random,
    private readonly deletesFeats: boolean,
  ) {}

  /** The names skills had and lost (a rename's old name, a deleted skill's), which another may take. */
  private readonly freed: string[] = [];

  readonly log: string[] = [];

  /** Whether the run's author deleted a skill's feat by hand. */
  private deleted = false;

  /** Runs a write a name held by another entity may refuse (a restore's): refused so, it changes nothing. */
  private async allowRefusal(what: string, write: () => Promise<unknown>) {
    try {
      await write();
      this.log.push(what);
    } catch (error) {
      const refused = error instanceof ConflictError || (error instanceof RulesError && error.refusal === "conflict");
      if (!refused) throw error;
      this.log.push(`${what} (refused: ${error.message})`);
    }
  }

  /** The fork's changes of a kind a restore brings back. */
  private async changesOf(entityType: string) {
    const changes = await RulesetChangesService.getChanges(this.session, this.rulesetId);
    return changes.flatMap((change) =>
      change.entityType === entityType && change.status !== "added" ? [{ ...change, id: change.sourceEntityId }] : [],
    );
  }

  /** A name no skill of the view has: one a skill lost, or one of the run's own. */
  private async freeName() {
    const taken = new Set((await this.skills()).map((skill) => skill.name));
    return this.random.pick([...NAMES, ...this.freed].filter((name) => !taken.has(name)));
  }

  /** The skills the run plays with: those that bring feats. */
  private async skills() {
    return (await readView(this.rulesetId)).rows("skills").filter((skill) => !this.bare.has(skill.name));
  }

  /** What every step must leave true of the skills' feats. */
  async check() {
    const view = await readView(this.rulesetId);
    const skills = view.rows("skills");
    const slugs = new Map(skills.map((skill) => [stripSeparators(skill.name), skill.name]));
    for (const kind of this.kinds) {
      const feats = view.rows("feats").filter((feat) => feat.name.startsWith(`${kind}: `));
      const byskill = new Map<string, string[]>();
      for (const feat of feats) {
        const targets = (view.modifiersBySource.get(feat.id) ?? []).map((modifier) => modifier.target);
        const given = [
          ...new Set(targets.flatMap((target) => (target.startsWith("skills.") ? target.split(".")[1] : []))),
        ];
        const after = feat.name.slice(kind.length + 2);
        const named = skills.some((other) => other.name === after);
        // It gives to nothing only once its skill is gone (a deleted skill's, restored without it), under no skill's name
        if (given.length === 0 && !named) continue;
        // It gives to one skill, which is there
        expect({ feat: feat.name, gives: given.map((slug) => slugs.has(slug)) }).toEqual({
          feat: feat.name,
          gives: [true],
        });
        const skill = slugs.get(given[0])!;
        byskill.set(skill, [...(byskill.get(skill) ?? []), feat.name]);
        // Named after a skill that's there, it gives to that skill
        if (named) expect({ feat: feat.name, gives: skill }).toEqual({ feat: feat.name, gives: after });
      }
      // Each skill has its one feat of the kind
      const counts = skills.flatMap(({ name }) =>
        this.bare.has(name) ? [] : { feats: (byskill.get(name) ?? []).length, name },
      );
      // (or none, once its author deleted one by hand: the app makes a skill's feat again when it next renames it)
      const most = counts.filter(({ feats }) => feats > 1 || (feats !== 1 && !this.deleted));
      expect({ kind, without: most }).toEqual({ kind, without: [] });
    }
  }

  /** One random step. */
  async step() {
    const skills = await this.skills();
    const skill = this.random.pick(skills)!;
    // An even seed's author also deletes a skill's feat by hand, now and then
    const action = this.random.below(this.deletesFeats ? 11 : 10);
    if (action < 4) {
      const name = await this.freeName();
      if (!name) return;
      this.log.push(`rename ${skill.name} to ${name}`);
      await EntitiesService.updateEntity(this.session, this.rulesetId, "skills", skill.id, { name });
      this.freed.push(skill.name);
    } else if (action < 5) {
      const name = await this.freeName();
      const [ability] = (await readView(this.rulesetId)).rows("abilities");
      if (!name) return;
      await EntitiesService.createEntity(this.session, this.rulesetId, "skills", {
        name,
        links: { keyAbility: ability.id },
      });
      this.log.push(`create ${name}`);
    } else if (action < 6) {
      if (skills.length < 6) return;
      await this.allowRefusal(`delete ${skill.name}`, async () => {
        await EntitiesService.deleteEntity(this.session, this.rulesetId, "skills", skill.id);
        this.freed.push(skill.name);
      });
    } else if (action < 8) {
      const change = this.random.pick(await this.changesOf("skills"));
      if (!change) return;
      await this.allowRefusal(`restore skill ${change.name} (${change.status})`, () =>
        RulesetChangesService.revertOverride(this.session, this.rulesetId, "skills", change.id),
      );
    } else if (action === 10) {
      const view = await readView(this.rulesetId);
      const own = view.rows("feats").filter((feat) => this.kinds.some((kind) => feat.name.startsWith(`${kind}: `)));
      const feat = this.random.pick(own);
      if (!feat) return;
      await this.allowRefusal(`delete feat ${feat.name}`, async () => {
        await EntitiesService.deleteEntity(this.session, this.rulesetId, "feats", feat.id);
        this.deleted = true;
      });
    } else {
      const changes = await this.changesOf("feats");
      const change = this.random.pick(
        changes.filter(({ name }) => this.kinds.some((kind) => name.startsWith(`${kind}: `))),
      );
      if (!change) return;
      await this.allowRefusal(`restore feat ${change.name} (${change.status})`, () =>
        RulesetChangesService.revertOverride(this.session, this.rulesetId, "feats", change.id),
      );
    }
  }
}

describe("random skill renames, reuses, creates, deletes and restores, in every base rules", () => {
  test.each(SEEDS)(
    "leave each skill its own feats (seed %i)",
    async (seed) => {
      const bases = (await Rulesets.findMany(db, { system: true })).filter((ruleset) => ruleset.rulesetId === null);
      expect(bases.length).toBeGreaterThanOrEqual(3);
      for (const base of bases) {
        const world = await setUp(base.id, seed);
        await world.check();
        for (let step = 0; step < STEPS; step++) {
          try {
            await world.step();
            await world.check();
          } catch (error) {
            console.log(`${base.baseRules}, seed ${seed}, after step ${step + 1}:\n  ${world.log.join("\n  ")}`);
            throw error;
          }
        }
        expect(world.log.length).toBeGreaterThan(STEPS / 2);
      }
    },
    180_000,
  );
});
