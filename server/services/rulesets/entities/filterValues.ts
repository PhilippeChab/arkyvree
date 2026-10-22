/** A list filter's value as its kind's service takes it, once its kind's schema has read it: none when it isn't one. */

/** A filter's value when it's one of `values` (an aptitude's scope), else none. */
export function filterChoice<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return values.find((one) => one === value);
}

/** A filter's flag, none when it isn't one. */
export function filterFlag(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

/** A filter's number, none when it isn't one. */
export function filterNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

/** A filter's text, none when it isn't one. */
export function filterText(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
