/**
 * How a row names an account that has both a username and an email address (a player, a contributor): from `sm` up,
 * its username over its email; on a phone, whose list item has one line to name it, its email alone.
 */

/** The email address, under the username from `sm` up, on a phone the item's name */
export const EMAIL_AS_NAME_SX = {
  display: { xs: "block", sm: "inline" },
  typography: { xs: "body2", sm: "caption" },
  color: { xs: "text.primary", sm: "text.secondary" },
  fontWeight: { xs: 500, sm: 400 },
};

/** The username, which a phone leaves out */
export const USERNAME_BESIDE_EMAIL_SX = { fontWeight: 500, display: { xs: "none", sm: "block" } };
