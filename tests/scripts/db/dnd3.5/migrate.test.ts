/** The migrations `migrate.ts` applies, each run on rows written as they stood before it, in the test's transaction. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";

/** A migration's statements, as drizzle splits them. */
function statementsOf(file: string) {
  return readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
}

describe("0079_weapon-sets", () => {
  test("turns an entry's weapon set into a list of it, and an entry without one into none", async () => {
    // The inventory as it stood before: one set at most. 0080 since keeps an entry's sets as its groups and drops the
    // column 0079 made, so the old one is added back beside today's columns, which 0079 doesn't touch
    await db.execute(sql`ALTER TABLE character.inventory ADD COLUMN weapon_set smallint`);
    const { id: characterId } = await findSeededCharacter("Bjorn Ironhand");
    const { itemMap } = await getSeedCtx();
    await db.execute(sql`DELETE FROM character.inventory WHERE character_id = ${characterId}`);
    await db.execute(sql`
      INSERT INTO character.inventory (character_id, item_id, item_type, quantity, equipped, location, weapon_set) VALUES
        (${characterId}, ${itemMap["Longsword"]}, 'items', 1, true, 'Main Hand', 0),
        (${characterId}, ${itemMap["Heavy Steel Shield"]}, 'items', 1, true, 'Off Hand', 1),
        (${characterId}, ${itemMap["Bedroll"]}, 'items', 1, false, null, null)
    `);
    // Their deferred checks run now, as at a commit: a table with checks pending can't be altered
    await db.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);

    for (const statement of statementsOf("0079_weapon-sets.sql")) await db.execute(sql.raw(statement));

    const { rows } = await db.execute<{ location: string | null; weapon_sets: number[] }>(sql`
      SELECT location, weapon_sets FROM character.inventory WHERE character_id = ${characterId} ORDER BY location
    `);
    expect(rows).toEqual([
      { location: "Main Hand", weapon_sets: [0] },
      { location: "Off Hand", weapon_sets: [1] },
      { location: null, weapon_sets: [] },
    ]);
    // A new entry is in no set
    await db.execute(sql`
      INSERT INTO character.inventory (character_id, item_id, item_type, quantity)
      VALUES (${characterId}, ${itemMap["Bedroll"]}, 'items', 1)
    `);
    const { rows: added } = await db.execute<{ weapon_sets: number[] }>(sql`
      SELECT weapon_sets FROM character.inventory WHERE character_id = ${characterId} AND location IS NULL
    `);
    expect(added).toEqual([{ weapon_sets: [] }, { weapon_sets: [] }]);
  });
});

describe("0081_spells-and-classes", () => {
  test("runs in the transaction of the rows before it, and renames what customizations and activities recorded", async () => {
    const { id: characterId } = await findSeededCharacter("Bjorn Ironhand");
    // A row whose deferred checks are pending, as 0080's are when drizzle runs 0081 in the same transaction
    await db.execute(sql`
      INSERT INTO character.links (character_id, role, single, entity_id, entity_type)
      SELECT ${characterId}, 'speaks', false, e.id, 'languages' FROM rules.entities e
      WHERE e.type = 'languages'
        AND NOT EXISTS (SELECT 1 FROM character.links l WHERE l.character_id = ${characterId} AND l.entity_id = e.id)
      LIMIT 1
    `);
    // What a customization and an activity recorded before it, in the old words
    const { rows: spells } = await db.execute<{ id: string }>(
      sql`SELECT id FROM rules.entities WHERE type = 'spells' LIMIT 1`,
    );
    const spellId = spells[0]!.id;
    const { rows: modifiers } = await db.execute<{ id: string }>(sql`
      INSERT INTO customization.modifiers (source_id, source_type, target, value, value_type, operator) VALUES
        (${spellId}, 'spells', 'powers.wizard.known', '{{ [ powers.wizard.known] * 2 }}', 'number', 'add'),
        (${spellId}, 'spells', 'powers.cleric.known', '{{ max(0, powers.cleric.known) + [abilities.powers.x] }}', 'number', 'add')
      RETURNING id
    `);
    const { rows: activities } = await db.execute<{ id: string }>(sql`
      INSERT INTO account.activities (user_id, target_id, target_table, type, data)
      VALUES (${SEED_USER_ID}, ${spellId}, 'klass_level_powers', 'addKlassLevelPower',
        '{"entityType":"powers","propertyType":"KLASS_HD","target":"powers.wizard.known","value":"[ powers.cleric.known ]"}')
      RETURNING id
    `);

    for (const statement of statementsOf("0081_spells-and-classes.sql")) await db.execute(sql.raw(statement));

    const { rows: modifier } = await db.execute(sql`
      SELECT target, value FROM customization.modifiers WHERE id IN (${modifiers[0]!.id}, ${modifiers[1]!.id}) ORDER BY target DESC
    `);
    expect(modifier).toEqual([
      { target: "spells.wizard.known", value: "{{ [ spells.wizard.known] * 2 }}" },
      { target: "spells.cleric.known", value: "{{ max(0, spells.cleric.known) + [abilities.powers.x] }}" },
    ]);
    const { rows: activity } = await db.execute(
      sql`SELECT target_table, type, data::text AS data FROM account.activities WHERE id = ${activities[0]!.id}`,
    );
    expect(activity).toEqual([
      {
        target_table: "class_level_spells",
        type: "addClassLevelSpell",
        data: '{"entityType":"spells","propertyType":"CLASS_HD","target":"spells.wizard.known","value":"[ spells.cleric.known ]"}',
      },
    ]);
  });
});
