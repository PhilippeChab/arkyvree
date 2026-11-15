import { readStored, removeStored, writeStored } from "./browserStorage.ts";

const INVITE_TOKEN_KEY = "invite_token";

/** The token where the tab's storage is blocked: kept for the page's life instead. */
let memoryToken: string | null = null;

/** Forgets the invite link's token the tab kept: an account was made, or the user signed in. */
export function clearInviteToken() {
  memoryToken = null;
  removeStored("session", INVITE_TOKEN_KEY);
}

/** The token of the invite link the tab was opened through (`/sign-up?invite=…`), if it kept one. */
export function readInviteToken() {
  return readStored("session", INVITE_TOKEN_KEY) ?? memoryToken;
}

/**
 * Keeps the token of the invite link the tab was opened through, for the tab's life: its sign-up, or a Google sign-in
 * from its sign-in page, carries it, after the address bar no longer shows it.
 */
export function saveInviteToken(token: string) {
  memoryToken = token;
  writeStored("session", INVITE_TOKEN_KEY, token);
}
