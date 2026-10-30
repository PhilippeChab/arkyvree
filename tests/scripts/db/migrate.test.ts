/** The migrations `migrate.ts` applies that read no ruleset's content, each run on rows written as they stood before it. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A migration's statements, as drizzle splits them. */
function statementsOf(file: string) {
  return readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
}

/**
 * Each ruleset's array of ancestors written as it stood before 0101, a copy of its parent: its parent alone, or none
 * for a base, but for the rulesets `drifted` names, whose array is the one given (`ancestors`).
 */
async function restoreAncestorsBefore0101(drifted: { ancestors: string[]; id: string }[] = []) {
  await db.execute(sql`
    ALTER TABLE rules.rulesets ADD COLUMN ancestor_ruleset_ids uuid[] DEFAULT '{}' NOT NULL;
    UPDATE rules.rulesets SET ancestor_ruleset_ids = ARRAY[ruleset_id] WHERE ruleset_id IS NOT NULL;
  `);
  for (const { ancestors, id } of drifted) {
    await db.execute(sql`UPDATE rules.rulesets SET ancestor_ruleset_ids = ${`{${ancestors.join(",")}}`}::uuid[]
      WHERE id = ${id}`);
  }
}

/**
 * Each ruleset's array (`extensions`, its ids in its order) and `ruleset_extensions` rows (`rows`: an extension's id,
 * archived or not), written as they stood before 0098: its array back, its ordinal, check and index gone.
 */
async function restoreArraysBefore0098(rulesets: { extensions: string[]; id: string; rows: [string, boolean][] }[]) {
  await db.execute(sql`
    DROP INDEX rules.ruleset_extensions_ruleset_id_ordinal_idx;
    ALTER TABLE rules.ruleset_extensions DROP CONSTRAINT ruleset_extensions_ordinal_check;
    ALTER TABLE rules.ruleset_extensions DROP COLUMN ordinal;
    ALTER TABLE rules.rulesets ADD COLUMN extension_ruleset_ids uuid[] DEFAULT '{}' NOT NULL;
  `);
  for (const { extensions, id, rows } of rulesets) {
    await db.execute(sql`UPDATE rules.rulesets SET extension_ruleset_ids = ${`{${extensions.join(",")}}`}::uuid[]
      WHERE id = ${id}`);
    for (const [extensionId, archived] of rows) {
      await db.execute(sql`
        INSERT INTO rules.ruleset_extensions (ruleset_id, extension_id, created_at, updated_at, deleted_at)
        VALUES (${id}, ${extensionId}, now() - interval '1 day', now() - interval '1 day',
          ${archived ? sql`now() - interval '1 hour'` : null})
      `);
    }
  }
}

/** A ruleset's `ruleset_extensions` rows, each its extension, its place, and whether it's archived, in their order. */
async function rowsOf(rulesetId: string) {
  const { rows } = await db.execute<{ archived: boolean; extension: string; ordinal: number }>(sql`
    SELECT extension_id AS extension, ordinal, deleted_at IS NOT NULL AS archived
    FROM rules.ruleset_extensions WHERE ruleset_id = ${rulesetId} ORDER BY ordinal
  `);
  return rows;
}

/** Every ruleset's columns but the arrays, each as one line: what 0098 and 0101 leave as they were. */
async function rulesetRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT concat_ws(' ', id, name, ruleset_id, user_id, system, private, status, kind, base_rules, created_at::text,
      updated_at::text) AS line
    FROM rules.rulesets ORDER BY id
  `);
  return rows.map((row) => row.line);
}

/** Every `ruleset_extensions` row's timestamps, by its ruleset and extension: what 0098 changes of no row it keeps. */
async function stampsOf() {
  const { rows } = await db.execute<{ key: string; stamps: string }>(sql`
    SELECT ruleset_id || ' ' || extension_id AS key, created_at::text || ' ' || updated_at::text AS stamps
    FROM rules.ruleset_extensions
  `);
  return new Map(rows.map((row) => [row.key, row.stamps]));
}

describe("0098_extensions-store", () => {
  test("keeps a ruleset's extensions in its rows alone, in its array's order, and changes nothing else", async () => {
    const [first, second, third, fourth] = [
      await createTestRuleset(null, { kind: "extension" }),
      await createTestRuleset(null, { kind: "extension" }),
      await createTestRuleset(null, { kind: "extension" }),
      await createTestRuleset(null, { kind: "extension" }),
    ];
    const [host, base, unsubscribed, agreeing] = [
      await createTestRuleset(null),
      await createTestRuleset(null),
      await createTestRuleset(null),
      await createTestRuleset(null),
    ];
    await restoreArraysBefore0098([
      // An array whose extensions have a live row, an archived one, none, and a row the array doesn't name
      {
        id: host.id,
        extensions: [second.id, first.id, third.id],
        rows: [
          [first.id, false],
          [second.id, true],
          [fourth.id, false],
        ],
      },
      // A system base's rows for its extensions, though it subscribes to none; an unsubscribed one's archived row
      {
        id: base.id,
        extensions: [],
        rows: [
          [first.id, false],
          [second.id, false],
        ],
      },
      { id: unsubscribed.id, extensions: [], rows: [[third.id, true]] },
      { id: agreeing.id, extensions: [fourth.id], rows: [[fourth.id, false]] },
    ]);
    const [before, stamps] = [await rulesetRows(), await stampsOf()];

    for (const statement of statementsOf("0098_extensions-store.sql")) await db.execute(sql.raw(statement));

    // The host's in its array's order: its archived row live again, its missing one written, its stray one gone
    expect(await rowsOf(host.id)).toEqual([
      { extension: second.id, ordinal: 0, archived: false },
      { extension: first.id, ordinal: 1, archived: false },
      { extension: third.id, ordinal: 2, archived: false },
    ]);
    expect([await rowsOf(base.id), await rowsOf(unsubscribed.id)]).toEqual([[], []]);
    expect(await rowsOf(agreeing.id)).toEqual([{ extension: fourth.id, ordinal: 0, archived: false }]);
    // Every row it kept keeps its timestamps, and every ruleset its columns
    const kept = [...(await stampsOf())].filter(([key]) => stamps.has(key));
    expect(kept.map(([key]) => key).toSorted()).toEqual(
      [`${host.id} ${first.id}`, `${host.id} ${second.id}`, `${agreeing.id} ${fourth.id}`].toSorted(),
    );
    expect(kept).toEqual(kept.map(([key]) => [key, stamps.get(key)!]));
    expect(await rulesetRows()).toEqual(before);
    const { rows: schema } = await db.execute<{ name: string }>(sql`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = 'rules' AND table_name = 'rulesets' AND column_name = 'extension_ruleset_ids'
      UNION ALL SELECT indexname FROM pg_indexes WHERE indexname = 'ruleset_extensions_ruleset_id_ordinal_idx'
      UNION ALL SELECT conname FROM pg_constraint WHERE conname = 'ruleset_extensions_ordinal_check'
    `);
    expect(schema.map((row) => row.name).toSorted()).toEqual([
      "ruleset_extensions_ordinal_check",
      "ruleset_extensions_ruleset_id_ordinal_idx",
    ]);
    // What a ruleset's sources read of its extensions: its rows', in their order
    expect((await Rulesets.findSources(db, { id: host.id }))!.extensionIds).toEqual([second.id, first.id, third.id]);
  });

  test("refuses an array that names an extension twice, or a ruleset that doesn't exist, naming its ruleset", async () => {
    const extension = await createTestRuleset(null, { kind: "extension" });
    const [twice, missing] = [await createTestRuleset(null), await createTestRuleset(null)];
    await restoreArraysBefore0098([
      { id: twice.id, extensions: [extension.id, extension.id], rows: [] },
      { id: missing.id, extensions: [NIL_UUID], rows: [] },
    ]);

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0098_extensions-store.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({
      cause: {
        message: `Rulesets whose extensions differ from their rows: ${[twice.id, missing.id].toSorted().join(", ")}`,
      },
    });
  });
});

describe("0101_ruleset-parent", () => {
  test("drops the array of ancestors, a copy of each ruleset's parent, and changes no row", async () => {
    const base = await createTestRuleset(null);
    const fork = await createTestRuleset(null, { rulesetId: base.id });
    await restoreAncestorsBefore0101();
    const before = await rulesetRows();

    for (const statement of statementsOf("0101_ruleset-parent.sql")) await db.execute(sql.raw(statement));

    const { rows: schema } = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'rules' AND table_name = 'rulesets' AND column_name = 'ancestor_ruleset_ids'
    `);
    expect(schema).toEqual([]);
    expect(await rulesetRows()).toEqual(before);
    // A fork's parent is its key alone
    expect(await Rulesets.findSources(db, { id: fork.id })).toEqual({
      extensionIds: [],
      id: fork.id,
      parentId: base.id,
    });
  });

  test("refuses an array that isn't its ruleset's parent alone, naming its ruleset", async () => {
    const [base, other] = [await createTestRuleset(null), await createTestRuleset(null)];
    const [elsewhere, longer, agreeing] = [
      await createTestRuleset(null, { rulesetId: base.id }),
      await createTestRuleset(null, { rulesetId: base.id }),
      await createTestRuleset(null, { rulesetId: base.id }),
    ];
    // A fork's array of another ruleset, one of more than its parent, and a base's of any
    await restoreAncestorsBefore0101([
      { id: elsewhere.id, ancestors: [other.id] },
      { id: longer.id, ancestors: [base.id, other.id] },
      { id: other.id, ancestors: [base.id] },
      { id: agreeing.id, ancestors: [base.id] },
    ]);

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0101_ruleset-parent.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({
      cause: {
        message: `Rulesets whose ancestors differ from their parent: ${[elsewhere.id, longer.id, other.id].toSorted().join(", ")}`,
      },
    });
  });
});

describe("0102_activity-targets", () => {
  test("targets a level's and an inventory item's activities and notifications at their character, and nothing else", async () => {
    const { user } = await createTestUser();
    const characterId = crypto.randomUUID();
    const rows = [
      ["advancements", characterId, "addLevel"],
      ["inventory", characterId, "addItem"],
      ["characters", characterId, "updateCharacter"],
      ["rulesets", NIL_UUID, "updateRuleset"],
    ];
    for (const [targetType, targetId, type] of rows) {
      await db.execute(sql`INSERT INTO account.activities (user_id, target_id, target_type, type)
        VALUES (${user.id}, ${targetId}, ${targetType}, ${type})`);
      await db.execute(sql`INSERT INTO account.notifications (recipient_id, actor_id, target_id, target_type, type)
        VALUES (${user.id}, ${user.id}, ${targetId}, ${targetType}, ${type})`);
    }
    const targetsOf = async (table: "activities" | "notifications") => {
      const owner = table === "activities" ? sql`user_id` : sql`recipient_id`;
      const { rows: targets } = await db.execute<{ target: string }>(sql`
        SELECT type || ' ' || target_type || ' ' || target_id AS target FROM ${sql.raw(`account.${table}`)}
        WHERE ${owner} = ${user.id} ORDER BY type
      `);
      return targets.map((row) => row.target);
    };

    for (const statement of statementsOf("0102_activity-targets.sql")) await db.execute(sql.raw(statement));

    const expected = [
      `addItem characters ${characterId}`,
      `addLevel characters ${characterId}`,
      `updateCharacter characters ${characterId}`,
      `updateRuleset rulesets ${NIL_UUID}`,
    ];
    expect(await targetsOf("activities")).toEqual(expected);
    expect(await targetsOf("notifications")).toEqual(expected);
  });
});
