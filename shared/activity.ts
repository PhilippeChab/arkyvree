import { TARGET_TYPES } from "./activityTargets.ts";

/**
 * One value an update changed, as an activity records it: its name, its description, a field by the stored field that
 * keeps it (`SPELL_SCHOOL`), or a single link by its role (`resistedBy`), labeled as its declaration labels it
 * (`label`: "School", "Saving Throw"), with its text before and after (`from`, `to`: none for none; a list's values
 * joined by ", "; a single link's target by its name); a long text (its description) carries none, only that it
 * changed. An older one carries no label, and its link's target by its id.
 */
export interface ChangedField {
  field: string;
  from?: string;
  label?: string;
  to?: string;
}

/**
 * An entry of a list of links an update added or removed: its target (`toId`) and its target's name (`toName`), and,
 * where its role's entries carry them, the link's own columns: the pool it's through (`viaName`, its name: a granted
 * feat's), whether it's free, its amount (a save's base bonus), its tier (a spell's level on its list).
 */
export interface ChangedLink {
  amount?: number | null;
  free?: boolean;
  tier?: number | null;
  toId: string;
  toName: string;
  viaName?: string | null;
}

/**
 * The links of a role an update set (`role`: a feat's `listedIn`, a class level's `grants`), labeled as its role's
 * declaration labels it (`label`: "Aptitudes", "Feats"): the entries it added and those it removed, each in its order.
 * An entry whose own columns change (a spell list's level) is removed as it was and added as it is.
 */
export interface ChangedLinks {
  added: ChangedLink[];
  label: string;
  removed: ChangedLink[];
  role: string;
}

/**
 * One change an update's activity records (`changedFields`, in its form's order): a value's (`ChangedField`), or the
 * links of a role it holds many of (`ChangedLinks`).
 */
export type ActivityChange = ChangedField | ChangedLinks;

/** An invite's notification type. */
export type InviteNotificationType = (typeof INVITE_NOTIFICATION_TYPES)[number];

/** The target types whose activities have no page to open: an account's, a session's, a linked sign-in's. */
const NON_NAVIGABLE_TYPES: readonly string[] = [TARGET_TYPES.oauthAccounts, TARGET_TYPES.sessions, TARGET_TYPES.users];

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
 * The name an entity type's activities give it (`createPerk`, `updateOwnerLevel`): the type's singular, its words
 * (`owner-levels`) in PascalCase. A client reads the type back from it (`entityTypeOfActivityName`) to name it in its
 * ruleset's words.
 */
export function getActivityName(entityType: string) {
  const singular = entityType.replace(/(?:(ss|x|ch|sh)es|ies|s)$/, (ending, kept?: string) =>
    ending === "ies" ? "y" : (kept ?? ""),
  );
  return singular.replace(/(?:^|-)([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Whether an activity's or a notification's target has a page to open, which the server resolves as it's opened. */
export function isNavigableTarget(targetType: string) {
  return !NON_NAVIGABLE_TYPES.includes(targetType);
}
