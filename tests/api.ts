import { type ClientResponse, DetailedError, type InferRequestType, parseResponse } from "hono/client";
import { testClient } from "hono/testing";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import { Sessions } from "@/server/repositories/index.ts";
import { application, type Application } from "@/server/routers/application.ts";
import { createTestUser, getSeedCtx, uniqueId } from "@/tests/helpers.ts";

/** The seeded session of the seeded user (`SEED_USER_ID`, LocalUser). */
export const SEED_SESSION_ID = "00000000-0000-4000-8000-000000000123";

/** Signed out. */
export const guestApi = testClient<Application>(application);

/** An API client whose requests carry `sessionId`'s cookie. */
export function apiAs(sessionId: string) {
  return testClient<Application>(application, {}, undefined, {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
  });
}

/** Signed in as the seeded user, who owns most seeded content. */
export const api = apiAs(SEED_SESSION_ID);

/** A client signed in as `userId`, through a stored session. */
export async function signedInApi(userId: string = SEED_USER_ID) {
  const [session] = await Sessions.create(db, { userId });
  return apiAs(session.id);
}

/** The session id a response's `Set-Cookie` signs in with. */
export function sessionIdFrom(response: { headers: Headers }) {
  const sessionId = response.headers.get("set-cookie")?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`))?.[1];
  if (!sessionId) throw new Error("No session cookie in the response");
  return sessionId;
}

/** A new user and a client signed in as them. */
export async function createSignedInUser(prefix?: string) {
  const { user, session } = await createTestUser(prefix);
  return { user, session, api: await signedInApi(user.id) };
}

/**
 * The body of a 2xx response, typed as the route's success body. Any other
 * status fails the test with the server's error in the message.
 */
export async function expectOk<T extends ClientResponse<unknown>>(response: T | Promise<T>) {
  try {
    return await parseResponse(response);
  } catch (error) {
    if (!(error instanceof DetailedError)) throw error;
    throw new Error(`${error.message}: ${JSON.stringify(error.detail?.data)}`, { cause: error });
  }
}

/**
 * The response, once it answered `status`: an error, which a route's types don't list (they list what it returns,
 * and what it throws reaches the app's `onError`). Any other status fails the test with the response's body.
 */
export async function expectStatus<T extends { status: number; clone(): { text(): Promise<string> } }>(
  response: T | Promise<T>,
  status: number,
) {
  const awaited = await response;
  if (awaited.status !== status) {
    throw new Error(`Expected status ${status}, got ${awaited.status}: ${await awaited.clone().text()}`);
  }
  return awaited;
}

/**
 * A new character of the seed user's, created through the API: a Human on the seeded ruleset with every ability at 10,
 * unless `json` says otherwise.
 */
export async function postCharacter(json: Partial<InferRequestType<typeof api.api.characters.$post>["json"]> = {}) {
  const ctx = await getSeedCtx();
  const { rulesetId = ctx.rulesetId, name = `Test Character ${uniqueId()}`, ...rest } = json;
  return await expectOk(
    api.api.characters.$post({
      json: {
        raceId: ctx.raceMap.pc["Human"],
        xp: 0,
        alignment: "True Neutral",
        abilities: Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10])),
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
        ...rest,
        rulesetId,
        name,
      },
    }),
  );
}
