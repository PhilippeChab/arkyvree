/** The migrations `migrate.ts` applies, each run on rows written as they stood before it, in the test's transaction. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Players } from "@/server/repositories/index.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A migration's statements, as drizzle splits them. */
function statementsOf(file: string) {
  return readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
}

/**
 * An entity's campaign, as 0080 made it and 0097 drops it, none of them written: its column and its key, the foreign
 * key to its campaign and its index, the owner's foreign key and the name's keys by it, and the ruleset's index with it.
 * What the migrations before 0097 ran on.
 */
async function addEntityCampaigns() {
  await db.execute(sql`
    ALTER TABLE rules.entities ADD COLUMN campaign_id uuid
      CONSTRAINT entities_campaign_id_fkey REFERENCES campaign.campaigns(id) ON DELETE CASCADE;
    ALTER TABLE rules.entities ADD COLUMN campaign_key uuid
      GENERATED ALWAYS AS (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000')) STORED;
    ALTER TABLE rules.entities DROP CONSTRAINT entities_owner_id_ruleset_id_fkey;
    ALTER TABLE rules.entities DROP CONSTRAINT entities_id_ruleset_id_key;
    ALTER TABLE rules.entities ADD CONSTRAINT entities_id_ruleset_id_campaign_key_key UNIQUE (id, ruleset_id, campaign_key);
    ALTER TABLE rules.entities ADD CONSTRAINT entities_owner_id_ruleset_id_campaign_key_fkey
      FOREIGN KEY (owner_id, ruleset_id, campaign_key) REFERENCES rules.entities(id, ruleset_id, campaign_key)
      ON DELETE CASCADE;
    DROP INDEX rules.entities_name_unique_idx;
    CREATE UNIQUE INDEX entities_without_campaign_unique_idx ON rules.entities (ruleset_id, type, partition, name)
      WHERE campaign_id IS NULL AND name IS NOT NULL;
    CREATE UNIQUE INDEX entities_with_campaign_unique_idx ON rules.entities
      (ruleset_id, campaign_id, type, partition, name) WHERE campaign_id IS NOT NULL AND name IS NOT NULL;
    DROP INDEX rules.entities_ruleset_type_idx;
    CREATE INDEX entities_ruleset_type_campaign_idx ON rules.entities (ruleset_id, type, campaign_id);
    CREATE INDEX entities_campaign_idx ON rules.entities (campaign_id) WHERE campaign_id IS NOT NULL;
  `);
}

/**
 * The columns of a pick 0093 drops, as 0080 made them, none of them written: its tier, and its parent pick, with the
 * parent's foreign key and its partial index. What the migrations before 0093 ran on.
 */
async function addPickColumns() {
  await db.execute(sql`
    ALTER TABLE character.advancement_picks ADD COLUMN tier integer;
    ALTER TABLE character.advancement_picks
      ADD COLUMN parent_pick_id uuid REFERENCES character.advancement_picks(id) ON DELETE CASCADE;
    CREATE INDEX advancement_picks_parent_idx ON character.advancement_picks (parent_pick_id)
      WHERE parent_pick_id IS NOT NULL;
  `);
}

/**
 * The registries' columns 0086 drops, as 0080 made them (their checks, the inheritance's key), each row's as the
 * modules declare it (a field's merge and the role it's read off another through, its declaration's): what the
 * migrations before 0086 ran on.
 */
async function addRegistryColumns() {
  const storage = Engine.storage();
  const { linkRoles } = storage.registries();
  const declared = storage.declaredFields();
  const fieldDefs = storage.registries().fieldDefs.map(({ field, ownerType }) => {
    const inheritance = declared.inheritance(ownerType);
    return {
      field,
      inheritsVia: inheritance?.fields.has(field) ? inheritance.role : null,
      merge: declared.mergeOf(ownerType, field),
      ownerType,
    };
  });
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

/**
 * The columns 0088 drops, as the migrations before made them, none of them written: the archive columns of rulesets,
 * entities, advancements, inventory entries, a character's and a ruleset's contributors, campaign seats, modifiers,
 * requirements and activities (and the indexes that left an archived row out), and a character's links' ordinal, in their unique
 * key. What the migrations before 0088 ran on.
 */
async function addUnwrittenColumns() {
  await db.execute(sql`
    ALTER TABLE rules.entities ADD COLUMN deleted_at timestamptz;
    ALTER TABLE character.advancements ADD COLUMN deleted_at timestamptz;
    ALTER TABLE character.inventory ADD COLUMN deleted_at timestamptz;
    ALTER TABLE customization.modifiers ADD COLUMN deleted_at timestamptz;
    ALTER TABLE customization.requirements ADD COLUMN deleted_at timestamptz;
    CREATE INDEX requirements_entity_id_entity_type_idx ON customization.requirements (entity_id, entity_type)
      WHERE deleted_at IS NULL;
    ALTER TABLE campaign.player_characters ADD COLUMN deleted_at timestamptz;
    DROP INDEX campaign.player_characters_character_id_active_idx;
    CREATE UNIQUE INDEX player_characters_character_id_active_idx ON campaign.player_characters (character_id)
      WHERE deleted_at IS NULL;
    CREATE INDEX player_characters_character_id_idx ON campaign.player_characters (character_id) WHERE deleted_at IS NULL;
    CREATE INDEX player_characters_player_id_idx ON campaign.player_characters (player_id) WHERE deleted_at IS NULL;
    ALTER TABLE character.character_contributors ADD COLUMN deleted_at timestamptz;
    DROP INDEX character.character_contributors_character_user_unique;
    DROP INDEX character.character_contributors_character_email_unique;
    CREATE UNIQUE INDEX character_contributors_character_user_unique ON character.character_contributors
      (character_id, user_id) WHERE status IN ('Pending', 'Active') AND deleted_at IS NULL;
    CREATE UNIQUE INDEX character_contributors_character_email_unique ON character.character_contributors
      (character_id, email) WHERE user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL;
    ALTER TABLE rules.contributors ADD COLUMN deleted_at timestamptz;
    DROP INDEX rules.contributors_ruleset_user_unique;
    DROP INDEX rules.contributors_ruleset_email_unique;
    CREATE UNIQUE INDEX contributors_ruleset_user_unique ON rules.contributors
      (ruleset_id, user_id) WHERE status IN ('Pending', 'Active') AND deleted_at IS NULL;
    CREATE UNIQUE INDEX contributors_ruleset_email_unique ON rules.contributors
      (ruleset_id, email) WHERE user_id IS NULL AND status IN ('Pending', 'Active') AND deleted_at IS NULL;
    ALTER TABLE rules.rulesets ADD COLUMN deleted_at timestamptz;
    DROP INDEX rules.rulesets_user_id_status_idx;
    DROP INDEX rules.rulesets_status_idx;
    CREATE INDEX rulesets_user_id_status_idx ON rules.rulesets (user_id, status) WHERE deleted_at IS NULL;
    CREATE INDEX rulesets_status_idx ON rules.rulesets (status) WHERE deleted_at IS NULL;
    ALTER TABLE account.activities ADD COLUMN deleted_at timestamptz;
    DROP INDEX account.activities_user_id_created_at_idx;
    CREATE INDEX activities_user_id_created_at_idx ON account.activities (user_id, created_at DESC)
      WHERE deleted_at IS NULL;
    DROP INDEX character.advancements_character_position_idx;
    CREATE UNIQUE INDEX advancements_character_position_idx ON character.advancements (character_id, position)
      WHERE deleted_at IS NULL;
    ALTER TABLE character.links ADD COLUMN ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0);
    ALTER TABLE character.links DROP CONSTRAINT links_character_id_role_entity_id_key;
    ALTER TABLE character.links ADD CONSTRAINT links_character_id_role_entity_id_ordinal_key
      UNIQUE (character_id, role, entity_id, ordinal);
  `);
}

/** Archives a user, a campaign or a seat `offset` (an interval) from when 0096's test archives its campaigns. */
async function archiveAt(
  table: "account.users" | "campaign.campaigns" | "campaign.players",
  id: string,
  offset: string,
) {
  await db.execute(sql`
    UPDATE ${sql.raw(table)} SET deleted_at = '2026-01-01T00:00:00Z'::timestamptz + ${offset}::interval WHERE id = ${id}
  `);
}

/**
 * A table's columns, indexes and constraints, each as one line (its name, and its definition as the database gives
 * it), in order: what 0095 renames of an advancement's, what 0097 drops and keys of an entity's, and what 0099 drops
 * and keys of a snapshot's.
 */
async function definitionsOf(schema: "character" | "rules", table: "advancements" | "entities" | "entity_snapshots") {
  const qualified = `${schema}.${table}`;
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'column ' || attnum || ' ' || attname || ' ' || format_type(atttypid, atttypmod) AS line FROM pg_attribute
    WHERE attrelid = ${qualified}::regclass AND attnum > 0 AND NOT attisdropped
    UNION ALL SELECT 'index ' || indexname || ' ' || indexdef FROM pg_indexes
    WHERE schemaname = ${schema} AND tablename = ${table}
    UNION ALL SELECT 'constraint ' || conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = ${qualified}::regclass
  `);
  return rows.map((row) => row.line).toSorted();
}

/**
 * Every entity, each as one line (every column 0097 keeps), and every character's last change: what 0097 leaves.
 */
async function entityRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'entity ' || concat_ws(' ', id, ruleset_id, type, name, description, owner_id, owner_type, owned, position,
      partition, created_at::text, updated_at::text) AS line
    FROM rules.entities
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * Every field row 0090 reads (an entity's, a ruleset's, a character's), each as one line (its owner, its field, its
 * ordinal and its text, quoted), and every character's last change: what it leaves.
 */
async function fieldRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'entity ' || entity_id || ' ' || field || ' ' || ordinal || ' ' || coalesce(quote_literal(text_value), '-')
      AS line FROM rules.entity_fields
    UNION ALL SELECT 'ruleset ' || ruleset_id || ' ' || field || ' ' || ordinal || ' '
      || coalesce(quote_literal(text_value), '-') FROM rules.ruleset_fields
    UNION ALL SELECT 'character ' || character_id || ' ' || field || ' ' || ordinal || ' '
      || coalesce(quote_literal(text_value), '-') FROM "character".fields
    UNION ALL SELECT 'changed ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * The ids of a character's rows that 0088's deletes reach (`characterId`, and its children): the characters, their
 * advancements and their picks, their inventory entries, links, fields and contributors.
 */
async function findCharacterRows(characterId: string) {
  const { rows } = await db.execute<{ id: string }>(sql`
    WITH held AS (SELECT id FROM character.characters WHERE id = ${characterId} OR parent_character_id = ${characterId})
    SELECT id::text FROM held
    UNION ALL SELECT a.id::text FROM character.advancements a WHERE a.character_id IN (SELECT id FROM held)
    UNION ALL SELECT p.id::text FROM character.advancement_picks p
      JOIN character.advancements a ON a.id = p.advancement_id WHERE a.character_id IN (SELECT id FROM held)
    UNION ALL SELECT i.id::text FROM character.inventory i WHERE i.character_id IN (SELECT id FROM held)
    UNION ALL SELECT l.id::text FROM character.links l WHERE l.character_id IN (SELECT id FROM held)
    UNION ALL SELECT f.character_id || ':' || f.field FROM character.fields f WHERE f.character_id IN (SELECT id FROM held)
    UNION ALL SELECT k.id::text FROM character.character_contributors k WHERE k.character_id IN (SELECT id FROM held)
    ORDER BY 1
  `);
  return rows.map(({ id }) => id);
}

/** A seeded character that holds levels with picks, inventory, links and fields: its id. */
async function findHeldCharacter() {
  const { rows } = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM character.characters c
    WHERE c.parent_character_id IS NULL
      AND EXISTS (SELECT 1 FROM character.advancements a
        JOIN character.advancement_picks p ON p.advancement_id = a.id WHERE a.character_id = c.id)
      AND EXISTS (SELECT 1 FROM character.inventory i WHERE i.character_id = c.id)
      AND EXISTS (SELECT 1 FROM character.links l WHERE l.character_id = c.id)
      AND EXISTS (SELECT 1 FROM character.fields f WHERE f.character_id = c.id)
    ORDER BY c.id LIMIT 1
  `);
  return rows[0]!.id;
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

/**
 * Every pick, each as one line (every column 0093 keeps), and every character's last change: what 0093 leaves.
 */
async function pickRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'pick ' || concat_ws(' ', id, advancement_id, step, entity_id, entity_type, via_id, via_type, amount, ordinal,
      repeats, created_at::text, updated_at::text) AS line
    FROM character.advancement_picks
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * Every requirement, each as one line (its owner, its level, and its condition or its group), and every character's
 * last change: what 0100 leaves.
 */
async function requirementRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'requirement ' || concat_ws(' ', id, entity_id, entity_type, level, target, operator, value, value_type,
      chaining_operator, created_at::text, updated_at::text) AS line
    FROM customization.requirements
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * The indexes 0089 drops, rebuilds or creates, as the migrations before left them: the btrees another index covers (a
 * user's starred rulesets, a ruleset's snapshots, a record's attachments), the archived tables' indexes by a foreign
 * key, which left an archived row out, and none on the foreign keys whose deletes no index served, with a snapshot's
 * type 0099 drops after it (`restoreSnapshotTypesBefore0099`). What the migrations before 0089 ran on.
 */
async function restoreIndexesBefore0089() {
  await restoreSnapshotTypesBefore0099();
  await db.execute(sql`
    CREATE INDEX starred_rulesets_user_id ON account.starred_rulesets (user_id);
    CREATE INDEX entity_snapshots_ruleset_id_entity_type ON rules.entity_snapshots (ruleset_id, entity_type);
    CREATE INDEX entity_snapshots_ruleset_type_source ON rules.entity_snapshots
      (ruleset_id, entity_type, source_entity_id);
    CREATE INDEX attachments_record_idx ON storage.attachments (record_type, record_id);
    DROP INDEX character.characters_user_id_idx;
    CREATE INDEX characters_user_id_idx ON character.characters (user_id) WHERE deleted_at IS NULL;
    DROP INDEX character.characters_ruleset_id_idx;
    CREATE INDEX characters_ruleset_id_idx ON character.characters (ruleset_id) WHERE deleted_at IS NULL;
    DROP INDEX campaign.players_campaign_id_idx;
    CREATE INDEX players_campaign_id_idx ON campaign.players (campaign_id) WHERE deleted_at IS NULL;
    DROP INDEX campaign.players_user_id_campaign_id_idx;
    CREATE INDEX players_user_id_campaign_id_idx ON campaign.players (user_id, campaign_id) WHERE deleted_at IS NULL;
    DROP INDEX campaign.invites_player_id_idx;
    CREATE INDEX invites_player_id_idx ON campaign.invites (player_id) WHERE deleted_at IS NULL;
    DROP INDEX campaign.invites_user_id_status_idx;
    CREATE INDEX invites_user_id_status_idx ON campaign.invites (user_id, status) WHERE deleted_at IS NULL;
    DROP INDEX account.starred_rulesets_ruleset_id_idx;
    DROP INDEX account.notifications_actor_id_idx;
    DROP INDEX character.character_contributors_invited_by_idx;
    DROP INDEX rules.contributors_invited_by_idx;
    DROP INDEX rules.rulesets_ruleset_id_idx;
    DROP INDEX rules.ruleset_extensions_extension_id_idx;
    DROP INDEX rules.entity_snapshots_source_entity_id_idx;
  `);
}

/**
 * A snapshot's type, as the migrations before 0099 left it: its column, each row's its copy's, or its source's when its
 * copy is gone (a tombstone), and the key by its ruleset, its type and its source in place of the one without its type.
 * What the migrations before 0099 ran on.
 */
async function restoreSnapshotTypesBefore0099() {
  await db.execute(sql`
    ALTER TABLE rules.entity_snapshots ADD COLUMN entity_type text;
    UPDATE rules.entity_snapshots AS s SET entity_type = coalesce(
      (SELECT type FROM rules.entities WHERE id = s.forked_entity_id),
      (SELECT type FROM rules.entities WHERE id = s.source_entity_id)
    );
    ALTER TABLE rules.entity_snapshots ALTER COLUMN entity_type SET NOT NULL;
    ALTER TABLE rules.entity_snapshots DROP CONSTRAINT entity_snapshots_ruleset_id_source_entity_id_key;
    ALTER TABLE rules.entity_snapshots ADD CONSTRAINT entity_snapshots_ruleset_type_source_unique
      UNIQUE (ruleset_id, entity_type, source_entity_id);
  `);
}

/**
 * The names 0095 gives an advancement's entry, as the migrations before left them: its statements run backwards, each
 * `entry` name back to its `track` one (`entry_id` to `track_id`, and its indexes' and foreign key's), the registry
 * sync off again. What the migrations before 0095 ran on.
 */
async function restoreTracksBefore0095() {
  const swapped = new Map([
    ["entry_", "track_"],
    ["_entry", "_track"],
    ["track_", "entry_"],
    ["_track", "_entry"],
  ]);
  for (const statement of statementsOf("0095_advancement-entry.sql")) {
    const backwards = statement.replace(/entry_|_entry|track_|_track/g, (word) => swapped.get(word)!);
    await db.execute(sql.raw(backwards));
  }
  await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'off', true)`);
}

/**
 * The rows and columns 0092 renames, as the migrations before left them: its statements run backwards, each type back to
 * its old spelling (`class-levels` to `class_levels`) and `target_type` back to `target_table`, its registry sync off
 * again (the seeded database records no activity, whose targets a test writes as they were), and what 0095 and 0099
 * change after it back too (`restoreTracksBefore0095`, `restoreSnapshotTypesBefore0099`). What the migrations before
 * 0092 ran on.
 */
async function restoreTypesBefore0092() {
  await restoreSnapshotTypesBefore0099();
  await restoreTracksBefore0095();
  const swapped = new Map([
    ["class-levels", "class_levels"],
    ["class_levels", "class-levels"],
    ["target_table", "target_type"],
    ["target_type", "target_table"],
  ]);
  for (const statement of statementsOf("0092_stored-type-forms.sql")) {
    const backwards = statement.replace(/class-levels|class_levels|target_t(?:abl|yp)e/g, (word) => swapped.get(word)!);
    await db.execute(sql.raw(backwards));
  }
  await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'off', true)`);
}

/**
 * Every campaign and every seat, each as one line, its archive last (`-` when it's live): what 0096 restores a seat's
 * archive in, and leaves otherwise.
 */
async function seatRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'campaign ' || id || ' ' || updated_at::text || ' ' || coalesce(to_json(deleted_at)::text, '-') AS line
    FROM campaign.campaigns
    UNION ALL SELECT 'seat ' || id || ' ' || campaign_id || ' ' || coalesce(user_id::text, '-') || ' ' || role || ' '
      || updated_at::text || ' ' || coalesce(to_json(deleted_at)::text, '-') FROM campaign.players
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * Every snapshot, each as one line (every column 0099 keeps), and every character's last change: what 0099 leaves.
 */
async function snapshotRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'snapshot ' || concat_ws(' ', id, ruleset_id, source_entity_id, forked_entity_id, created_at::text) AS line
    FROM rules.entity_snapshots
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

/**
 * Every row of the tables 0092 reads, each table's as one digest of its rows' text, sorted (`renamed`: as 0092 would
 * leave them, each `class_levels` read as `class-levels`).
 */
async function typedRows(renamed: boolean) {
  const { rows: tables } = await db.execute<{ name: string }>(sql`
    SELECT table_schema || '.' || table_name AS name FROM information_schema.tables
    WHERE table_schema IN ('account', 'campaign', 'character', 'customization', 'rules', 'storage')
      AND table_type = 'BASE TABLE'
    ORDER BY name
  `);
  const digests: Record<string, string> = {};
  for (const { name } of tables) {
    const row = renamed ? sql`replace(t::text, 'class_levels', 'class-levels')` : sql`t::text`;
    const { rows } = await db.execute<{ digest: string }>(sql`
      SELECT count(*) || ' ' || coalesce(md5(string_agg(${row}, E'\n' ORDER BY ${row})), '-') AS digest
      FROM ${sql.raw(name)} t
    `);
    digests[name] = rows[0]!.digest;
  }
  return digests;
}

/**
 * The rows of the tables 0088 drops a column of, each as one line (every entity, advancement, pick, inventory entry,
 * contributor, campaign seat, modifier, requirement, activity, ruleset and character link, as its other columns hold it), and
 * every character's last change: what it leaves.
 */
async function unwrittenRows() {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT 'entity ' || id || ' ' || type || ' ' || coalesce(name, '-') || ' ' || updated_at::text AS line
    FROM rules.entities
    UNION ALL SELECT 'advancement ' || id || ' ' || character_id || ' ' || position || ' ' || updated_at::text
    FROM character.advancements
    UNION ALL SELECT 'pick ' || id || ' ' || advancement_id || ' ' || step FROM character.advancement_picks
    UNION ALL SELECT 'entry ' || id || ' ' || character_id || ' ' || item_id || ' ' || quantity FROM character.inventory
    UNION ALL SELECT 'contributor ' || id || ' ' || character_id || ' ' || email || ' ' || status
    FROM character.character_contributors
    UNION ALL SELECT 'seat ' || player_id || ' ' || character_id || ' ' || visibility FROM campaign.player_characters
    UNION ALL SELECT 'modifier ' || id || ' ' || source_id || ' ' || target || ' ' || value FROM customization.modifiers
    UNION ALL SELECT 'requirement ' || id || ' ' || entity_id || ' ' || level FROM customization.requirements
    UNION ALL SELECT 'rulesetContributor ' || id || ' ' || ruleset_id || ' ' || email || ' ' || status
    FROM rules.contributors
    UNION ALL SELECT 'activity ' || id || ' ' || user_id || ' ' || type FROM account.activities
    UNION ALL SELECT 'ruleset ' || id || ' ' || name || ' ' || status || ' ' || updated_at::text FROM rules.rulesets
    UNION ALL SELECT 'link ' || id || ' ' || character_id || ' ' || role || ' ' || entity_id || ' '
      || coalesce(amount::text, '-') FROM character.links
    UNION ALL SELECT 'character ' || id || ' ' || last_changed_at::text FROM character.characters
    ORDER BY line
  `);
  return rows.map((row) => row.line);
}

describe("0081_spells-and-classes", () => {
  test("runs in the transaction of the rows before it, and renames what customizations and activities recorded", async () => {
    await restoreTypesBefore0092();
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
  }, 30_000);
});

describe("0082_fields", () => {
  test("names a spell's fields in what customizations, activities and notifications recorded, and nothing else", async () => {
    await restoreTypesBefore0092();
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
  }, 30_000);
});

describe("0084_link-activities", () => {
  test("names a class's skill's role in what activities and notifications recorded, and nothing else", async () => {
    await restoreTypesBefore0092();
    const classId = (await getSeedCtx()).classMap.pc["Fighter"];
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
  }, 30_000);
});

describe("0085_advancement-activities", () => {
  test("names the advancements' table in what activities and notifications recorded of a level, and nothing else", async () => {
    await restoreTypesBefore0092();
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
  }, 30_000);
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

describe("0087_player-kind", () => {
  test("leaves a character's kind to its module's create, and changes no character", async () => {
    await db.execute(sql`ALTER TABLE character.characters ALTER COLUMN kind SET DEFAULT 'pc'`);
    const before = await keptRows();

    for (const statement of statementsOf("0087_player-kind.sql")) await db.execute(sql.raw(statement));

    const { rows: columns } = await db.execute<{ fallback: string | null }>(sql`
      SELECT column_default AS fallback FROM information_schema.columns
      WHERE table_schema = 'character' AND table_name = 'characters' AND column_name = 'kind'
    `);
    expect(columns).toEqual([{ fallback: null }]);
    expect(await keptRows()).toEqual(before);
    const { rulesetId } = await getSeedCtx();
    const refused = await db
      .transaction(
        async (tx) =>
          await tx.execute(sql`
            INSERT INTO character.characters (user_id, ruleset_id, name)
            VALUES (${SEED_USER_ID}, ${rulesetId}, 'Kindless')
          `),
      )
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ cause: { code: "23502", column: "kind" } });
  });
});

describe("0088_unwritten-columns", () => {
  test("drops the archive columns nothing set and the links' ordinal, keys what they keyed without them, and changes no row", async () => {
    await addUnwrittenColumns();
    const before = await unwrittenRows();

    for (const statement of statementsOf("0088_unwritten-columns.sql")) await db.execute(sql.raw(statement));

    const { rows: columns } = await db.execute<{ name: string }>(sql`
      SELECT table_schema || '.' || table_name || '.' || column_name AS name FROM information_schema.columns
      WHERE (table_schema, table_name, column_name) IN
        (('rules', 'entities', 'deleted_at'), ('character', 'advancements', 'deleted_at'),
         ('character', 'inventory', 'deleted_at'), ('character', 'character_contributors', 'deleted_at'),
         ('campaign', 'player_characters', 'deleted_at'), ('customization', 'modifiers', 'deleted_at'),
         ('customization', 'requirements', 'deleted_at'), ('rules', 'contributors', 'deleted_at'),
         ('account', 'activities', 'deleted_at'), ('rules', 'rulesets', 'deleted_at'), ('character', 'links', 'ordinal'))
    `);
    expect(columns).toEqual([]);
    const { rows: keys } = await db.execute<{ key: string }>(sql`
      SELECT indexdef AS key FROM pg_indexes
      WHERE indexname IN ('advancements_character_position_idx', 'player_characters_character_id_active_idx',
        'character_contributors_character_user_unique', 'character_contributors_character_email_unique',
        'player_characters_character_id_idx', 'player_characters_player_id_idx', 'requirements_entity_id_entity_type_idx',
        'contributors_ruleset_user_unique', 'contributors_ruleset_email_unique', 'activities_user_id_created_at_idx',
        'rulesets_user_id_status_idx', 'rulesets_status_idx')
      UNION ALL SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'character.links'::regclass AND contype = 'u'
    `);
    // In code-point order, which no database collation varies
    expect(keys.map(({ key }) => key).toSorted()).toEqual([
      "CREATE INDEX activities_user_id_created_at_idx ON account.activities USING btree (user_id, created_at DESC)",
      "CREATE INDEX rulesets_status_idx ON rules.rulesets USING btree (status)",
      "CREATE INDEX rulesets_user_id_status_idx ON rules.rulesets USING btree (user_id, status)",
      'CREATE UNIQUE INDEX advancements_character_position_idx ON "character".advancements USING btree (character_id, "position")',
      "CREATE UNIQUE INDEX character_contributors_character_email_unique ON \"character\".character_contributors USING btree (character_id, email) WHERE ((user_id IS NULL) AND (status = ANY (ARRAY['Pending'::text, 'Active'::text])))",
      "CREATE UNIQUE INDEX character_contributors_character_user_unique ON \"character\".character_contributors USING btree (character_id, user_id) WHERE (status = ANY (ARRAY['Pending'::text, 'Active'::text]))",
      "CREATE UNIQUE INDEX contributors_ruleset_email_unique ON rules.contributors USING btree (ruleset_id, email) WHERE ((user_id IS NULL) AND (status = ANY (ARRAY['Pending'::text, 'Active'::text])))",
      "CREATE UNIQUE INDEX contributors_ruleset_user_unique ON rules.contributors USING btree (ruleset_id, user_id) WHERE (status = ANY (ARRAY['Pending'::text, 'Active'::text]))",
      "CREATE UNIQUE INDEX player_characters_character_id_active_idx ON campaign.player_characters USING btree (character_id)",
      "links_character_id_role_entity_id_key UNIQUE (character_id, role, entity_id)",
    ]);
    expect(await unwrittenRows()).toEqual(before);
  });

  test("deletes a character the archive before 0080 archived with its advancements and what goes with it, and stray archived rows", async () => {
    await restoreTypesBefore0092();
    await addUnwrittenColumns();
    const archived = await findHeldCharacter();
    await db.execute(sql`UPDATE character.characters SET deleted_at = now() WHERE id = ${archived}`);
    const held = await findCharacterRows(archived);
    // A live character's stray archived campaign seat and contributor, which every reader left out
    const { rows: others } = await db.execute<{ id: string }>(sql`
      SELECT id FROM character.characters WHERE id <> ${archived} AND parent_character_id IS NULL ORDER BY id LIMIT 1
    `);
    const { player } = await createTestCampaign(SEED_USER_ID);
    await db.execute(sql`
      INSERT INTO campaign.player_characters (player_id, character_id, deleted_at) VALUES (${player.id}, ${others[0]!.id}, now())
    `);
    const { rows: contributors } = await db.execute<{ id: string }>(sql`
      INSERT INTO character.character_contributors (character_id, email, invited_by, status, deleted_at)
      VALUES (${others[0]!.id}, 'stray@example.com', ${SEED_USER_ID}, 'Revoked', now()) RETURNING id
    `);
    const { rows: strays } = await db.execute<{ id: string }>(sql`
      WITH ruleset_contributor AS (
        INSERT INTO rules.contributors (ruleset_id, email, invited_by, status, deleted_at)
        SELECT id, 'stray@example.com', ${SEED_USER_ID}, 'Revoked', now() FROM rules.rulesets ORDER BY id LIMIT 1
        RETURNING id
      ), activity AS (
        INSERT INTO account.activities (user_id, type, target_id, target_table, deleted_at)
        VALUES (${SEED_USER_ID}, 'createItem', ${others[0]!.id}, 'items', now()) RETURNING id
      )
      SELECT id FROM ruleset_contributor UNION ALL SELECT id FROM activity
    `);
    const before = await unwrittenRows();
    await db.execute(sql`UPDATE character.advancements SET deleted_at = now() WHERE character_id = ${archived}`);
    await db.execute(sql`UPDATE character.inventory SET deleted_at = now() WHERE character_id = ${archived}`);

    for (const statement of statementsOf("0088_unwritten-columns.sql")) await db.execute(sql.raw(statement));

    // The character and every row of it, its levels' picks among them, are gone, and so are the live character's stray
    // archived rows; every other row stays as it was
    expect(await findCharacterRows(archived)).toEqual([]);
    expect(held.length).toBeGreaterThan(5);
    const gone = new Set([...held, player.id, contributors[0]!.id, ...strays.map(({ id }) => id)]);
    expect(
      before.filter(
        (line) =>
          line.startsWith(`seat ${player.id}`) || [contributors[0]!, ...strays].some(({ id }) => line.includes(id)),
      ),
    ).toHaveLength(4);
    expect(await unwrittenRows()).toEqual(before.filter((line) => !gone.has(line.split(" ")[1]!)));
  }, 30_000);

  test("leaves a character archived since 0080, its advancements live, as it is", async () => {
    await addUnwrittenColumns();
    const archived = await findHeldCharacter();
    await db.execute(sql`UPDATE character.characters SET deleted_at = now() WHERE id = ${archived}`);
    const held = await findCharacterRows(archived);
    const before = await unwrittenRows();

    for (const statement of statementsOf("0088_unwritten-columns.sql")) await db.execute(sql.raw(statement));

    expect(await findCharacterRows(archived)).toEqual(held);
    expect(await unwrittenRows()).toEqual(before);
    const { rows } = await db.execute<{ archived: boolean }>(sql`
      SELECT deleted_at IS NOT NULL AS archived FROM character.characters WHERE id = ${archived}
    `);
    expect(rows).toEqual([{ archived: true }]);
  });

  test("refuses an archived ruleset, entity, modifier or requirement, which rulesets and characters may hold", async () => {
    await addUnwrittenColumns();
    await db.execute(
      sql`UPDATE rules.entities SET deleted_at = now() WHERE id = (SELECT id FROM rules.entities LIMIT 1)`,
    );
    await db.execute(
      sql`UPDATE customization.modifiers SET deleted_at = now() WHERE id = (SELECT id FROM customization.modifiers LIMIT 1)`,
    );
    await db.execute(
      sql`UPDATE rules.rulesets SET deleted_at = now() WHERE id = (SELECT id FROM rules.rulesets LIMIT 1)`,
    );

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0088_unwritten-columns.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({
      cause: {
        message:
          "Archived rows, which rulesets and characters may hold: rules.entities, customization.modifiers, rules.rulesets",
      },
    });
  });
});

describe("0089_index-declarations", () => {
  test("drops the indexes others cover, keys the archived tables' foreign keys over every row, indexes the unserved ones, and changes no row", async () => {
    await restoreIndexesBefore0089();
    const before = await keptRows();

    for (const statement of statementsOf("0089_index-declarations.sql")) await db.execute(sql.raw(statement));

    const { rows: indexes } = await db.execute<{ index: string }>(sql`
      SELECT indexdef AS index FROM pg_indexes
      WHERE (schemaname, tablename) IN (('account', 'starred_rulesets'), ('rules', 'entity_snapshots'),
        ('storage', 'attachments'), ('character', 'characters'), ('campaign', 'players'), ('campaign', 'invites'))
        OR indexname IN ('notifications_actor_id_idx', 'character_contributors_invited_by_idx',
          'contributors_invited_by_idx', 'rulesets_ruleset_id_idx', 'ruleset_extensions_extension_id_idx')
    `);
    // In code-point order, which no database collation varies
    expect(indexes.map(({ index }) => index).toSorted()).toEqual([
      "CREATE INDEX attachments_blob_id_idx ON storage.attachments USING btree (blob_id)",
      'CREATE INDEX character_contributors_invited_by_idx ON "character".character_contributors USING btree (invited_by)',
      'CREATE INDEX characters_parent_character_id_idx ON "character".characters USING btree (parent_character_id) WHERE (parent_character_id IS NOT NULL)',
      'CREATE INDEX characters_ruleset_id_idx ON "character".characters USING btree (ruleset_id)',
      'CREATE INDEX characters_search_trgm_idx ON "character".characters USING gin (name gin_trgm_ops, description gin_trgm_ops)',
      'CREATE INDEX characters_user_id_idx ON "character".characters USING btree (user_id)',
      "CREATE INDEX contributors_invited_by_idx ON rules.contributors USING btree (invited_by)",
      "CREATE INDEX entity_snapshots_source_entity_id_idx ON rules.entity_snapshots USING btree (source_entity_id)",
      "CREATE INDEX invites_email_status_idx ON campaign.invites USING btree (email, status) WHERE (deleted_at IS NULL)",
      "CREATE INDEX invites_player_id_idx ON campaign.invites USING btree (player_id)",
      "CREATE INDEX invites_user_id_status_idx ON campaign.invites USING btree (user_id, status)",
      "CREATE INDEX notifications_actor_id_idx ON account.notifications USING btree (actor_id)",
      "CREATE INDEX players_campaign_id_idx ON campaign.players USING btree (campaign_id)",
      "CREATE INDEX players_user_id_campaign_id_idx ON campaign.players USING btree (user_id, campaign_id)",
      "CREATE INDEX ruleset_extensions_extension_id_idx ON rules.ruleset_extensions USING btree (extension_id)",
      "CREATE INDEX rulesets_ruleset_id_idx ON rules.rulesets USING btree (ruleset_id)",
      "CREATE INDEX starred_rulesets_ruleset_id_idx ON account.starred_rulesets USING btree (ruleset_id)",
      "CREATE UNIQUE INDEX attachments_pkey ON storage.attachments USING btree (id)",
      "CREATE UNIQUE INDEX attachments_record_name_unique_idx ON storage.attachments USING btree (record_type, record_id, name)",
      'CREATE UNIQUE INDEX characters_one_live_child_per_kind_idx ON "character".characters USING btree (parent_character_id, kind) WHERE ((deleted_at IS NULL) AND (parent_character_id IS NOT NULL))',
      'CREATE UNIQUE INDEX characters_pkey ON "character".characters USING btree (id)',
      'CREATE UNIQUE INDEX characters_share_token_unique_idx ON "character".characters USING btree (share_token) WHERE (share_token IS NOT NULL)',
      "CREATE UNIQUE INDEX entity_snapshots_pkey ON rules.entity_snapshots USING btree (id)",
      "CREATE UNIQUE INDEX entity_snapshots_ruleset_type_source_unique ON rules.entity_snapshots USING btree (ruleset_id, entity_type, source_entity_id)",
      "CREATE UNIQUE INDEX invites_pkey ON campaign.invites USING btree (id)",
      "CREATE UNIQUE INDEX players_pkey ON campaign.players USING btree (id)",
      "CREATE UNIQUE INDEX starred_rulesets_pkey ON account.starred_rulesets USING btree (user_id, ruleset_id)",
    ]);
    expect(await keptRows()).toEqual(before);
  });
});

describe("0090_empty-texts", () => {
  test("deletes an empty text a field holds one of, gives an empty slot its default, and changes nothing else", async () => {
    const { id: characterId } = await findSeededCharacter("Bjorn Ironhand");
    const { rows: picked } = await db.execute<{ item: string; spell: string }>(sql`
      SELECT (SELECT entity_id FROM rules.entity_fields WHERE field = 'ITEM_TYPE' ORDER BY entity_id LIMIT 1) AS item,
        (SELECT entity_id FROM rules.entity_fields WHERE field = 'SPELL_DESCRIPTOR' ORDER BY entity_id LIMIT 1) AS spell
    `);
    const { item, spell } = picked[0]!;
    await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'on', true)`);
    await db.execute(sql`
      INSERT INTO "character".fields (character_id, field, value_kind, multiple, text_value)
      VALUES (${characterId}, 'CHARACTER_DEITY', 'text', false, '')
    `);
    await db.execute(sql`
      UPDATE rules.entity_fields SET text_value = '' WHERE entity_id = ${item} AND field IN ('ITEM_TYPE', 'ITEM_SLOT')
    `);
    await db.execute(sql`
      UPDATE rules.entity_fields SET text_value = ''
      WHERE entity_id = ${spell} AND field = 'SPELL_DESCRIPTOR' AND ordinal = 0
    `);
    await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'off', true)`);
    const before = await fieldRows();

    for (const statement of statementsOf("0090_empty-texts.sql")) await db.execute(sql.raw(statement));

    expect(await fieldRows()).toEqual(
      before.flatMap((line) => {
        if (line === `character ${characterId} CHARACTER_DEITY 0 ''`) return [];
        if (line === `entity ${item} ITEM_TYPE 0 ''`) return [];
        if (line === `entity ${item} ITEM_SLOT 0 ''`) return [`entity ${item} ITEM_SLOT 0 'Other'`];
        return [line];
      }),
    );
    // The list's empty text, which the rule keeps, stays
    expect(before).toContain(`entity ${spell} SPELL_DESCRIPTOR 0 ''`);
    expect(before.filter((line) => line.endsWith(" ''"))).toHaveLength(4);
  });
});

describe("0091_stored-name-activities", () => {
  test("names an update's changed columns by their stored field or role, in the order an update records them, and nothing else", async () => {
    await restoreTypesBefore0092();
    const targetId = (await getSeedCtx()).classMap.pc["Fighter"];
    // What an activity and a notification recorded of each kind's update, as its form's keys named them, and of others
    const recorded = [
      [
        "items",
        "updateItem",
        '{"entityName":"Rope","changedFields":[{"field":"costGp","from":"1","to":"2"},{"field":"description"},{"field":"name","from":"Cord","to":"Rope"},{"field":"slot","to":"Head"},{"field":"type","from":"Gear","to":"Ring"},{"field":"weight","to":"1"},{"field":"sourceItemId","to":"t"}],"baseRules":"B"}',
        '{"entityName":"Rope","changedFields":[{"field":"name","from":"Cord","to":"Rope"},{"field":"description"},{"field":"ITEM_COST_GP","from":"1","to":"2"},{"field":"ITEM_WEIGHT","to":"1"},{"field":"ITEM_TYPE","from":"Gear","to":"Ring"},{"field":"ITEM_SLOT","to":"Head"},{"field":"madeFrom","to":"t"}],"baseRules":"B"}',
      ],
      [
        "classes",
        "updateClass",
        '{"baseRules":"B","entityName":"Fighter","changedFields":[{"field":"description"},{"field":"hd","from":"10","to":"12"}],"actorName":"A"}',
        '{"baseRules":"B","entityName":"Fighter","changedFields":[{"field":"description"},{"field":"CLASS_HD","from":"10","to":"12"}],"actorName":"A"}',
      ],
      [
        "races",
        "updateRace",
        '{"entityName":"Elf","changedFields":[{"field":"baseSpeed","to":"20"},{"field":"size","to":"Small"}]}',
        '{"entityName":"Elf","changedFields":[{"field":"RACE_SIZE","to":"Small"},{"field":"RACE_BASE_SPEED","to":"20"}]}',
      ],
      [
        "languages",
        "updateLanguage",
        '{"entityName":"Elven","changedFields":[{"field":"type","to":"Secret"}]}',
        '{"entityName":"Elven","changedFields":[{"field":"LANGUAGE_TYPE","to":"Secret"}]}',
      ],
      [
        "skills",
        "updateSkill",
        '{"entityName":"Climb","changedFields":[{"field":"primaryAbilityId","from":"a","to":"b"}]}',
        '{"entityName":"Climb","changedFields":[{"field":"keyAbility","from":"a","to":"b"}]}',
      ],
      [
        "saves",
        "updateSave",
        '{"entityName":"Will","changedFields":[{"field":"abilityId","from":"a","to":"b"}]}',
        '{"entityName":"Will","changedFields":[{"field":"keyAbility","from":"a","to":"b"}]}',
      ],
      [
        "spells",
        "updateSpell",
        '{"entityName":"Light","changedFields":[{"field":"description"},{"field":"name","from":"Glow","to":"Light"},{"field":"saveEffect","to":"Half"},{"field":"saveId","to":"s"}]}',
        '{"entityName":"Light","changedFields":[{"field":"name","from":"Glow","to":"Light"},{"field":"description"},{"field":"resistedBy","to":"s"},{"field":"SPELL_SAVE_EFFECT","to":"Half"}]}',
      ],
      [
        "feats",
        "updateFeat",
        '{"entityName":"Dodge","changedFields":[{"field":"description"},{"field":"name","from":"Duck","to":"Dodge"}]}',
        '{"entityName":"Dodge","changedFields":[{"field":"name","from":"Duck","to":"Dodge"},{"field":"description"}]}',
      ],
      [
        "skills",
        "updateSkill",
        '{"entityName":"Climb","changedFields":[]}',
        '{"entityName":"Climb","changedFields":[]}',
      ],
      [
        "classes",
        "createClass",
        '{"entityName":"Fighter","changedFields":[{"field":"hd"}]}',
        '{"entityName":"Fighter","changedFields":[{"field":"hd"}]}',
      ],
      [
        "characters",
        "updateCharacter",
        '{"entityName":"Hero","changedFields":[{"field":"type"},{"field":"name"}]}',
        '{"entityName":"Hero","changedFields":[{"field":"type"},{"field":"name"}]}',
      ],
    ];
    const activityIds: string[] = [];
    const notificationIds: string[] = [];
    for (const [table, type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_table, type, data)
        VALUES (${SEED_USER_ID}, ${targetId}, ${table}, ${type}, ${data}) RETURNING id
      `);
      activityIds.push(activity[0]!.id);
      const { rows: notification } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_table, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${targetId}, ${table}, ${data}) RETURNING id
      `);
      notificationIds.push(notification[0]!.id);
    }

    for (const statement of statementsOf("0091_stored-name-activities.sql")) await db.execute(sql.raw(statement));

    const expected = recorded.map(([target_table, type, , data]) => ({ target_table, type, data }));
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
  }, 30_000);
});

describe("0092_stored-type-forms", () => {
  test("stores each type and target as its URL names it and renames the target's column, and changes nothing else", async () => {
    await restoreTypesBefore0092();
    const { rows: levels } = await db.execute<{ id: string }>(sql`
      SELECT id FROM rules.entities WHERE type = 'class_levels' ORDER BY id LIMIT 1
    `);
    const levelId = levels[0]!.id;
    // What activities and notifications recorded of a class level and of its customizations, of the targets that are no
    // entity's (an entity's field's, before 0082), and of others
    const recorded = [
      ["class_levels", "createClassLevel", '{"entityName":"Fighter","level":1}'],
      ["player_characters", "linkCharacter", '{"visibility":"Public"}'],
      ["character_contributors", "inviteCharacterContributor", '{"characterName":"Hero"}'],
      ["oauth_accounts", "linkGoogleAccount", null],
      [
        "entity_fields",
        "updateField",
        '{"entityName":"Fighter 1","entityType":"class_levels","field":"CLASS_LEVEL_BAB"}',
      ],
      [
        "modifiers",
        "createModifier",
        '{"entityName":"Fighter 1","entityType" : "class_levels","target":"abilities.str"}',
      ],
      ["requirements", "deleteRequirement", '{"entityType":"classes","entityName":"class_levels"}'],
      ["classes", "updateClass", null],
    ];
    for (const [table, type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_table, type, data)
        VALUES (${SEED_USER_ID}, ${levelId}, ${table}, ${type}, ${data}) RETURNING id
      `);
      await db.execute(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_table, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${levelId}, ${table}, ${data})
      `);
    }
    const before = await typedRows(true);
    expect(before["rules.entities"]).not.toEqual((await typedRows(false))["rules.entities"]);

    for (const statement of statementsOf("0092_stored-type-forms.sql")) await db.execute(sql.raw(statement));

    // Every row as it was, but each type's new spelling: an entity name or another key holding the old word too
    const after = await typedRows(false);
    const { rows: named } = await db.execute<{ data: string }>(sql`
      SELECT data::text AS data FROM account.activities WHERE target_id = ${levelId} AND type = 'deleteRequirement'
    `);
    expect(named).toEqual([{ data: '{"entityType":"classes","entityName":"class_levels"}' }]);
    const differing = Object.keys(before).filter((table) => before[table] !== after[table]);
    expect(differing).toEqual(["account.activities", "account.notifications"]);
    const { rows } = await db.execute(sql`
      SELECT target_type, type, data::text AS data FROM account.activities WHERE target_id = ${levelId}
      UNION ALL SELECT target_type, type, data::text FROM account.notifications WHERE target_id = ${levelId}
      ORDER BY type, target_type
    `);
    const expected = [
      ["classes", "updateClass", null],
      ["class-levels", "createClassLevel", '{"entityName":"Fighter","level":1}'],
      ["player-characters", "linkCharacter", '{"visibility":"Public"}'],
      ["character-contributors", "inviteCharacterContributor", '{"characterName":"Hero"}'],
      ["oauth-accounts", "linkGoogleAccount", null],
      [
        "entity-fields",
        "updateField",
        '{"entityName":"Fighter 1","entityType":"class-levels","field":"CLASS_LEVEL_BAB"}',
      ],
      [
        "modifiers",
        "createModifier",
        '{"entityName":"Fighter 1","entityType" : "class-levels","target":"abilities.str"}',
      ],
      ["requirements", "deleteRequirement", '{"entityType":"classes","entityName":"class_levels"}'],
    ].flatMap(([target_type, type, data]) => [
      { target_type, type, data },
      { target_type, type, data },
    ]);
    expect(rows).toEqual(expected.toSorted((a, b) => a.type!.localeCompare(b.type!)));
    const { rows: types } = await db.execute<{ type: string }>(sql`SELECT type FROM rules.entity_types`);
    const declared = Engine.storage()
      .registries()
      .entityTypes.map(({ type }) => type);
    expect(types.map(({ type }) => type).toSorted()).toEqual(declared.toSorted());
  }, 30_000);
});

describe("0093_unused-pick-columns", () => {
  test("drops a pick's tier and parent pick, which nothing wrote, with the parent's key and index, and changes no row", async () => {
    await addPickColumns();
    const before = await pickRows();
    expect(before.filter((line) => line.startsWith("pick ")).length).toBeGreaterThan(0);

    for (const statement of statementsOf("0093_unused-pick-columns.sql")) await db.execute(sql.raw(statement));

    const { rows: dropped } = await db.execute<{ name: string }>(sql`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_schema = 'character' AND table_name = 'advancement_picks' AND column_name IN ('tier', 'parent_pick_id')
      UNION ALL SELECT indexname FROM pg_indexes WHERE indexname = 'advancement_picks_parent_idx'
      UNION ALL SELECT conname FROM pg_constraint
      WHERE conrelid = 'character.advancement_picks'::regclass AND conname = 'advancement_picks_parent_pick_id_fkey'
    `);
    expect(dropped).toEqual([]);
    expect(await pickRows()).toEqual(before);
  });

  test("refuses a pick that holds a tier or a parent pick", async () => {
    await addPickColumns();
    await db.execute(sql`
      UPDATE character.advancement_picks SET tier = 1
      WHERE id = (SELECT id FROM character.advancement_picks ORDER BY id LIMIT 1)
    `);
    await db.execute(sql`
      UPDATE character.advancement_picks
      SET parent_pick_id = (SELECT id FROM character.advancement_picks ORDER BY id LIMIT 1)
      WHERE id = (SELECT id FROM character.advancement_picks ORDER BY id DESC LIMIT 1)
    `);

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0093_unused-pick-columns.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({
      cause: { message: "Picks hold columns nothing reads: tier, parent_pick_id" },
    });
  });
});

describe("0094_link-activity-keys", () => {
  test("names a link's target in its activities and notifications as every link does, and nothing else", async () => {
    const targetId = (await getSeedCtx()).classMap.pc["Fighter"];
    // What an activity and a notification recorded of a class skill's add and remove, under the old keys, and others
    const recorded = [
      [
        "addClassSkill",
        '{"skillId":"s","entityName":"Fighter","skillName":"Climb","baseRules":"B"}',
        '{"toId":"s","entityName":"Fighter","toName":"Climb","baseRules":"B"}',
      ],
      [
        "removeClassSkill",
        '{"skillId" : "s","rulesetId":"r","entityName":"Fighter","skillName":"Knowledge (\\"skillId\\": x)"}',
        // Written as the app writes an object: no space between a key and its value
        '{"toId":"s","rulesetId":"r","entityName":"Fighter","toName":"Knowledge (\\"skillId\\": x)"}',
      ],
      // A key nested in a value stays, before the data's own key or after it
      [
        "addClassSkill",
        '{"entityName":"Fighter","extra":{"skillId":"n","skillName":"Nested"},"skillId":"s","skillName":"Climb"}',
        '{"entityName":"Fighter","extra":{"skillId":"n","skillName":"Nested"},"toId":"s","toName":"Climb"}',
      ],
      ["addClassSkill", '{"toId":"s","entityName":"Fighter","toName":"Climb"}', null],
      ["updateClass", '{"entityName":"skillName","changedFields":[{"field":"skillId"}]}', null],
      ["createClass", '{"skillId":"s"}', null],
      ["addClassSkill", null, null],
    ];
    const activityIds: string[] = [];
    const notificationIds: string[] = [];
    for (const [type, data] of recorded) {
      const { rows: activity } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.activities (user_id, target_id, target_type, type, data)
        VALUES (${SEED_USER_ID}, ${targetId}, 'classes', ${type}, ${data}) RETURNING id
      `);
      activityIds.push(activity[0]!.id);
      const { rows: notification } = await db.execute<{ id: string }>(sql`
        INSERT INTO account.notifications (recipient_id, actor_id, activity_id, type, target_id, target_type, data)
        VALUES (${SEED_USER_ID}, ${SEED_USER_ID}, ${activity[0]!.id}, ${type}, ${targetId}, 'classes', ${data})
        RETURNING id
      `);
      notificationIds.push(notification[0]!.id);
    }

    for (const statement of statementsOf("0094_link-activity-keys.sql")) await db.execute(sql.raw(statement));

    const expected = recorded.map(([type, data, renamed]) => ({ type, data: renamed ?? data }));
    for (const [table, ids] of [
      ["account.activities", activityIds],
      ["account.notifications", notificationIds],
    ] as const) {
      const { rows } = await db.execute(sql`
        SELECT type, data::text AS data FROM ${sql.raw(table)}
        WHERE id = ANY (${`{${ids.join(",")}}`}::uuid[]) ORDER BY array_position(${`{${ids.join(",")}}`}::uuid[], id)
      `);
      expect({ table, rows }).toEqual({ table, rows: expected });
    }
  });
});

describe("0095_advancement-entry", () => {
  test("names an advancement's class level its entry, with the indexes and key naming it, and rewrites no row", async () => {
    const fresh = await definitionsOf("character", "advancements");
    expect(fresh.filter((line) => line.includes("entry"))).toHaveLength(5);
    await restoreTracksBefore0095();
    expect(await definitionsOf("character", "advancements")).toEqual(
      fresh.map((line) => line.replaceAll("entry", "track")).toSorted(),
    );
    const before = await typedRows(false);
    const placed = sql`SELECT id, ctid::text AS place, xmin::text AS version FROM character.advancements ORDER BY id`;
    const { rows: stored } = await db.execute(placed);
    expect(stored.length).toBeGreaterThan(0);

    for (const statement of statementsOf("0095_advancement-entry.sql")) await db.execute(sql.raw(statement));

    // What a fresh database's migrations give, every row as it was, in its place, and every character's last change
    expect(await definitionsOf("character", "advancements")).toEqual(fresh);
    expect(await typedRows(false)).toEqual(before);
    expect((await db.execute(placed)).rows).toEqual(stored);
  }, 30_000);
});

describe("0096_campaign-seats", () => {
  test("restores the seats an archived campaign archived with it, but a deleted account's, and changes nothing else", async () => {
    const { user: gameMaster } = await createTestUser();
    const { user: deleted } = await createTestUser();
    await archiveAt("account.users", deleted.id, "-50 milliseconds");
    // A campaign archived before archiving left its seats alone: its Game Master's seat and an empty one archived with
    // it, and a deleted account's seat, archived with it too
    const { campaign: legacy, player: legacyMaster } = await createTestCampaign(gameMaster.id);
    const [emptySeat] = await Players.create(db, { campaignId: legacy.id, role: "Player Character" });
    const [deletedSeat] = await Players.create(db, {
      userId: deleted.id,
      campaignId: legacy.id,
      role: "Player Character",
    });
    await archiveAt("campaign.campaigns", legacy.id, "0 seconds");
    await archiveAt("campaign.players", legacyMaster.id, "4 milliseconds");
    await archiveAt("campaign.players", emptySeat!.id, "-5 milliseconds");
    await archiveAt("campaign.players", deletedSeat!.id, "3 milliseconds");
    // An archived campaign's seats archived well apart from it, and a live campaign's seat of a deleted account
    const { campaign: apart, player: earlier } = await createTestCampaign(gameMaster.id);
    const [later] = await Players.create(db, { userId: gameMaster.id, campaignId: apart.id, role: "Game Master" });
    await archiveAt("campaign.campaigns", apart.id, "0 seconds");
    await archiveAt("campaign.players", earlier.id, "-1 hour");
    await archiveAt("campaign.players", later!.id, "2 seconds");
    const { campaign: live } = await createTestCampaign(gameMaster.id);
    const [liveSeat] = await Players.create(db, { userId: deleted.id, campaignId: live.id, role: "Player Character" });
    await archiveAt("campaign.players", liveSeat!.id, "0 seconds");
    const before = await seatRows();

    for (const statement of statementsOf("0096_campaign-seats.sql")) await db.execute(sql.raw(statement));

    // Only the seats archived with their campaign are live again; every other row stays as it was
    const restored = new Set([legacyMaster.id, emptySeat!.id]);
    const kept = new Set([deletedSeat!.id, earlier.id, later!.id, liveSeat!.id]);
    const archivedOf = (ids: Set<string>) =>
      before.filter((line) => ids.has(line.split(" ")[1]!) && !line.endsWith(" -")).length;
    expect([archivedOf(restored), archivedOf(kept)]).toEqual([2, 4]);
    const expected = before.map((line) => (restored.has(line.split(" ")[1]!) ? line.replace(/ [^ ]+$/, " -") : line));
    expect(await seatRows()).toEqual(expected);

    // A second run restores nothing more
    for (const statement of statementsOf("0096_campaign-seats.sql")) await db.execute(sql.raw(statement));
    expect(await seatRows()).toEqual(expected);
  });
});

describe("0097_entity-campaign-scope", () => {
  test("drops an entity's campaign, which nothing wrote, keys its name and its owner without it, and rewrites no row", async () => {
    const fresh = await definitionsOf("rules", "entities");
    await addEntityCampaigns();
    const restored = await definitionsOf("rules", "entities");
    expect(restored.filter((line) => line.includes("campaign"))).toHaveLength(10);
    const before = await entityRows();
    const placed = sql`SELECT id, ctid::text AS place, xmin::text AS version FROM rules.entities ORDER BY id`;
    const { rows: stored } = await db.execute(placed);
    expect(stored.length).toBeGreaterThan(0);

    for (const statement of statementsOf("0097_entity-campaign-scope.sql")) await db.execute(sql.raw(statement));

    // What a fresh database's migrations give, every row as it was, in its place, and every character's last change
    expect(await definitionsOf("rules", "entities")).toEqual(fresh);
    expect(await entityRows()).toEqual(before);
    expect((await db.execute(placed)).rows).toEqual(stored);
  });

  test("refuses an entity that holds a campaign", async () => {
    await addEntityCampaigns();
    const { campaign } = await createTestCampaign(SEED_USER_ID);
    const languageId = (await getSeedCtx()).langMap["Common"];
    await db.execute(sql`UPDATE rules.entities SET campaign_id = ${campaign.id} WHERE id = ${languageId}`);

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0097_entity-campaign-scope.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ cause: { message: "Entities hold a campaign, which nothing reads" } });
  });
});

describe("0099_snapshot-type", () => {
  test("drops a snapshot's type, which its entities hold, keys it by its ruleset and its source, and rewrites no row", async () => {
    const fresh = await definitionsOf("rules", "entity_snapshots");
    await restoreSnapshotTypesBefore0099();
    const restored = await definitionsOf("rules", "entity_snapshots");
    expect(restored.filter((line) => line.includes("type"))).toHaveLength(3);
    const before = await snapshotRows();
    const placed = sql`SELECT id, ctid::text AS place, xmin::text AS version FROM rules.entity_snapshots ORDER BY id`;
    const { rows: stored } = await db.execute(placed);
    expect(stored.length).toBeGreaterThan(0);

    for (const statement of statementsOf("0099_snapshot-type.sql")) await db.execute(sql.raw(statement));

    // What a fresh database's migrations give, every row as it was, in its place, and every character's last change
    expect(await definitionsOf("rules", "entity_snapshots")).toEqual(fresh);
    expect(await snapshotRows()).toEqual(before);
    expect((await db.execute(placed)).rows).toEqual(stored);
  });

  test.each([
    ["its copy's", sql``],
    ["its source's, its copy deleted (a tombstone)", sql`, forked_entity_id = public.gen_random_uuid()`],
  ])("refuses a snapshot whose type differs from %s", async (_, tombstoned) => {
    await restoreSnapshotTypesBefore0099();
    await db.execute(sql`
      UPDATE rules.entity_snapshots SET entity_type = 'none'${tombstoned}
      WHERE id = (SELECT id FROM rules.entity_snapshots ORDER BY id LIMIT 1)
    `);

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0099_snapshot-type.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ cause: { message: "Snapshots differ from their entities' type" } });
  });

  test("refuses two snapshots of one source in a ruleset, of two types, its copies and its source gone", async () => {
    await restoreSnapshotTypesBefore0099();
    const { rulesetId } = await getSeedCtx();
    const sourceId = crypto.randomUUID();
    for (const type of ["feats", "spells"]) {
      await db.execute(sql`
        INSERT INTO rules.entity_snapshots (ruleset_id, entity_type, source_entity_id, forked_entity_id)
        VALUES (${rulesetId}, ${type}, ${sourceId}, ${crypto.randomUUID()})
      `);
    }

    const refused = await db
      .transaction(async (tx) => {
        for (const statement of statementsOf("0099_snapshot-type.sql")) await tx.execute(sql.raw(statement));
      })
      .catch((error: unknown) => error);
    expect(refused).toMatchObject({ cause: { message: "Rulesets hold two snapshots of one source" } });
  });
});

describe("0100_level-order-requirements", () => {
  test("deletes a class level's requirement of its previous level, whatever its class's name, alone on the level, and nothing else", async () => {
    const { classMap } = await getSeedCtx();
    const { rows: levels } = await db.execute<{ id: string; position: number }>(sql`
      SELECT id, position FROM rules.entities WHERE owner_id = ${classMap.pc["Fighter"]} ORDER BY position
    `);
    const levelAt = (position: number) => levels.find((level) => level.position === position)!.id;
    const { rows: modifiers } = await db.execute<{ id: string }>(sql`
      SELECT id FROM customization.modifiers ORDER BY id LIMIT 1
    `);
    const write = async (entityId: string, entityType: string, level: string, condition: string[] | string) => {
      const [target, operator, value, type = "number"] = typeof condition === "string" ? [] : condition;
      const chaining = typeof condition === "string" ? condition : null;
      const valueType = chaining ? null : type;
      const { rows } = await db.execute<{ id: string }>(sql`
        INSERT INTO customization.requirements
          (entity_id, entity_type, level, target, operator, value, value_type, chaining_operator)
        VALUES (${entityId}, ${entityType}, ${level}, ${target ?? null}, ${operator ?? null}, ${value ?? null},
          ${valueType}, ${chaining})
        RETURNING id
      `);
      return rows[0]!.id;
    };
    await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'on', true)`);
    // As a level's save or the seeders wrote it, and of a class renamed since
    const written = await write(levelAt(2), "class-levels", "1", ["classes.fighter.level", "greater_than", "1"]);
    const renamed = await write(levelAt(3), "class-levels", "1", ["classes.warrior.level", "greater_than", "2"]);
    // What differs from it: its value, its value's type, its operator, its target, its level's place, its owner's type,
    // its root, and a level holding it beside another requirement or under a group
    await write(levelAt(4), "class-levels", "1", ["classes.fighter.level", "greater_than", "2"]);
    await write(levelAt(10), "class-levels", "1", ["classes.fighter.level", "greater_than", "9", "string"]);
    await write(levelAt(5), "class-levels", "1", ["classes.fighter.level", "greater_than_or_equal", "4"]);
    await write(levelAt(6), "class-levels", "1", ["classes.fighter.bonuscasterlevel", "greater_than", "5"]);
    await write(levelAt(1), "class-levels", "1", ["classes.fighter.level", "greater_than", "0"]);
    await write(modifiers[0]!.id, "modifiers", "1", ["classes.fighter.level", "greater_than", "1"]);
    await write(levelAt(7), "class-levels", "2", ["classes.fighter.level", "greater_than", "6"]);
    await write(levelAt(8), "class-levels", "1", ["classes.fighter.level", "greater_than", "7"]);
    await write(levelAt(8), "class-levels", "2", ["abilities.strength.total", "greater_than_or_equal", "13"]);
    await write(levelAt(9), "class-levels", "1", "or");
    await write(levelAt(9), "class-levels", "1.1", ["classes.fighter.level", "greater_than", "8"]);
    await write(levelAt(9), "class-levels", "1.2", ["classes.rogue.level", "greater_than", "8"]);
    await db.execute(sql`SELECT set_config('arkyvree.registry_sync', 'off', true)`);
    const before = await requirementRows();

    for (const statement of statementsOf("0100_level-order-requirements.sql")) await db.execute(sql.raw(statement));

    // Only the two rows as a save wrote them go; every other row stays as it was, and every character's last change
    const deleted = new Set([written, renamed]);
    const expected = before.filter((line) => !deleted.has(line.split(" ")[1]!));
    expect(before.length - expected.length).toBe(2);
    expect(await requirementRows()).toEqual(expected);

    // A second run deletes nothing more
    for (const statement of statementsOf("0100_level-order-requirements.sql")) await db.execute(sql.raw(statement));
    expect(await requirementRows()).toEqual(expected);
  }, 30_000);
});
