/**
 * Pathfinder levels as the tests name them, saved as Add Level saves them: a level's class, hit points, ability
 * increases and picks by name, read into ids of the seeded core rules, and the levels and picks a save wrote, read back.
 */

import type { KlassLevel } from "@/engine/rulesets/pf1/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Picks } from "@/server/repositories/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import type { Session } from "@/shared/relations.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

import { levelUpPlan, type PlanPicks } from "./levelPlans.ts";
import { getPf1SeedCtx, type Pf1SeedCtx } from "./seed.ts";

/**
 * A level's plan by name: its hit points, the abilities its increases raise by 1 (`abilities`), the ranks it puts in
 * each skill, and the feats and spells it picks in each pool.
 */
export interface LevelPlan {
  abilities?: string[];
  feats?: Record<string, string[]>;
  hp: number;
  skills?: Record<string, number>;
  spells?: Record<string, string[]>;
}

/** A plan's picks by name read into the seeded core rules' ids: each skill's, each pool's and each pick's. */
export function picksOf(ctx: Pf1SeedCtx, { skills = {}, feats = {}, spells = {} }: Omit<LevelPlan, "hp">): PlanPicks {
  const byPool = (named: Record<string, string[]>, ids: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(named).map(([pool, names]) => [ctx.aptMap[pool], names.map((name) => ids[name] ?? name)]),
    );
  return {
    skills: Object.fromEntries(Object.entries(skills).map(([name, ranks]) => [ctx.skillMap[name], ranks])),
    feats: byPool(feats, ctx.featMap),
    spells: byPool(spells, ctx.spellMap),
  };
}

/**
 * Adds a level of `klass` (by name) to a character, as Add Level saves it, as `plan` says, and checks the save took
 * the class's level `level`: the engine numbers it, its class's next. Unless `force`d, the engine refuses what the
 * character with it fails.
 */
export async function addLevel(
  session: Session,
  characterId: string,
  klass: string,
  level: number,
  plan: LevelPlan,
  force = false,
) {
  const ctx = await getPf1SeedCtx();
  const abilityIncreases = (plan.abilities ?? []).map((name) => ({ amount: 1, entityId: ctx.abilityMap[name] }));
  const saved = await CharacterAdvancementsService.addAdvancements(
    session,
    characterId,
    levelUpPlan([{ classId: ctx.classMap.pc[klass], level, hp: plan.hp, abilityIncreases }], picksOf(ctx, plan)),
    force,
  );
  await expectSavedLevels(saved, [level]);
  return saved[0];
}

/**
 * Checks the levels a save wrote (`saved`, in plan order) took the class levels the test expects (`levels`): a plan
 * names each level's class alone, and the engine numbers it, its class's next.
 */
export async function expectSavedLevels(saved: { entryId: string }[], levels: number[]) {
  const positions = [];
  for (const { entryId } of saved)
    positions.push((await Entities.findOne<KlassLevel>(db, { entityType: "class-levels", id: entryId }))?.position);
  if (positions.join() !== levels.join())
    throw new Error(`The save took class levels ${positions.join(", ")}, not ${levels.join(", ")}`);
}

/** The picks of a step (`hp`, `abilities`, `skills`, `feats`, `spells`) these levels took, as stored. */
export async function findPicks(step: string, advancementIds: string[]) {
  return (await Picks.findPerStep(db, { baseRules: PF1_BASE_RULES, advancementIds }))[step] ?? [];
}
