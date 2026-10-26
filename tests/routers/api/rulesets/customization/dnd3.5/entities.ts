import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { postAptitude } from "@/tests/support/dnd3.5/rulesets.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import {
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A seeded fork of the seeded user's with a new feat to customize: the fork's `id`, and the feat's as `entityId`. */
export async function createCustomizableFeat() {
  const { id } = await createSeededTestRuleset(SEED_USER_ID);
  return { id, entityId: await createEntity(id, "feats") };
}

/**
 * A new entity of `entityType` created in the ruleset, so customizing it edits
 * that row instead of copying an inherited one.
 */
export async function createEntity(rulesetId: string, entityType: string): Promise<string> {
  const ruleset = api.api.rulesets[":id"];
  const kinds = ruleset.entities[":entityType"];
  const id = rulesetId;
  const name = `Test ${entityType} ${uniqueId()}`;
  switch (entityType) {
    case "feats":
    case "spells": {
      const aptitude = await postAptitude(rulesetId);
      const links = { listedIn: [{ toId: aptitude.id }] };
      return (await expectOk(kinds.$post({ param: { id, entityType }, json: { name, links } }))).id;
    }
    case "items":
      return (await expectOk(kinds.$post({ param: { id, entityType }, json: { name } }))).id;
    case "races": {
      const json = { name, fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 } };
      return (await expectOk(kinds.$post({ param: { id, entityType }, json }))).id;
    }
    case "classes":
      return (await expectOk(kinds.$post({ param: { id, entityType: "classes" }, json: { name } }))).id;
    case "class-levels": {
      const klass = await expectOk(kinds.$post({ param: { id, entityType: "classes" }, json: { name } }));
      const level = await expectOk(
        ruleset.entities[":entityType"][":entityId"].owned.$post({
          param: { id: rulesetId, entityType: "classes", entityId: klass.id },
          json: { fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 4 }, position: 1 },
        }),
      );
      return level.id;
    }
    default:
      throw new Error(`No customizable ${entityType}`);
  }
}
