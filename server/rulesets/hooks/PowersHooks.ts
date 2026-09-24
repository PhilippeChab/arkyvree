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
  afterPowerLinked?(tx: Db, powerId: string, rulesetId: string, sourceChain: string[]): Promise<void>;
}
