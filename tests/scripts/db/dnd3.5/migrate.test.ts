/** The migrations `migrate.ts` applies, each run on rows written as they stood before it, in the test's transaction. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";

/** A migration's statements, as drizzle splits them. */
function statementsOf(file: string) {
  return readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
}

/**
 * The registries' columns 0086 drops, as 0080 made them (their checks, the inheritance's key), each row's as the
 * modules declare it: what the migrations before 0086 ran on.
 */
async function addRegistryColumns() {
  const { fieldDefs, linkRoles } = Engine.storage().registries();
  await db.execute(sql`
      ALTER TABLE rules.link_roles ADD COLUMN merge text NOT NULL DEFAULT 'winner';
      ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_merge_check
        CHECK (merge IN ('winner', 'fallback', 'union'));
      ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_check CHECK (NOT single OR merge <> 'union');
      ALTER TABLE rules.field_defs ADD COLUMN merge text NOT NULL DEFAULT 'winner';
      ALTER TABLE rules.field_defs ADD COLUMN inherits_via text;
      ALTER TABLE rules.field_defs ADD COLUMN inherits_single boolean
        GENERATED ALWAYS AS (CASE WHEN inherits_via IS NOT NULL THEN true END) STORED;
      ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_inherits_via_entity_type_entity_type_inherits_s_fkey
        FOREIGN KEY (inherits_via, entity_type, entity_type, inherits_single)
        REFERENCES rules.link_roles(role, from_type, to_type, single);
      ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_check1 CHECK (multiple OR merge <> 'union');
      ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_check2
        CHECK (owner_kind = 'entity' OR inherits_via IS NULL);
      ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_merge_check
        CHECK (merge IN ('winner', 'fallback', 'union'));
    `);
  await db.execute(sql`
      UPDATE rules.link_roles r SET merge = d.merge
      FROM jsonb_to_recordset(${JSON.stringify(linkRoles)}::jsonb)
        AS d(role text, "fromType" text, "toType" text, merge text)
      WHERE r.role = d.role AND r.from_type = d."fromType" AND r.to_type = d."toType"
    `);
  await db.execute(sql`
      UPDATE rules.field_defs f SET merge = d.merge, inherits_via = d."inheritsVia"
      FROM jsonb_to_recordset(${JSON.stringify(fieldDefs)}::jsonb)
        AS d("ownerType" text, field text, merge text, "inheritsVia" text)
      WHERE f.owner_type = d."ownerType" AND f.field = d.field
    `);
}

/** The registries' columns 0086 keeps, each row as one line, and every character's last change: what it leaves. */
async function keptRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'field ' || owner_kind || ' ' || owner_type || ' ' || field || ' ' || value_kind || ' ' || multiple AS line
    FROM rules.field_defs
    UNION ALL SELECT 'role ' || role || ' ' || from_type || ' ' || to_type || ' ' || coalesce(via_type, '-') || ' '
      || single || ' ' || on_delete || ' ' || via_on_delete FROM rules.link_roles
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

describe("0081_spells-and-classes", () => {
  test("runs in the transaction of the rows before it, and renames what customizations and activities recorded", async () => {
    await addRegistryColumns();
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

describe("0082_fields", () => {
  test("names a spell's fields in what customizations, activities and notifications recorded, and nothing else", async () => {
    const { rows: spells } = await db.execute<{ id: string }>(
      sql`SELECT id FROM rules.entities WHERE type = 'spells' LIMIT 1`,
    );
    const spellId = spells[0]!.id;
    // What a customization recorded before it: a spell's field paths, and paths and words it leaves as they are
    const { rows: modifiers } = await db.execute<{ id: string }>(sql`
      INSERT INTO customization.modifiers (source_id, source_type, target, value, value_type, operator) VALUES
        (${spellId}, 'spells', 'spells.fireball.properties.SPELL_DESCRIPTOR', 'Fire', 'string', 'add'),
        (${spellId}, 'spells', 'spells.fireball.dc.wizard.misc', '{{ [spells.fireball.properties.SPELL_SCHOOL] }}', 'number', 'add'),
        (${spellId}, 'spells', 'spells.fireball.wizard.known', 'true', 'boolean', 'set'),
        (${spellId}, 'spells', 'abilities.spells.properties.SPELL_SCHOOL', 'properties.SPELL_SCHOOL', 'string', 'set')
      RETURNING id
    `);
    const { rows: requirements } = await db.execute<{ id: string }>(sql`
      INSERT INTO customization.requirements (entity_id, entity_type, level, target, value, value_type, operator) VALUES
        (${spellId}, 'spells', '9001', 'spells.magicmissile.properties.SPELL_COMPONENT', 'Verbal', 'string', 'contains'),
        (${spellId}, 'spells', '9002', 'spells.groups.evocation.*.dc.total', '15', 'number', 'greater_than')
      RETURNING id
    `);
    // What an activity and a notification recorded of each change to a property, and of others
    const recorded = [
      ["properties", "createProperty", '{"entityName":"Fireball","propertyType":"SPELL_SCHOOL","value":"Evocation"}'],
      ["properties", "updateProperty", '{"entityName":"Fireball", "propertyType" : "SPELL_RANGE_TYPE","value":"Long"}'],
      ["properties", "deleteProperty", '{"propertyType":"SPELL_COMPONENT","value":"Material"}'],
      ["modifiers", "createModifier", '{"target":"spells.fireball.properties.SPELL_DESCRIPTOR","value":"Fire"}'],
      ["spells", "updateSpell", '{"changedFields":[{"field":"properties","from":"a.properties.B","to":"B"}]}'],
    ];
    const activityIds: string[] = [];
    const notificationIds: string[] = [];
    for (const [table, type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_table, type, data)
        VALUES (${SEED_USER_ID}, ${spellId}, ${table}, ${type}, ${data}) RETURNING id
      `);
      activityIds.push(activity[0]!.id);
      const { rows: notification } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_table, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${spellId}, ${table}, ${data}) RETURNING id
      `);
      notificationIds.push(notification[0]!.id);
    }

    for (const statement of statementsOf("0082_fields.sql")) await db.execute(sql.raw(statement));

    const { rows: modifier } = await db.execute(sql`
      SELECT target, value FROM customization.modifiers WHERE id = ANY (${`{${modifiers.map(({ id }) => id).join(",")}}`}::uuid[])
      ORDER BY created_at, target
    `);
    expect(modifier).toEqual([
      { target: "abilities.spells.properties.SPELL_SCHOOL", value: "properties.SPELL_SCHOOL" },
      { target: "spells.fireball.dc.wizard.misc", value: "{{ [spells.fireball.fields.SPELL_SCHOOL] }}" },
      { target: "spells.fireball.fields.SPELL_DESCRIPTOR", value: "Fire" },
      { target: "spells.fireball.wizard.known", value: "true" },
    ]);
    const { rows: requirement } = await db.execute(sql`
      SELECT target FROM customization.requirements
      WHERE id = ANY (${`{${requirements.map(({ id }) => id).join(",")}}`}::uuid[]) ORDER BY level
    `);
    expect(requirement).toEqual([
      { target: "spells.magicmissile.fields.SPELL_COMPONENT" },
      { target: "spells.groups.evocation.*.dc.total" },
    ]);
    const expected = [
      ["entity_fields", "createField", '{"entityName":"Fireball","field":"SPELL_SCHOOL","value":"Evocation"}'],
      ["entity_fields", "updateField", '{"entityName":"Fireball", "field" : "SPELL_RANGE_TYPE","value":"Long"}'],
      ["entity_fields", "deleteField", '{"field":"SPELL_COMPONENT","value":"Material"}'],
      ["modifiers", "createModifier", '{"target":"spells.fireball.fields.SPELL_DESCRIPTOR","value":"Fire"}'],
      ["spells", "updateSpell", '{"changedFields":[{"field":"properties","from":"a.properties.B","to":"B"}]}'],
    ].map(([target_table, type, data]) => ({ target_table, type, data }));
    for (const [table, ids] of [
      ["account.activities", activityIds],
      ["account.notifications", notificationIds],
    ] as const) {
      const { rows } = await db.execute(sql`
        SELECT target_table, type, data::text AS data FROM ${sql.raw(table)}
        WHERE id = ANY (${`{${ids.join(",")}}`}::uuid[]) ORDER BY array_position(${`{${ids.join(",")}}`}::uuid[], id)
      `);
      expect({ table, rows }).toEqual({ table, rows: expected });
    }
  });
});

describe("0084_link-activities", () => {
  test("names a class's skill's role in what activities and notifications recorded, and nothing else", async () => {
    const classId = (await getSeedCtx()).klassMap.pc["Fighter"];
    // What an activity and a notification recorded of each change to a class's skills, and of others
    const recorded = [
      ["class_skills", "addClassSkill", '{"skillId":"s","entityName":"Fighter","skillName":"Climb"}'],
      ["class_skills", "removeClassSkill", '{"skillId":"s","entityName":"Fighter","skillName":"Climb"}'],
      ["classes", "updateClass", '{"entityName":"Fighter","changedFields":[]}'],
      ["class_level_feats", "addClassLevelFeat", '{"entityName":"class_skills"}'],
    ];
    const activityIds: string[] = [];
    const notificationIds: string[] = [];
    for (const [table, type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_table, type, data)
        VALUES (${SEED_USER_ID}, ${classId}, ${table}, ${type}, ${data}) RETURNING id
      `);
      activityIds.push(activity[0]!.id);
      const { rows: notification } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_table, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${classId}, ${table}, ${data}) RETURNING id
      `);
      notificationIds.push(notification[0]!.id);
    }

    for (const statement of statementsOf("0084_link-activities.sql")) await db.execute(sql.raw(statement));

    const expected = recorded
      .map(([table, type, data]) => [table === "class_skills" ? "classSkill" : table, type, data])
      .map(([target_table, type, data]) => ({ target_table, type, data }));
    for (const [table, ids] of [
      ["account.activities", activityIds],
      ["account.notifications", notificationIds],
    ] as const) {
      const { rows } = await db.execute(sql`
        SELECT target_table, type, data::text AS data FROM ${sql.raw(table)}
        WHERE id = ANY (${`{${ids.join(",")}}`}::uuid[]) ORDER BY array_position(${`{${ids.join(",")}}`}::uuid[], id)
      `);
      expect({ table, rows }).toEqual({ table, rows: expected });
    }
  });
});

describe("0085_advancement-activities", () => {
  test("names the advancements' table in what activities and notifications recorded of a level, and nothing else", async () => {
    const { id: characterId } = await findSeededCharacter("Bjorn Ironhand");
    // What an activity and a notification recorded of each change to a character's levels, and of others
    const recorded = [
      ["levels", "addLevel", '{"count":1}'],
      ["levels", "editLevel", null],
      ["levels", "removeLevel", null],
      ["characters", "updateCharacter", null],
      ["inventory", "addItem", '{"entityName":"levels"}'],
    ];
    const activityIds: string[] = [];
    const notificationIds: string[] = [];
    for (const [table, type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_table, type, data)
        VALUES (${SEED_USER_ID}, ${characterId}, ${table}, ${type}, ${data}) RETURNING id
      `);
      activityIds.push(activity[0]!.id);
      const { rows: notification } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_table, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${characterId}, ${table}, ${data})
        RETURNING id
      `);
      notificationIds.push(notification[0]!.id);
    }

    for (const statement of statementsOf("0085_advancement-activities.sql")) await db.execute(sql.raw(statement));

    const expected = recorded
      .map(([table, type, data]) => [table === "levels" ? "advancements" : table, type, data])
      .map(([target_table, type, data]) => ({ target_table, type, data }));
    for (const [table, ids] of [
      ["account.activities", activityIds],
      ["account.notifications", notificationIds],
    ] as const) {
      const { rows } = await db.execute(sql`
        SELECT target_table, type, data::text AS data FROM ${sql.raw(table)}
        WHERE id = ANY (${`{${ids.join(",")}}`}::uuid[]) ORDER BY array_position(${`{${ids.join(",")}}`}::uuid[], id)
      `);
      expect({ table, rows }).toEqual({ table, rows: expected });
    }
  });
});

describe("0086_registry-declarations", () => {
  test("drops the registries' merges and inheritance, as the modules declared them, and nothing else", async () => {
    await addRegistryColumns();
    const { rows: held } = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM rules.field_defs WHERE inherits_via IS NOT NULL AND merge = 'union'
    `);
    expect(held[0]!.n).toBeGreaterThan(0);
    const before = await keptRows();

    for (const statement of statementsOf("0086_registry-declarations.sql")) await db.execute(sql.raw(statement));

    const { rows: columns } = await db.execute<{ name: string }>(sql`
      SELECT table_name || '.' || column_name AS name FROM information_schema.columns
      WHERE table_schema = 'rules' AND table_name IN ('field_defs', 'link_roles')
        AND column_name IN ('merge', 'inherits_via', 'inherits_single')
    `);
    expect(columns).toEqual([]);
    expect(await keptRows()).toEqual(before);
  });
});
