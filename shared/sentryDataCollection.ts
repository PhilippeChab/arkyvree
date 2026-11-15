/** Header, cookie and query names Sentry leaves out of a report: what names a client's address or its user. */
const IDENTIFYING_NAMES = ["forwarded", "-ip", "remote-", "via", "-user"];

/** Query names Sentry leaves out of a report besides: an invite link's token (`/sign-up?invite=…`) lets its holder in. */
const SECRET_QUERY_NAMES = ["invite"];

/**
 * What Sentry may put in an error report, for the browser and the server alike: no user (not their address either), no
 * request or response body, no database query values, and headers, cookies and query parameters without the ones that
 * name a client or a user. Sentry's own list of secrets (tokens, sessions, passwords) is always filtered on top. It is
 * what Sentry 10 collected under `sendDefaultPii: false`; Sentry 11 collects everything unless told otherwise.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: { deny: IDENTIFYING_NAMES },
  httpHeaders: { request: { deny: IDENTIFYING_NAMES }, response: { deny: IDENTIFYING_NAMES } },
  httpBodies: [],
  urlQueryParams: { deny: [...IDENTIFYING_NAMES, ...SECRET_QUERY_NAMES] },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
};
