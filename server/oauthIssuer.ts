import { readEnv } from "./environment.ts";

/** The app's dev server's origin, the issuer outside production when `APP_URL` names none. */
const DEV_ORIGIN = "http://localhost:5173";

/** The scopes a connected app is given: `read` alone for a read-only one, `read write` otherwise. */
export const OAUTH_SCOPES = ["read", "write"] as const;

/** The OAuth issuer: the app's origin (`APP_URL`), whose `/oauth/…` endpoints sign apps in to the MCP server. */
export function readIssuer() {
  return new URL(readEnv("APP_URL") ?? DEV_ORIGIN).origin;
}

/** The MCP server's URL, as a user enters it in Claude or ChatGPT: the resource a token is for, and only it. */
export function readResource() {
  return `${readIssuer()}/mcp`;
}

/** The scope a grant gives, as a token's answer names it. */
export function toScope(readOnly: boolean) {
  return readOnly ? "read" : OAUTH_SCOPES.join(" ");
}
