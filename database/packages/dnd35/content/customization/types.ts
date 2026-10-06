/** A modifier with no requirements: a class level's, a domain's, a race's or an item's (only a feat's has some). */
export type Modifier = ModifierEffect & { requirements?: never };

/** A modifier's effect: its target, operator and value. */
export type ModifierEffect = { target: string; operator: string; value: string; valueType: string };

/** A feat's modifier, which applies only while its requirements are met. */
export type ModifierSeed = ModifierEffect & { requirements?: RequirementEntry[] };

/** A property: a fact about its owner, by type (a weapon's damage, a feat's family). */
export type Property = { type: string; value: string };

/** A check: `target` compared to `value` with `operator`. */
export type RequirementCondition = { target: string; operator: string; value: string; valueType: string };

/** A requirement: a check, or a group of them. */
export type RequirementEntry = RequirementCondition | RequirementGroup;

/** Requirements chained with `and` or `or`. */
export type RequirementGroup = { chainingOperator: "and" | "or"; children: RequirementEntry[] };
