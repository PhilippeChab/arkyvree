/** A password reset link an admin makes: how long it lasts, and what its token reads as to whoever opens it. */

export type PasswordResetLinkState = (typeof PASSWORD_RESET_LINK_STATES)[number];

/** How long a password reset link resets its account's password, in milliseconds: an hour. */
export const PASSWORD_RESET_LINK_LIFETIME_MS = 60 * 60 * 1000;

/** What refuses a reset through a link that expired, was used, or names no link: what its page says up front. */
export const PASSWORD_RESET_LINK_MESSAGES: Record<Exclude<PasswordResetLinkState, "Valid">, string> = {
  Expired: "This password reset link has expired: ask an admin for a new one.",
  Used: "This password reset link was already used: ask an admin for a new one if you need it.",
  Unknown: "This password reset link isn't valid: ask an admin for a new one.",
};

/** What a password reset link's token reads as: one that resets its account's password, or why it doesn't. */
export const PASSWORD_RESET_LINK_STATES = ["Valid", "Expired", "Used", "Unknown"] as const;

/** What a link (`link`, none when its token names none) reads as: used, expired, or one that resets a password. */
export function describePasswordResetLinkState(
  link: { expiresAt: string; usedAt: string | null } | undefined,
): PasswordResetLinkState {
  if (!link) return "Unknown";
  if (link.usedAt) return "Used";
  return new Date(link.expiresAt) <= new Date() ? "Expired" : "Valid";
}
