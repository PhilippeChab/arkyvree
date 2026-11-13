/**
 * A randomized check of what rules mean. Two forks of the seeded 3.5 core take random renames, name reuses, deletes,
 * restores, first edits and new rules, through the services. After every step, a small model of its own (which feat
 * each rule was written against, and what stands for that feat in each fork) is compared with what each fork's view
 * reads: every rule must mean the feat its author picked, or be switched off because that feat is gone there.
 */

import { describe, expect, test } from "bun:test";

import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A fork as the model follows it. */
interface Fork {
  id: string;
  rules: Rule[];
  slots: Slot[];
}

/** A rule the model follows: on a feat (`holder`), requiring another (`target`), written in a fork or the base's own. */
interface Rule {
  fromBase: boolean;
  holder: string;
  target: string;
}

/** A feat as the model follows it in one fork: what the base called it, what the fork shows for it, and under what name. */
interface Slot {
  /** The base's feat it stands for: none for a feat of the fork's own */
  baseId?: string;
  baseName?: string;
  /** Whether what the fork shows for it still carries the base's own rules: a copy does, a replacement doesn't */
  carriesBaseRules: boolean;
  key: string;
  name: string;
  shownId: string;
  status: "deleted" | "shown" | "tombstoned";
}

const BASE_FEATS = ["Dodge", "Mobility", "Power Attack", "Cleave", "Alertness"] as const;

/** The base's rules the model follows: each feat, and the feat it requires. */
const BASE_RULES = [
  ["Mobility", "Dodge"],
  ["Cleave", "Power Attack"],
] as const;

const SEEDS = [1, 2, 3, 4, 5, 6];

const STEPS = 45;

/** Two forks of the seeded core, each following the base's feats and rules the model reads. */
async function setUp(seed: number) {
  const { session, user } = await createTestUser();
  const forks: Fork[] = [];
  for (let index = 0; index < 2; index++) {
    const fork = await createSeededTestRuleset(user.id);
    const feats = Dnd35View.of(await readView(fork.id)).feats;
    const slots = BASE_FEATS.map((name): Slot => {
      const { id } = feats.find((feat) => feat.name === name)!;
      return { baseId: id, baseName: name, carriesBaseRules: true, key: name, name, shownId: id, status: "shown" };
    });
    forks.push({
      id: fork.id,
      rules: BASE_RULES.map(([holder, target]) => ({ fromBase: true, holder, target })),
      slots,
    });
  }
  return new World(session, forks, new Random(seed));
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

/** The world a run plays in: its forks, the session that writes them, its generator, and what it did. */
class World {
  constructor(
    private readonly session: Session,
    private readonly forks: Fork[],
    private readonly random: Random,
  ) {}

  /** The names feats were given and lost (a rename's old name, a deleted feat's), which a new feat may take again. */
  private readonly freed: string[] = [];

  readonly log: string[] = [];

  private counter = 0;

  /** What the model expects of a feat's rules in a fork: the feats they mean there, and how many are off. */
  private expect(fork: Fork, holder: Slot) {
    const rules = fork.rules.filter(
      (rule) => rule.holder === holder.key && (!rule.fromBase || holder.carriesBaseRules),
    );
    const targets = rules.map((rule) => fork.slots.find((slot) => slot.key === rule.target)!);
    return {
      means: targets.flatMap((slot) => (slot.status === "shown" ? slot.shownId : [])).toSorted(),
      off: targets.filter((slot) => slot.status !== "shown").length,
    };
  }

  private isNameShown(fork: Fork, name: string): boolean {
    return fork.slots.some((slot) => slot.status === "shown" && stripSeparators(slot.name) === stripSeparators(name));
  }

  private nextName(fork: Fork): string {
    const reused =
      this.random.below(3) === 0
        ? this.random.pick(this.freed.filter((name) => !this.isNameShown(fork, name)))
        : undefined;
    return (
      reused ??
      `Feat ${String.fromCharCode(65 + (this.counter % 26))}${Math.floor(this.counter++ / 26) || ""} ${this.random.below(1000)}`
    );
  }

  private shownSlots(fork: Fork): Slot[] {
    return fork.slots.filter((slot) => slot.status === "shown");
  }

  /** A new rule on a feat, requiring another: a first edit of an inherited feat copies it, its rules with it. */
  private async addRule(fork: Fork) {
    const holder = this.random.pick(this.shownSlots(fork));
    const target = this.random.pick(this.shownSlots(fork).filter((slot) => slot !== holder));
    if (!holder || !target) return;
    this.log.push(`rule on ${holder.name} requiring ${target.name}`);
    await RequirementsService.createRequirement(this.session, fork.id, "feats", holder.shownId, {
      level: String(50 + this.counter++),
      operator: "equal",
      target: `feats.${stripSeparators(target.name)}.possessed`,
      value: "true",
    });
    holder.shownId = await this.shownIdOf(fork, holder.name);
    fork.rules.push({ fromBase: false, holder: holder.key, target: target.key });
  }

  /** A new feat of the fork's own: one made under a deleted inherited feat's name stands for it from then on. */
  private async create(fork: Fork) {
    const name = this.nextName(fork);
    if (this.isNameShown(fork, name)) return;
    this.log.push(`create ${name}`);
    const made = await EntitiesService.createEntity(this.session, fork.id, "feats", {
      name,
      links: { listedIn: [{ toId: await this.generalPoolOf(fork) }] },
    });
    const replaced = fork.slots.find((slot) => slot.status === "tombstoned" && slot.baseName === name);
    if (replaced) Object.assign(replaced, { carriesBaseRules: false, name, shownId: made.id, status: "shown" });
    else fork.slots.push({ carriesBaseRules: false, key: `own-${made.id}`, name, shownId: made.id, status: "shown" });
  }

  /** A feat deleted: its own rules go with it; an inherited one stays hidden in the fork. */
  private async delete(fork: Fork) {
    const slot = this.random.pick(this.shownSlots(fork));
    if (!slot) return;
    this.log.push(`delete ${slot.name}`);
    await EntitiesService.deleteEntity(this.session, fork.id, "feats", slot.shownId);
    slot.status = slot.baseId === undefined ? "deleted" : "tombstoned";
    this.freed.push(slot.name);
    fork.rules = fork.rules.filter((rule) => rule.fromBase || rule.holder !== slot.key);
  }

  /** The pool every new feat is listed in, as the fork's view shows it. */
  private async generalPoolOf(fork: Fork) {
    return Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!.id;
  }

  private async rename(fork: Fork) {
    const slot = this.random.pick(this.shownSlots(fork));
    const name = this.nextName(fork);
    if (!slot || this.isNameShown(fork, name)) return;
    this.log.push(`rename ${slot.name} to ${name}`);
    await EntitiesService.updateEntity(this.session, fork.id, "feats", slot.shownId, { name });
    this.freed.push(slot.name);
    slot.name = name;
    slot.shownId = await this.shownIdOf(fork, name);
  }

  /** The parent's version restored: the fork's copy goes, the rules written on it with it, and the base's feat shows. */
  private async restore(fork: Fork) {
    const restorable = fork.slots.filter(
      (slot) =>
        slot.baseId !== undefined &&
        (slot.status === "tombstoned" ||
          (slot.status === "shown" && slot.shownId !== slot.baseId && slot.carriesBaseRules)) &&
        !fork.slots.some(
          (other) =>
            other !== slot &&
            other.status === "shown" &&
            stripSeparators(other.name) === stripSeparators(slot.baseName!),
        ),
    );
    const slot = this.random.pick(restorable);
    if (!slot) return;
    this.log.push(`restore ${slot.baseName} (shown as ${slot.name}, ${slot.status})`);
    await RulesetChangesService.revertOverride(this.session, fork.id, "feats", slot.baseId!);
    if (slot.status === "shown") this.freed.push(slot.name);
    Object.assign(slot, { carriesBaseRules: true, name: slot.baseName, shownId: slot.baseId, status: "shown" });
    fork.rules = fork.rules.filter((rule) => rule.fromBase || rule.holder !== slot.key);
  }

  /** The id the fork's view shows a feat of that name under. */
  private async shownIdOf(fork: Fork, name: string): Promise<string> {
    const feat = Dnd35View.of(await readView(fork.id)).feats.find((candidate) => candidate.name === name);
    if (!feat) throw new Error(`The fork shows no feat ${name}`);
    return feat.id;
  }

  /** Compares, for every feat a fork shows, what its rules mean in the fork's view with what the model expects. */
  async check() {
    for (const fork of this.forks) {
      const view = await readView(fork.id);
      const idBySlug = new Map(Dnd35View.of(view).feats.map((feat) => [stripSeparators(feat.name), feat.id]));
      for (const holder of this.shownSlots(fork)) {
        const paths = (view.requirementsByEntity.get(holder.shownId) ?? []).flatMap((r) => r.target ?? []);
        const named = paths.filter((path) => /^feats\.[^.*]+\.possessed$/.test(path)).map((path) => path.split(".")[1]);
        const actual = {
          means: named.map((slug) => idBySlug.get(slug) ?? `nothing shown as ${slug}`).toSorted(),
          off: view.switchedOff.filter((row) => row.ownerId === holder.shownId).length,
        };
        expect({ feat: holder.name, ...actual }).toEqual({ feat: holder.name, ...this.expect(fork, holder) });
      }
    }
  }

  async step() {
    const fork = this.random.pick(this.forks)!;
    const steps = [
      () => this.addRule(fork),
      () => this.addRule(fork),
      () => this.rename(fork),
      () => this.rename(fork),
      () => this.create(fork),
      () => this.delete(fork),
      () => this.restore(fork),
    ];
    await this.random.pick(steps)!();
  }
}

describe("random renames, reuses, deletes, restores and edits", () => {
  test.each(SEEDS)(
    "leave every rule meaning the feat it was written against (seed %i)",
    async (seed) => {
      const world = await setUp(seed);
      await world.check();
      for (let step = 0; step < STEPS; step++) {
        await world.step();
        try {
          await world.check();
        } catch (error) {
          console.log(`seed ${seed}, after step ${step + 1}:\n  ${world.log.join("\n  ")}`);
          throw error;
        }
      }
      expect(world.log.length).toBeGreaterThan(STEPS / 2);
    },
    120_000,
  );
});
