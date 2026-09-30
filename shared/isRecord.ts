/** Narrows untyped data (JSON payloads, stored state) to an object whose keys can be read. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
