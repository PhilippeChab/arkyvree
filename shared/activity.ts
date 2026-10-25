/** One field an update changed, as an activity records it; long text fields carry no values. */
export interface ChangedField {
  field: string;
  from?: string;
  to?: string;
}

/** An invite's notification type. */
export type InviteNotificationType = (typeof INVITE_NOTIFICATION_TYPES)[number];

/** The tables whose activities have no page to open: an account's, a session's, a linked sign-in's. */
const NON_NAVIGABLE_TABLES: readonly string[] = ["oauth_accounts", "sessions", "users"];

/**
 * The notification types that are invites: answered in place with Accept / Reject, wherever a notification shows, and
 * read once they're answered, never by Mark All as Read.
 */
export const INVITE_NOTIFICATION_TYPES = [
  "createCampaignInvite",
  "inviteCharacterContributor",
  "inviteContributor",
] as const;

/**
 * The name an entity type's activities give it (`createPerk`, `updateOwnerLevel`): its table's singular, in
 * PascalCase. A client reads the type back from it (`entityTypeOfActivityName`) to name it in its ruleset's words.
 */
export function getActivityName(entityType: string) {
  const singular = entityType.replace(/(?:(ss|x|ch|sh)es|ies|s)$/, (ending, kept?: string) =>
    ending === "ies" ? "y" : (kept ?? ""),
  );
  return singular.replace(/(?:^|_)([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Whether an activity's or a notification's target has a page to open, which the server resolves as it's opened. */
export function isNavigableTarget(targetTable: string) {
  return !NON_NAVIGABLE_TABLES.includes(targetTable);
}
