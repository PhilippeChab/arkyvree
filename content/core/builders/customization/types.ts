/** A modifier's effect: its target, operator and value. */
export interface ModifierEffect {
  operator: string;
  target: string;
  value: string;
  valueType: string;
}

/** A property: a fact about its owner, by type (a weapon's damage, a feat's family). */
export interface Property {
  type: string;
  value: string;
}

/** A check: `target` compared to `value` with `operator`. */
export interface RequirementCondition {
  operator: string;
  target: string;
  value: string;
  valueType: string;
}

/** Requirements chained with `and` or `or`. */
export interface RequirementGroup {
  chainingOperator: "and" | "or";
  children: RequirementEntry[];
}

/** A modifier with no requirements: a class level's, a domain's, a race's or an item's (only a feat's has some). */
export type Modifier = ModifierEffect & { requirements?: never };

/** A feat's modifier, which applies only while its requirements are met. */
export type ModifierSeed = ModifierEffect & { requirements?: RequirementEntry[] };

/** A requirement: a check, or a group of them. */
export type RequirementEntry = RequirementCondition | RequirementGroup;
