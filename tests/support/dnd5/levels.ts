/**
 * D&D 5th Edition levels as the tests name them, saved as Add Level saves them: a level's class, hit points and picks by
 * name, read into ids of the seeded core rules, and the levels and picks a save wrote, read back.
 */

import type { SeedContext } from "@/database/seeders/dnd5/characters/seedContext.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Picks } from "@/server/repositories/index.ts";
import { CharacterAdvancementsService } from "@/server/services/characters/advancements/index.ts";
import type { Session } from "@/shared/relations.ts";
import { DND5_BASE_RULES } from "@/vocabulary/dnd5/baseRules.ts";

import { levelUpPlan, type PlanPicks } from "./levelPlans.ts";
import { getDnd5SeedCtx } from "./seed.ts";

/** A level's plan by name: its hit points, and the feats and spells it picks in each pool. */
export interface LevelPlan {
  feats?: Record<string, string[]>;
  hp: number;
  spells?: Record<string, string[]>;
}

/** A plan's picks by name read into the seeded core rules' ids: each pool's and each pick's. */
export function picksOf(ctx: SeedContext, { feats = {}, spells = {} }: Omit<LevelPlan, "hp">): PlanPicks {
  const byPool = (named: Record<string, string[]>, ids: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(named).map(([pool, names]) => [ctx.aptMap[pool], names.map((name) => ids[name] ?? name)]),
    );
  return { feats: byPool(feats, ctx.featMap), spells: byPool(spells, ctx.spellMap) };
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
  const ctx = await getDnd5SeedCtx();
  const saved = await CharacterAdvancementsService.addAdvancements(
    session,
    characterId,
    levelUpPlan([{ classId: ctx.classMap[klass], level, hp: plan.hp }], picksOf(ctx, plan)),
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

/** The picks of a step (`hp`, `feats`, `spells`) these levels took, as stored. */
export async function findPicks(step: string, advancementIds: string[]) {
  return (await Picks.findPerStep(db, DND5_BASE_RULES, { advancementIds }))[step] ?? [];
}
