import { Hono } from "hono";

import signedIn from "./signedIn/index.ts";
import signedOut from "./signedOut/index.ts";

/**
 * The `/auth` routes. The signed-out ones are mounted first: the signed-in router's middleware (its session) applies to
 * every route registered after it, which would ask a session to sign in.
 */
export default new Hono().route("/", signedOut).route("/", signedIn);
