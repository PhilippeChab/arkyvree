import { testClient } from "hono/testing";

import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { application, type Application } from "@/server/routers/application.ts";

/** An API client whose requests carry `sessionId`'s cookie. */
export function apiAs(sessionId: string) {
  return testClient<Application>(application, {}, undefined, { headers: sessionHeaders(sessionId) });
}

/** The headers a request signed in as `sessionId` carries: its session's cookie. */
export function sessionHeaders(sessionId: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` };
}
