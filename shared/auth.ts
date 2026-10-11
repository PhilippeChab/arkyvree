/** Where the client keeps its signed-in state (client/src/stores/authStore.ts). */
export const AUTH_STORAGE_KEY = "auth-storage";

export const PASSWORD_MIN_LENGTH = 12;

/** The longest username, measured as it's stored (sanitized), which the server checks and the profile's field. */
export const USERNAME_MAX_LENGTH = 50;

/** The shortest username, measured as it's stored (sanitized), which the server checks and the profile's field. */
export const USERNAME_MIN_LENGTH = 3;

/** How many digits a verification code has, which the server sends and the client's field takes. */
export const VERIFICATION_CODE_LENGTH = 8;
