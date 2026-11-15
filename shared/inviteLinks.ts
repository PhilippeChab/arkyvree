/** An invite link's bounds, which the admin page's form and the server hold it to, and what its token reads as. */

export type InviteLinkState = (typeof INVITE_LINK_STATES)[number];

/** The lifetime a new invite link's form starts on, in days. */
export const DEFAULT_INVITE_LINK_LIFETIME_IN_DAYS = 7;

/** The lifetimes a new invite link is offered, in days: a day, a week (its form's default), a month. */
export const INVITE_LINK_LIFETIMES_IN_DAYS = [1, 7, 30] as const;

/**
 * What refuses a new account, on an instance that takes invites alone, whose invite link expired, was revoked, or names
 * no link: what its sign-up page says up front, and its sign-up's refusal.
 */
export const INVITE_LINK_MESSAGES: Record<Exclude<InviteLinkState, "Valid">, string> = {
  Expired: "This invite link has expired: ask for a new one.",
  Revoked: "This invite link was revoked: ask for a new one.",
  Unknown: "This invite link isn't valid: ask for a new one.",
};

/** What an invite link's token reads as, to whoever opens its link: one that lets them sign up, or why it doesn't. */
export const INVITE_LINK_STATES = ["Valid", "Expired", "Revoked", "Unknown"] as const;

/** What a link (`link`, none when its token names none) reads as: revoked, expired, or one that lets anyone sign up. */
export function describeInviteLinkState(
  link: { expiresAt: string; revokedAt: string | null } | undefined,
): InviteLinkState {
  if (!link) return "Unknown";
  if (link.revokedAt) return "Revoked";
  return new Date(link.expiresAt) <= new Date() ? "Expired" : "Valid";
}
