/** Whether `value` is one of `options`: a value that must be one of a fixed set (an enum's values, a list of names). */
export function isOneOf<T extends boolean | number | string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}
