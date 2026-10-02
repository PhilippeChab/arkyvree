/**
 * Signs a browser in as the user with the email address given: creates a session and prints what to run in the
 * browser's console.
 *
 * Usage: bun run prod:impersonate <email>
 */
import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/server/middlewares/session.ts";
import { Sessions, Users } from "@/server/repositories/index.ts";
import { AUTH_STORAGE_KEY } from "@/shared/auth.ts";

const email = process.argv[2];
if (!email) {
  console.error("Usage: bun scripts/ops/impersonate.ts <email>");
  process.exit(1);
}

const user = await Users.findOne(db, { emailAddress: email });
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const [session] = await Sessions.create(db, { userId: user.id });

// A signed-in browser's session cookie is httpOnly, which the console can't replace. Once the stored state is gone,
// the app loads the user from the new session (checkAuth, client/src/stores/authStore.ts).
console.log(`\nSession created for ${user.username ?? user.emailAddress}`);
console.log(`\nIn a signed-out or private window on the app's domain, run this in the browser console:\n`);
console.log(
  `document.cookie = "${SESSION_COOKIE_NAME}=${session.id}; path=/; max-age=${SESSION_TTL_SECONDS}; secure; samesite=strict";`,
);
console.log(`localStorage.removeItem("${AUTH_STORAGE_KEY}");`);
console.log(`location.reload();`);

process.exit(0);
