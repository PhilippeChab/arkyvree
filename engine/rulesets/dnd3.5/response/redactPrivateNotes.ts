/** Preserve each endpoint's response shape without mutating cached sheet data. */
export function redactPrivateNotes<T extends { identity: { background: { privateNotes?: string } } }>(
  entry: T,
  replacement: "" | undefined,
): T {
  return {
    ...entry,
    identity: {
      ...entry.identity,
      background: { ...entry.identity.background, privateNotes: replacement },
    },
  };
}
