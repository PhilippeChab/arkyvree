/** A modifier's or a requirement's literal value: its type, and the value its text is. */
export default class LiteralValue {
  /**
   * Whether a target's value has the type of a modifier's or a requirement's value: its own, or, for a list (a spell's
   * components), each of its values', one of which a requirement asks for and a modifier adds or takes. An empty list
   * (a subtract took its last value) has none to disagree, so any type passes; a list's path takes strings only.
   */
  static hasType(data: unknown, valueType: string | null): boolean {
    return Array.isArray(data) ? data.every((item) => typeof item === valueType) : typeof data === valueType;
  }

  /**
   * A modifier's or a requirement's literal value, typed by its value type: a finite number, the string itself, or a
   * boolean written `true` or `false`. Undefined when the literal isn't one of its type (`Boolean("false")` is true, and
   * `Number("")` 0) or the type is unknown.
   */
  static parse(value: string, valueType: string | null): number | string | boolean | undefined {
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
}
