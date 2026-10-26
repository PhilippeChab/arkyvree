-- An entity's type is stored as a URL names it, its words joined by hyphens: 3.5's class levels are `class-levels`,
-- never `class_levels`, the dropped table's name, so no URL translates a type and back. No other type, role or step
-- holds an underscore. Every column that holds a type takes the new one: the registries (the type itself, the fields
-- and link roles it declares, its items' type), the entities and every row that names one by its type (their fields
-- and links, a ruleset's links, a character's levels, picks, links and items, a modifier's source, a requirement's
-- entity, a snapshot), and what activities and notifications recorded of one (their target, and their data's
-- `entityType`, a customization's). Their target column holds a type (an entity's, a role's, a record's) since 0084
-- and 0085, never a table: `target_table` is `target_type`, and each target that isn't an entity's takes the same form
-- as the code now declares it (`player_characters` → `player-characters`, `character_contributors`, `oauth_accounts`,
-- and the fields' `entity_fields` of the activities before 0082). An activity's type stays (`createClassLevel`,
-- `linkCharacter`: the code spells an entity's off its type's words). A character's last change stays where it was: this is no player's change
-- (`arkyvree.registry_sync`, which the touch triggers read).
--
-- A non-deferrable key checks every statement's end, and an entity's own keys (its fields' and its links' from) name it
-- by its id and type: the registries' new rows come first, beside the old ones, then every row that names the type,
-- in one statement, then the old registry rows go.

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- The type, beside the old one, and what it declares: its fields, its links' roles, its items
INSERT INTO rules.entity_types (type, owner_type)
SELECT 'class-levels', owner_type FROM rules.entity_types WHERE type = 'class_levels';
INSERT INTO rules.field_defs (owner_kind, owner_type, field, value_kind, multiple)
SELECT owner_kind, 'class-levels', field, value_kind, multiple FROM rules.field_defs WHERE owner_type = 'class_levels';
INSERT INTO rules.link_role_kinds (role, from_type, single)
SELECT role, 'class-levels', single FROM rules.link_role_kinds WHERE from_type = 'class_levels';
INSERT INTO rules.link_roles (role, from_type, to_type, via_type, single, on_delete, via_on_delete)
SELECT role,
  CASE from_type WHEN 'class_levels' THEN 'class-levels' ELSE from_type END,
  CASE to_type WHEN 'class_levels' THEN 'class-levels' ELSE to_type END,
  CASE via_type WHEN 'class_levels' THEN 'class-levels' ELSE via_type END,
  single, on_delete, via_on_delete
FROM rules.link_roles WHERE 'class_levels' IN (from_type, to_type, via_type);
INSERT INTO "character".item_types (entity_type)
SELECT 'class-levels' FROM "character".item_types WHERE entity_type = 'class_levels';

-- Every row that names the type, and the roles and steps keyed by another column, at once: an entity's keys and its
-- type change together
WITH owned_types AS (
  UPDATE rules.entity_types SET owner_type = 'class-levels' WHERE owner_type = 'class_levels' RETURNING 1
), entities AS (
  UPDATE rules.entities SET
    type = CASE type WHEN 'class_levels' THEN 'class-levels' ELSE type END,
    owner_type = CASE owner_type WHEN 'class_levels' THEN 'class-levels' ELSE owner_type END
  WHERE 'class_levels' IN (type, owner_type) RETURNING 1
), entity_fields AS (
  UPDATE rules.entity_fields SET entity_type = 'class-levels' WHERE entity_type = 'class_levels' RETURNING 1
), entity_links AS (
  UPDATE rules.entity_links SET
    from_type = CASE from_type WHEN 'class_levels' THEN 'class-levels' ELSE from_type END,
    to_type = CASE to_type WHEN 'class_levels' THEN 'class-levels' ELSE to_type END,
    via_type = CASE via_type WHEN 'class_levels' THEN 'class-levels' ELSE via_type END
  WHERE 'class_levels' IN (from_type, to_type, via_type) RETURNING 1
), ruleset_roles AS (
  UPDATE rules.ruleset_roles SET to_type = 'class-levels' WHERE to_type = 'class_levels' RETURNING 1
), ruleset_links AS (
  UPDATE rules.ruleset_links SET to_type = 'class-levels' WHERE to_type = 'class_levels' RETURNING 1
), character_roles AS (
  UPDATE "character".character_roles SET entity_type = 'class-levels' WHERE entity_type = 'class_levels' RETURNING 1
), character_links AS (
  UPDATE "character".links SET entity_type = 'class-levels' WHERE entity_type = 'class_levels' RETURNING 1
), steps AS (
  UPDATE "character".steps SET
    entity_type = CASE entity_type WHEN 'class_levels' THEN 'class-levels' ELSE entity_type END,
    via_type = CASE via_type WHEN 'class_levels' THEN 'class-levels' ELSE via_type END
  WHERE 'class_levels' IN (entity_type, via_type) RETURNING 1
), advancements AS (
  UPDATE "character".advancements SET track_type = 'class-levels' WHERE track_type = 'class_levels' RETURNING 1
), advancement_picks AS (
  UPDATE "character".advancement_picks SET
    entity_type = CASE entity_type WHEN 'class_levels' THEN 'class-levels' ELSE entity_type END,
    via_type = CASE via_type WHEN 'class_levels' THEN 'class-levels' ELSE via_type END
  WHERE 'class_levels' IN (entity_type, via_type) RETURNING 1
), inventory AS (
  UPDATE "character".inventory SET item_type = 'class-levels' WHERE item_type = 'class_levels' RETURNING 1
)
SELECT
  (SELECT count(*) FROM owned_types) + (SELECT count(*) FROM entities) + (SELECT count(*) FROM entity_fields)
  + (SELECT count(*) FROM entity_links) + (SELECT count(*) FROM ruleset_roles) + (SELECT count(*) FROM ruleset_links)
  + (SELECT count(*) FROM character_roles) + (SELECT count(*) FROM character_links) + (SELECT count(*) FROM steps)
  + (SELECT count(*) FROM advancements) + (SELECT count(*) FROM advancement_picks) + (SELECT count(*) FROM inventory)
  AS renamed;

-- What customizations and snapshots name by its type, no key checks
UPDATE customization.modifiers SET source_type = 'class-levels' WHERE source_type = 'class_levels';
UPDATE customization.requirements SET entity_type = 'class-levels' WHERE entity_type = 'class_levels';
UPDATE rules.entity_snapshots SET entity_type = 'class-levels' WHERE entity_type = 'class_levels';

-- What activities recorded: their target's type, every one in the type's form (a class level's, a campaign's character's,
-- a character's contributor's, an entity's field's from before 0082), and a customization's entity type in their data
UPDATE account.activities SET target_table = replace(target_table, '_', '-') WHERE target_table LIKE '%\_%';
UPDATE account.activities
SET data = regexp_replace(data::text, '("entityType"\s*:\s*")class_levels"', '\1class-levels"', 'g')::json
WHERE data::text ~ '"entityType"\s*:\s*"class_levels"';

-- What notifications recorded: the same
UPDATE account.notifications SET target_table = replace(target_table, '_', '-') WHERE target_table LIKE '%\_%';
UPDATE account.notifications
SET data = regexp_replace(data::text, '("entityType"\s*:\s*")class_levels"', '\1class-levels"', 'g')::json
WHERE data::text ~ '"entityType"\s*:\s*"class_levels"';

-- Their target's column, and the index by it, named for what it holds
ALTER TABLE account.activities RENAME COLUMN target_table TO target_type;
ALTER INDEX account.activities_target_id_target_table RENAME TO activities_target_id_target_type;
ALTER TABLE account.notifications RENAME COLUMN target_table TO target_type;

-- The old registry rows, which no row names now
DELETE FROM rules.link_roles WHERE 'class_levels' IN (from_type, to_type, via_type);
DELETE FROM rules.link_role_kinds WHERE from_type = 'class_levels';
DELETE FROM rules.field_defs WHERE owner_type = 'class_levels';
DELETE FROM "character".item_types WHERE entity_type = 'class_levels';
DELETE FROM rules.entity_types WHERE type = 'class_levels';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
