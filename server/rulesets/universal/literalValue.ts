/**
 * A modifier's or a requirement's literal value, typed by its value type: a finite number, the string itself, or a
 * boolean written `true` or `false`. Undefined when the literal isn't one of its type (`Boolean("false")` is true, and
 * `Number("")` 0) or the type is unknown.
 */
export function parseLiteralValue(value: string, valueType: string | null): number | string | boolean | undefined {
  switch (valueType) {
    case "number": {
      const number = Number(value);
      return value.trim() !== "" && Number.isFinite(number) ? number : undefined;
    }
    case "string":
      return value;
    case "boolean":
      return value === "true" ? true : value === "false" ? false : undefined;
    default:
      return undefined;
  }
}
