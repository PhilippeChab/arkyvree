/** An API key's bounds, which its form and the server hold it to. */

/** The lifetimes a new key is offered, in days: a month, three months (its form's default), a year. */
export const API_KEY_LIFETIMES_IN_DAYS = [30, 90, 365] as const;

/** The lifetime a new key's form starts on, in days. */
export const DEFAULT_API_KEY_LIFETIME_IN_DAYS = 90;

/** The longest lifetime a key that expires takes, in days: a key may also never expire. */
export const MAX_API_KEY_LIFETIME_IN_DAYS = 365;

/** The longest name an API key takes. */
export const MAX_API_KEY_NAME_LENGTH = 100;

/** The most API keys a user keeps at once: each key's requests are counted apart, so the keys bound a user's. */
export const MAX_API_KEYS = 10;
