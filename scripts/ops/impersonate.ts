import { db } from "@/server/database/index.ts";
import { Sessions, Users } from "@/server/repositories/index.ts";

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

const authStorage = JSON.stringify({
  state: {
    user: {
      id: user.id,
      emailAddress: user.emailAddress,
      name: user.username || undefined,
      pendingEmailAddress: user.pendingEmailAddress,
      onboardingCompletedAt: user.onboardingCompletedAt,
    },
    isAuthenticated: true,
  },
  version: 0,
});

console.log(`\nSession created for ${user.username ?? user.emailAddress}`);
console.log(`\nRun this in the browser console on your app's domain:\n`);
console.log(`document.cookie = "session-id=${session.id}; path=/; max-age=604800; secure; samesite=strict";`);
console.log(`localStorage.setItem("auth-storage", '${authStorage.replace(/'/g, "\\'")}');`);
console.log(`location.reload();`);

process.exit(0);
