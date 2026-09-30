/** Whether `value` is one of `options`: text that must be one of a fixed set (an enum's values, a list of names). */
export function isOneOf<T extends string>(value: string | null | undefined, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}
