import type { Db } from "@/server/database/index.ts";

export interface PowerBody {
  school?: string;
  subschool?: string;
  descriptors?: string[];
  castingTime?: string;
  rangeType?: string;
  target?: string;
  areaOfEffect?: string;
  duration?: string;
  spellResistance?: string;
  components?: string[];
}

export interface PowersHooks {
  readonly primaryGroupingType: string;

  extractGroupingValue(body: PowerBody): string | null;
  generateProperties(tx: Db, powerId: string, body: PowerBody): Promise<void>;
  /** `sourceChain` is the caller's ruleset source chain (passed in so hooks
   *  don't have to refetch it when they're already running inside a scope). */
  generateGroupingFeats(tx: Db, rulesetId: string, sourceChain: string[], value: string): Promise<void>;
  deleteGroupingFeats(tx: Db, rulesetId: string, sourceChain: string[], value: string): Promise<void>;
  afterPowerLinked?(tx: Db, powerId: string, rulesetId: string, sourceChain: string[]): Promise<void>;
}
