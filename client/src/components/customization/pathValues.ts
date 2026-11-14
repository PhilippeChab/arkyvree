import type { PathValueType, TargetPath } from "@/shared/customization/target.ts";

/** A value a target path takes, among those it lists: its label and what it stores. */
export type PathChoice = NonNullable<TargetPath["possibleValues"]>[number];

/** What a complete target path takes: its value type, operators and values. */
export type PathInfo = Pick<
  TargetPath,
  "path" | "valueType" | "operators" | "possibleValues" | "setValues" | "literalOnly"
>;

const BOOLEAN_CHOICES: PathChoice[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
];

/**
 * The value a new condition starts on once its path is picked: its first choice, True for a boolean, and none for a
 * number or a text, which is typed (a "0" there would take the digits typed after it: "02").
 */
export function defaultValueForPath(
  valueType: PathValueType | undefined,
  possibleValues: PathChoice[] | undefined,
): string {
  if (possibleValues?.length) return possibleValues[0].value;
  if (valueType === "boolean") return "true";
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

/**
 * What a condition's path takes as its form shows it (`path`): what its lookup answered (`loaded`), or, while the
 * lookup has nothing for it, what it answered last for that same path (`last`). A dialog opened before the path's
 * entity was renamed elsewhere keeps its operators and values once a refresh finds the old name no more, so its
 * author can still change its operator alone, which the server checks against the path it keeps.
 */
export function knownPathInfo(loaded: PathInfo | null | undefined, last: PathInfo | null, path: string) {
  return loaded ?? (last?.path === path ? last : null);
}

/** The values a path's input offers as a select: its own, True / False for a boolean, or null for free input. */
export function pathChoices(
  valueType: PathValueType | undefined,
  possibleValues: PathChoice[] | undefined,
): PathChoice[] | null {
  return possibleValues ?? (valueType === "boolean" ? BOOLEAN_CHOICES : null);
}

/** What a target path takes, read from its definition or from the completion it was picked from. */
export function toPathInfo({ path, valueType, operators, possibleValues, setValues, literalOnly }: PathInfo): PathInfo {
  return { path, valueType, operators, possibleValues, setValues, literalOnly };
}
