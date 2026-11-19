import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { db } from "@/server/database/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { TargetPathsService } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { ownerSessionOf, readTargetPaths } from "@/tests/support/rulesets.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const session = makeSession();

/** The first segments the editor offers a kind's entity (`entityType`) for a modifier or a requirement. */
async function rootsOffered(kind: TargetPathKind, entityType: string) {
  const { rulesetId } = await getDnd5SeedCtx();
  const { items } = await TargetPathsService.getCompletions(
    await ownerSessionOf(rulesetId),
    rulesetId,
    "",
    0,
    kind,
    entityType,
  );
  return items.map((item) => item.insertText);
}

/** The id of one of the seeded core rules' entities, of a kind, by name. */
async function seededId(type: string, name: string) {
  const { rulesetId } = await getDnd5SeedCtx();
  const [row] = await db
    .select({ id: entitiesInRules.id })
    .from(entitiesInRules)
    .where(
      and(eq(entitiesInRules.rulesetId, rulesetId), eq(entitiesInRules.type, type), eq(entitiesInRules.name, name)),
    );
  return row.id;
}

/** The seeded D&D 5th Edition core rules' paths of a kind, by path. */
async function seedPaths(kind: TargetPathKind) {
  const { rulesetId } = await getDnd5SeedCtx();
  return new Map((await readTargetPaths(rulesetId, kind)).paths.map((p) => [p.path, p]));
}

describe("D&D 5th Edition target paths: a weapon's", () => {
  test("takes modifiers from an item only", async () => {
    const modifiers = await seedPaths("modifier");
    for (const path of ["weapon.tohit.magic", "weapon.tohit.misc", "weapon.damage.magic", "weapon.damage.die"])
      expect(modifiers.get(path)?.allowedEntityTypes).toEqual(["items"]);
  });

  test("offers no weapon proficiency, mastery, Finesse or armor training: an item's requirements and a feat's fields tell", async () => {
    for (const kind of ["modifier", "requirement", "template"] as const) {
      const paths = [...(await seedPaths(kind)).keys()];
      expect(
        paths.filter((path) =>
          /^(weapon|items\.weapons\.[^.]+)\.(proficient|mastered|finesse)$|^combat\.armortraining\./.test(path),
        ),
      ).toEqual([]);
    }
  });

  test("is offered for an item's modifiers, never a feat's or a character's", async () => {
    expect(await rootsOffered("modifier", "items")).toContain("weapon");
    expect(await rootsOffered("modifier", "feats")).not.toContain("weapon");
    expect(await rootsOffered("modifier", "characters")).not.toContain("weapon");
  });

  test("refuses a feat's modifier on it, which no slot would read, and saves an item's", async () => {
    const { itemMap, rulesetId } = await getDnd5SeedCtx();
    const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
    const alert = await seededId("feats", "Alert");
    const body = { target: "weapon.tohit.misc", operator: "add", value: "1" };
    expect(ModifiersService.createModifier(session, fork.id, "feats", alert, body)).rejects.toEqual(
      new RulesError("invalid", "weapon.tohit.misc takes modifiers from items only"),
    );
    expect(await ModifiersService.createModifier(session, fork.id, "items", itemMap.Longsword, body)).toMatchObject(
      body,
    );
  });
});
