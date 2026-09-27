import type { PathValueType } from "@/shared/customization/target.ts";

type PathChoice = { value: string; label: string };

const BOOLEAN_CHOICES: PathChoice[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
];

/** The values a path's input offers as a select: its own, True / False for a boolean, or null for free input. */
export const pathChoices = (
  valueType: PathValueType | undefined,
  possibleValues: PathChoice[] | undefined,
): PathChoice[] | null => possibleValues ?? (valueType === "boolean" ? BOOLEAN_CHOICES : null);

export function defaultValueForPath(
  valueType: PathValueType | undefined,
  possibleValues: PathChoice[] | undefined,
): string {
  if (possibleValues?.length) return possibleValues[0].value;
  if (valueType === "boolean") return "true";
  if (valueType === "number") return "0";
  return "";
}

/** Whether a literal value suits the path: one of its choices, or a number on a numeric path. */
export function fitsPath(
  value: string,
  valueType: PathValueType | undefined,
  possibleValues: PathChoice[] | undefined,
): boolean {
  const choices = pathChoices(valueType, possibleValues);
  if (choices) return choices.some((choice) => choice.value === value);
  if (valueType === "number") return value.trim() !== "" && Number.isFinite(Number(value));
  return true;
}
