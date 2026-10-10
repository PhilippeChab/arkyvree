-- A character's updated_at moved only when its own row was written (its details, its share link, its archive): a
-- level-up, the inventory, the ability scores, the languages and the modifiers write other tables and left it alone,
-- so the characters list's Recently Updated order missed them. updated_at is also the details form's stale-edit check,
-- so moving it on those writes would refuse an open form's save after a level-up in another tab.
--
-- A character's last change is a column of its own, last_changed_at, which the list orders by. The database moves it,
-- whatever writes: a write that changes the character's row, and every insert, update and delete of the rows that
-- belong to it (its abilities, inventory, languages, levels and their picks, customizations and portrait), a foreign
-- key's cascade included. A bonded creature's change moves its master's too: the list shows only the master, whose
-- sheet the creature is part of. Nothing here writes updated_at.
--
-- It moves to the transaction's start (now()), once a transaction: a character the transaction already moved isn't
-- written again, however many statements or rows reach it, and a transaction that started earlier never moves it back.
--
-- Each character starts at the latest date among its row and the rows that belong to it (made, updated or archived),
-- its bonded creatures' included. A row deleted before now left no date.

ALTER TABLE "character"."characters" ADD COLUMN "last_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
WITH row_changes (character_id, changed_at) AS (
  SELECT character_id, GREATEST(created_at, updated_at, deleted_at) FROM character.character_abilities
  UNION ALL SELECT character_id, GREATEST(created_at, updated_at, deleted_at) FROM character.inventory
  UNION ALL SELECT character_id, GREATEST(created_at, updated_at, deleted_at) FROM character.languages
  UNION ALL SELECT character_id, GREATEST(created_at, updated_at, deleted_at) FROM character.levels
  UNION ALL SELECT l.character_id, GREATEST(p.created_at, p.updated_at, p.deleted_at)
    FROM character.level_ability_increases p JOIN character.levels l ON l.id = p.character_level_id
  UNION ALL SELECT l.character_id, GREATEST(p.created_at, p.updated_at, p.deleted_at)
    FROM character.level_feats p JOIN character.levels l ON l.id = p.character_level_id
  UNION ALL SELECT l.character_id, GREATEST(p.created_at, p.updated_at, p.deleted_at)
    FROM character.level_powers p JOIN character.levels l ON l.id = p.character_level_id
  UNION ALL SELECT l.character_id, GREATEST(p.created_at, p.updated_at, p.deleted_at)
    FROM character.level_skills p JOIN character.levels l ON l.id = p.character_level_id
  UNION ALL SELECT source_id, GREATEST(created_at, updated_at, deleted_at)
    FROM customization.modifiers WHERE source_type = 'characters'
  UNION ALL SELECT entity_id, GREATEST(created_at, updated_at, deleted_at)
    FROM customization.requirements WHERE entity_type = 'characters'
  UNION ALL SELECT entity_id, GREATEST(created_at, updated_at, deleted_at)
    FROM customization.properties WHERE entity_type = 'characters'
  UNION ALL SELECT m.source_id, GREATEST(r.created_at, r.updated_at, r.deleted_at)
    FROM customization.requirements r JOIN customization.modifiers m ON m.id = r.entity_id
    WHERE r.entity_type = 'modifiers' AND m.source_type = 'characters'
  UNION ALL SELECT record_id, GREATEST(created_at, updated_at) FROM storage.attachments WHERE record_type = 'Character'
),
own_changes AS (
  SELECT c.id, c.parent_character_id,
    GREATEST(c.created_at, c.updated_at, c.deleted_at, max(r.changed_at)) AS changed_at
  FROM character.characters c LEFT JOIN row_changes r ON r.character_id = c.id
  GROUP BY c.id
)
UPDATE character.characters c SET last_changed_at = GREATEST(own.changed_at, bonded.changed_at)
FROM own_changes own
LEFT JOIN (
  SELECT parent_character_id, max(changed_at) AS changed_at FROM own_changes
  WHERE parent_character_id IS NOT NULL GROUP BY parent_character_id
) bonded ON bonded.parent_character_id = own.id
WHERE c.id = own.id;--> statement-breakpoint
-- Moves the characters' last change, their masters' first (as a level-up locks a master before its creatures)
CREATE FUNCTION character.touch_characters(character_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  master_ids uuid[] := ARRAY(
    SELECT parent_character_id FROM character.characters
    WHERE id = ANY (character_ids) AND parent_character_id IS NOT NULL
  );
BEGIN
  -- Its updates fire the characters' statement triggers, which call this again with the masters of the rows they
  -- wrote, even of none: an empty list runs no update, which ends it
  IF cardinality(master_ids) > 0 THEN
    UPDATE character.characters SET last_changed_at = now() WHERE id = ANY (master_ids) AND last_changed_at < now();
  END IF;
  IF cardinality(character_ids) > 0 THEN
    UPDATE character.characters SET last_changed_at = now() WHERE id = ANY (character_ids) AND last_changed_at < now();
  END IF;
END $$;
--> statement-breakpoint
-- A write that changes the character's row moves its last change; one that writes its last change alone (the functions
-- here, a backfill) keeps what it writes
CREATE FUNCTION character.touch_own_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  others "character".characters := NEW;
BEGIN
  others.last_changed_at := OLD.last_changed_at;
  IF others IS DISTINCT FROM OLD THEN
    NEW.last_changed_at := GREATEST(OLD.last_changed_at, now());
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- A bonded creature added or deleted, or whose last change moved, moves its master's
CREATE FUNCTION character.touch_masters() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(
    SELECT parent_character_id FROM changed_rows
    WHERE parent_character_id IS NOT NULL AND (TG_OP = 'DELETE' OR last_changed_at >= now())
  ));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION character.touch_characters_of_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT character_id FROM changed_rows));
  RETURN NULL;
END $$;
--> statement-breakpoint
-- A level's row: the character of its level. A level's delete cascades to its rows, and moves its character itself.
CREATE FUNCTION character.touch_characters_of_level_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(
    ARRAY(SELECT l.character_id FROM changed_rows r JOIN character.levels l ON l.id = r.character_level_id)
  );
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION customization.touch_characters_of_modifiers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT source_id FROM changed_rows WHERE source_type = 'characters'));
  RETURN NULL;
END $$;
--> statement-breakpoint
-- A requirement or a property of the character's, or a requirement of one of its modifiers
CREATE FUNCTION customization.touch_characters_of_customizations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(
    SELECT entity_id FROM changed_rows WHERE entity_type = 'characters'
    UNION
    SELECT m.source_id FROM changed_rows r JOIN customization.modifiers m ON m.id = r.entity_id
    WHERE r.entity_type = 'modifiers' AND m.source_type = 'characters'
  ));
  RETURN NULL;
END $$;
--> statement-breakpoint
-- A character's portrait
CREATE FUNCTION storage.touch_characters_of_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT record_id FROM changed_rows WHERE record_type = 'Character'));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER touch_own_row BEFORE UPDATE ON character.characters
  FOR EACH ROW EXECUTE FUNCTION character.touch_own_row();
--> statement-breakpoint
-- Each table and the function that finds the characters of its rows, on its inserts, updates and deletes. An update
-- reads its rows' new values: no write moves a row to another character.
DO $$
DECLARE
  touched record;
BEGIN
  FOR touched IN SELECT * FROM (VALUES
    ('character.characters', 'character.touch_masters'),
    ('character.character_abilities', 'character.touch_characters_of_rows'),
    ('character.inventory', 'character.touch_characters_of_rows'),
    ('character.languages', 'character.touch_characters_of_rows'),
    ('character.levels', 'character.touch_characters_of_rows'),
    ('character.level_ability_increases', 'character.touch_characters_of_level_rows'),
    ('character.level_feats', 'character.touch_characters_of_level_rows'),
    ('character.level_powers', 'character.touch_characters_of_level_rows'),
    ('character.level_skills', 'character.touch_characters_of_level_rows'),
    ('customization.modifiers', 'customization.touch_characters_of_modifiers'),
    ('customization.properties', 'customization.touch_characters_of_customizations'),
    ('customization.requirements', 'customization.touch_characters_of_customizations'),
    ('storage.attachments', 'storage.touch_characters_of_attachments')
  ) AS tables (table_name, function_name) LOOP
    EXECUTE format(
      'CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON %s REFERENCING NEW TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
    EXECUTE format(
      'CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON %s REFERENCING NEW TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
    EXECUTE format(
      'CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON %s REFERENCING OLD TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
  END LOOP;
END $$;
