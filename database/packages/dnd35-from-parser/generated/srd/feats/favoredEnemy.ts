import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { favoredEnemyFeats } from "@/database/packages/dnd35/data/feats/favoredEnemy.ts";

/** A system feat list (`coreSystemFeats`): no reference lists it. */
export const favoredEnemy: FeatSeed[] = favoredEnemyFeats;
