-- Rulesets are archived by their status (`Archived`); entities, advancements, inventory entries, a character's and a
-- ruleset's contributors, campaign seats, modifiers, requirements and activities are hard-deleted (a contributor
-- revoked by its status, an activity by the retention sweep). Nothing sets their archive columns (`deleted_at`,
-- 0080's on `rules.entities` and `character.advancements` copied from the old tables' soft delete), which go, with
-- `character.links`' `ordinal`, which nothing writes (no role a character holds many of links it to an entity twice,
-- and nothing reads its links in an order of their own).
--
-- What the archive before 0080 left is deleted first: an archived character whose advancements it archived with it
-- is deleted as a hard delete of an archived character deletes it (its children, levels and their picks, links,
-- fields, inventory, contributors, campaign seats, modifiers and attachments, by the database's cascades and
-- triggers; its activities and notifications stay, as history). Then any other archived advancement (with its
-- picks), inventory entry, contributor, campaign seat or activity, which every reader left out, is deleted. A
-- character archived since, whose rows aren't, stays as it is. A ruleset, an entity, a modifier or a requirement
-- with its archive column set, user, ruleset or character data, refuses the migration.
--
-- The indexes that left an archived row out hold every row: an advancement's position among its character's, a
-- character's one campaign seat, a contributor's pending or active invite, a ruleset by status, a user's activities
-- by date; those the remaining indexes cover go (a seat by its player, by its character; a requirement by its
-- entity). No other row changes, nor a character's last change (`arkyvree.registry_sync`, which the touch triggers
-- read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- No ruleset, entity, modifier or requirement has an archive column set, or the migration stops, naming the tables
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(t, ', ') INTO finding FROM (
    SELECT 'rules.entities' AS t WHERE EXISTS (SELECT 1 FROM rules.entities WHERE deleted_at IS NOT NULL)
    UNION ALL SELECT 'customization.modifiers'
     WHERE EXISTS (SELECT 1 FROM customization.modifiers WHERE deleted_at IS NOT NULL)
    UNION ALL SELECT 'customization.requirements'
     WHERE EXISTS (SELECT 1 FROM customization.requirements WHERE deleted_at IS NOT NULL)
    UNION ALL SELECT 'rules.rulesets' WHERE EXISTS (SELECT 1 FROM rules.rulesets WHERE deleted_at IS NOT NULL)) x;
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Archived rows, which rulesets and characters may hold: %', finding;
  END IF;
END $$;

-- The archived characters the archive before 0080 archived their advancements with, then any other archived
-- advancement (its picks go with it), inventory entry, contributor and campaign seat
DELETE FROM character.characters c
 WHERE c.deleted_at IS NOT NULL
   AND EXISTS (SELECT 1 FROM character.advancements a WHERE a.character_id = c.id AND a.deleted_at IS NOT NULL);
DELETE FROM character.advancements WHERE deleted_at IS NOT NULL;
DELETE FROM character.inventory WHERE deleted_at IS NOT NULL;
DELETE FROM character.character_contributors WHERE deleted_at IS NOT NULL;
DELETE FROM campaign.player_characters WHERE deleted_at IS NOT NULL;
DELETE FROM rules.contributors WHERE deleted_at IS NOT NULL;
DELETE FROM account.activities WHERE deleted_at IS NOT NULL;

-- An advancement's position: unique among its character's, then its archive column
DROP INDEX character.advancements_character_position_idx;
CREATE UNIQUE INDEX advancements_character_position_idx ON character.advancements (character_id, position);
ALTER TABLE character.advancements DROP COLUMN deleted_at;

-- A character's one campaign seat, then its archive column; a seat by its player (`…_player_id_character_id_idx`) and
-- by its character (the unique index) need no index of their own
DROP INDEX campaign.player_characters_character_id_active_idx;
DROP INDEX IF EXISTS campaign.player_characters_character_id_idx;
DROP INDEX IF EXISTS campaign.player_characters_player_id_idx;
CREATE UNIQUE INDEX player_characters_character_id_active_idx ON campaign.player_characters (character_id);
ALTER TABLE campaign.player_characters DROP COLUMN deleted_at;

-- A contributor's pending or active invite, a character's and a ruleset's, by user and by email, then their archive
-- columns
DROP INDEX character.character_contributors_character_user_unique;
DROP INDEX character.character_contributors_character_email_unique;
CREATE UNIQUE INDEX character_contributors_character_user_unique ON character.character_contributors
  (character_id, user_id) WHERE status IN ('Pending', 'Active');
CREATE UNIQUE INDEX character_contributors_character_email_unique ON character.character_contributors
  (character_id, email) WHERE user_id IS NULL AND status IN ('Pending', 'Active');
ALTER TABLE character.character_contributors DROP COLUMN deleted_at;
DROP INDEX rules.contributors_ruleset_user_unique;
DROP INDEX rules.contributors_ruleset_email_unique;
CREATE UNIQUE INDEX contributors_ruleset_user_unique ON rules.contributors
  (ruleset_id, user_id) WHERE status IN ('Pending', 'Active');
CREATE UNIQUE INDEX contributors_ruleset_email_unique ON rules.contributors
  (ruleset_id, email) WHERE user_id IS NULL AND status IN ('Pending', 'Active');
ALTER TABLE rules.contributors DROP COLUMN deleted_at;

-- A user's rulesets by status, and every ruleset by status, then their archive column (a ruleset's archive is its
-- status)
DROP INDEX IF EXISTS rules.rulesets_user_id_status_idx;
DROP INDEX IF EXISTS rules.rulesets_status_idx;
CREATE INDEX rulesets_user_id_status_idx ON rules.rulesets (user_id, status);
CREATE INDEX rulesets_status_idx ON rules.rulesets (status);
ALTER TABLE rules.rulesets DROP COLUMN deleted_at;

-- A user's activities by date, then their archive column
DROP INDEX IF EXISTS account.activities_user_id_created_at_idx;
CREATE INDEX activities_user_id_created_at_idx ON account.activities (user_id, created_at DESC);
ALTER TABLE account.activities DROP COLUMN deleted_at;

-- A requirement by its entity (its key, `…_entity_id_entity_type_level_key`, leads with it), then the archive columns
-- of entities, inventory entries, modifiers and requirements
DROP INDEX IF EXISTS customization.requirements_entity_id_entity_type_idx;
ALTER TABLE rules.entities DROP COLUMN deleted_at;
ALTER TABLE character.inventory DROP COLUMN deleted_at;
ALTER TABLE customization.modifiers DROP COLUMN deleted_at;
ALTER TABLE customization.requirements DROP COLUMN deleted_at;

-- A character's link: unique by its role and its entity, then its ordinal with its check
ALTER TABLE character.links DROP CONSTRAINT links_character_id_role_entity_id_ordinal_key;
ALTER TABLE character.links ADD CONSTRAINT links_character_id_role_entity_id_key UNIQUE (character_id, role, entity_id);
ALTER TABLE character.links DROP CONSTRAINT links_ordinal_check;
ALTER TABLE character.links DROP COLUMN ordinal;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
