export type SizeType = "Fine" | "Diminutive" | "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan" | "Colossal";

export type RaceDefinition = {
  name: string;
  description: string;
  size: SizeType;
  baseSpeed: number;
  kind?: string;
  modifiers?: { target: string; operator: string; value: string; valueType: string }[];
};
