import type { Aptitude } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A new seeded fork of the seed user's with an aptitude of its own: the fork's `id` and the `aptitudeId`. */
export async function createSeededForkWithAptitude() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, aptitudeId: (await postAptitude(id)).id };
}

/** A new user with an empty ruleset of their own, holding aptitudes of these names: their ids, in that order. */
export async function createTestUserAndRuleset(aptitudeNames: string[] = []) {
  const { user, session } = await createTestUser();
  const ruleset = await createTestRuleset(user.id);
  const aptitudes = await Entities.createMany<Aptitude>(
    db,
    "aptitudes",
    aptitudeNames.map((name) => ({ name, rulesetId: ruleset.id })),
  );
  return { user, session, ruleset, aptitudeIds: aptitudes.map((a) => a.id) };
}

/** A new aptitude of the ruleset, created through the API as the seed user. */
export async function postAptitude(rulesetId: string) {
  return await expectOk(
    api.api.rulesets[":id"].entities[":entityType"].$post({
      param: { id: rulesetId, entityType: "aptitudes" },
      json: { name: `Aptitude ${uniqueId()}` },
    }),
  );
}
