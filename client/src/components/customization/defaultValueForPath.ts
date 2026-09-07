export function defaultValueForPath(
  valueType: "number" | "string" | "boolean" | undefined,
  possibleValues: { value: string; label: string }[] | undefined,
): string {
  if (possibleValues?.length) return possibleValues[0].value;
  if (valueType === "boolean") return "true";
  if (valueType === "number") return "0";
  return "";
}
