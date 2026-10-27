/** Identifies a grant: its entity (`toId`), which can be granted through several (`viaId`), and the one it's through. */
export function grantKey(toId: string, viaId: string) {
  return `${toId}-${viaId}`;
}

/** A grant's label, which orders a grants input's: its entity's name and the one it's through's (a feat's pool). */
export function grantLabel(name: string, viaName: string | null | undefined) {
  return `${name} (${viaName || "Unknown"})`;
}

/** Grants in the order their input keeps them, by their labels (`labelOf`): never their picking order. */
export function sortGrants<G>(grants: readonly G[], labelOf: (grant: G) => string) {
  return grants.toSorted((a, b) => labelOf(a).localeCompare(labelOf(b)));
}
