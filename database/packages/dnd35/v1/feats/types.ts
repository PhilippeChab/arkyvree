export { feat, eq, ne, gte, or, and, eqStr, classReq } from "@/database/packages/dnd35/seed-utils.ts";

export type RequirementCondition = { target: string; operator: string; value: string; valueType: string };
export type RequirementGroup = { chainingOperator: "and" | "or"; children: RequirementEntry[] };
export type RequirementEntry = RequirementCondition | RequirementGroup;

export type ModifierSeed = {
  target: string;
  operator: string;
  value: string;
  valueType: string;
  requirements?: RequirementEntry[];
};

export type FeatSeed = {
  name: string;
  description: string;
  stackable?: boolean;
  selectable?: boolean;
  aptitudes: string[];
  modifiers?: ModifierSeed[];
  requirements?: RequirementEntry[];
  properties?: { type: string; value: string }[];
};
