/**
 * Whether a ruleset's page lists its own entities alone (`childOnly`): its changes to what it inherits, which only a
 * reader who may view them (`canViewChanges`, its permissions' answer) is shown, whatever a link says. Its reader's
 * pick (`choice`), else its default, which an extension's page opens on, its own entities being what it brings. Its
 * page, its tabs' prefetch and its list's prefetch all ask it, so a prefetch warms the list the page opens on.
 */
export function childOnlyOf(
  ruleset: { kind: string; permissions: { canViewChanges: boolean } },
  choice?: "true" | "false",
) {
  if (!ruleset.permissions.canViewChanges) return false;
  return choice ? choice === "true" : ruleset.kind === "extension";
}
