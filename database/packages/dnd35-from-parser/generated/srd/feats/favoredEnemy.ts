import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { favoredEnemyFeats } from "@/database/packages/dnd35/data/feats/favoredEnemy.ts";

/** A system feat list (`buildCoreSystemFeats`): no reference lists it. */
export const favoredEnemy: FeatSeed[] = favoredEnemyFeats;
