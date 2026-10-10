import { SEED_USER_ID } from "@/database/seeds/users.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { createSeededTestRuleset, postAptitude } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";

/** A seeded fork of the seeded user's with a new feat to customize: the fork's `id`, and the feat's as `entityId`. */
export async function createCustomizableFeat() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, entityId: await createEntity(id, "feats") };
}

/**
 * A new entity of `entityType` created in the ruleset, so customizing it edits
 * that row instead of copying an inherited one.
 */
export async function createEntity(rulesetId: string, entityType: CustomizableEntityType): Promise<string> {
  const ruleset = api.api.rulesets[":id"];
  const param = { id: rulesetId };
  const name = `Test ${entityType} ${uniqueId()}`;
  switch (entityType) {
    case "feats":
    case "powers": {
      const aptitude = await postAptitude(rulesetId);
      return entityType === "feats"
        ? (await expectOk(ruleset.feats.$post({ param, json: { name, aptitudeIds: [aptitude.id] } }))).id
        : (await expectOk(ruleset.powers.$post({ param, json: { name, aptitudes: [{ id: aptitude.id }] } }))).id;
    }
    case "items":
      return (await expectOk(ruleset.items.$post({ param, json: { name } }))).id;
    case "races":
      return (await expectOk(ruleset.races.$post({ param, json: { name, size: "Medium", baseSpeed: 30 } }))).id;
    case "klasses":
      return (await expectOk(ruleset.classes.$post({ param, json: { name } }))).id;
    case "klass_levels": {
      const klass = await expectOk(ruleset.classes.$post({ param, json: { name } }));
      const level = await expectOk(
        ruleset.classes[":classId"].levels.$post({
          param: { id: rulesetId, classId: klass.id },
          json: { level: 1, fields: { bab: 1, skills: 4 } },
        }),
      );
      return level.id;
    }
  }
}
