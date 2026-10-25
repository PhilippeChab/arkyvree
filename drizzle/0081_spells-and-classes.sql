-- 3.5's spells are stored as spells, and its classes, their levels and their joins as classes, `class_…`: what a ruleset
-- stores and shows says "class" and "spell", where its code says `Klass` (`class` is a reserved word). Its kinds
-- (`powers` → `spells`, `klasses` → `classes`, `klass_levels` → `class_levels`), its fields (`KLASS_HD` → `CLASS_HD`,
-- `POWER_SAVE_EFFECT` → `SPELL_SAVE_EFFECT`…), its spells' level-up step and target paths (`powers.…` → `spells.…`), and
-- what the activities and notifications recorded of them (their types, tables and data) are renamed in place, before the
-- registry sync (`scripts/db/migrate.ts`) finds them as its module declares them. Every foreign key over a renamed column
-- is dropped and added back around the renames, which change both ends; a renamed row is updated, never deleted and
-- inserted again (a deleted entity takes its customizations with it). A character's last change stays where it was: this
-- is no player's change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- 0080's rows run their deferred checks now: drizzle runs the pending migrations in one transaction, and a table with
-- checks pending can't be altered
SET CONSTRAINTS ALL IMMEDIATE;

-- The foreign keys over the renamed columns

ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_entity_id_entity_type_fkey;
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_step_entity_type_fkey;
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_step_has_entity_has_via_fkey;
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_step_repeats_fkey;
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_step_via_type_fkey;
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_via_id_via_type_fkey;
ALTER TABLE "character".advancements DROP CONSTRAINT advancements_track_id_track_type_fkey;
ALTER TABLE "character".character_roles DROP CONSTRAINT character_roles_entity_type_fkey;
ALTER TABLE "character".fields DROP CONSTRAINT fields_owner_type_field_value_kind_multiple_fkey;
ALTER TABLE "character".inventory DROP CONSTRAINT inventory_item_entity_fkey;
ALTER TABLE "character".inventory DROP CONSTRAINT inventory_item_type_fkey;
ALTER TABLE "character".item_types DROP CONSTRAINT item_types_entity_type_fkey;
ALTER TABLE "character".links DROP CONSTRAINT links_entity_id_entity_type_fkey;
ALTER TABLE "character".links DROP CONSTRAINT links_role_entity_type_single_fkey;
ALTER TABLE "character".steps DROP CONSTRAINT steps_entity_type_fkey;
ALTER TABLE "character".steps DROP CONSTRAINT steps_via_type_fkey;
ALTER TABLE rules.entities DROP CONSTRAINT entities_owner_id_owner_type_fkey;
ALTER TABLE rules.entities DROP CONSTRAINT entities_type_owned_fkey;
ALTER TABLE rules.entities DROP CONSTRAINT entities_type_owner_type_fkey;
ALTER TABLE rules.entity_fields DROP CONSTRAINT entity_fields_entity_id_entity_type_fkey;
ALTER TABLE rules.entity_fields DROP CONSTRAINT entity_fields_entity_type_field_value_kind_multiple_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_from_id_from_type_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_role_from_type_to_type_has_via_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_role_from_type_to_type_single_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_role_from_type_to_type_via_type_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_to_id_to_type_fkey;
ALTER TABLE rules.entity_links DROP CONSTRAINT entity_links_via_id_via_type_fkey;
ALTER TABLE rules.entity_types DROP CONSTRAINT entity_types_owner_type_fkey;
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_entity_type_fkey;
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_inherits_via_entity_type_entity_type_inherits_s_fkey;
ALTER TABLE rules.link_role_kinds DROP CONSTRAINT link_role_kinds_from_type_fkey;
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_from_type_fkey;
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_role_from_type_single_fkey;
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_to_type_fkey;
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_via_type_fkey;
ALTER TABLE rules.ruleset_fields DROP CONSTRAINT ruleset_fields_owner_type_field_value_kind_multiple_fkey;
ALTER TABLE rules.ruleset_links DROP CONSTRAINT ruleset_links_role_to_type_fkey;
ALTER TABLE rules.ruleset_links DROP CONSTRAINT ruleset_links_to_id_to_type_fkey;
ALTER TABLE rules.ruleset_roles DROP CONSTRAINT ruleset_roles_to_type_fkey;

-- The kinds
UPDATE rules.entity_types SET type = CASE type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_types SET owner_type = CASE owner_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE owner_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entities SET type = CASE type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entities SET owner_type = CASE owner_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE owner_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_fields SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_links SET from_type = CASE from_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE from_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_links SET to_type = CASE to_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE to_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_links SET via_type = CASE via_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE via_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.entity_snapshots SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.field_defs SET owner_type = CASE owner_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE owner_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.link_role_kinds SET from_type = CASE from_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE from_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.link_roles SET from_type = CASE from_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE from_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.link_roles SET to_type = CASE to_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE to_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.link_roles SET via_type = CASE via_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE via_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.ruleset_fields SET owner_type = CASE owner_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE owner_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.ruleset_links SET to_type = CASE to_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE to_type IN ('powers', 'klasses', 'klass_levels');
UPDATE rules.ruleset_roles SET to_type = CASE to_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE to_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".advancement_picks SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".advancement_picks SET via_type = CASE via_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE via_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".advancements SET track_type = CASE track_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE track_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".character_roles SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".fields SET owner_type = CASE owner_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE owner_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".item_types SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".inventory SET item_type = CASE item_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE item_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".links SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".steps SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');
UPDATE "character".steps SET via_type = CASE via_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE via_type IN ('powers', 'klasses', 'klass_levels');
UPDATE customization.modifiers SET source_type = CASE source_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE source_type IN ('powers', 'klasses', 'klass_levels');
UPDATE customization.requirements SET entity_type = CASE entity_type WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' END WHERE entity_type IN ('powers', 'klasses', 'klass_levels');

-- The fields
UPDATE rules.field_defs SET field = CASE field WHEN 'KLASS_HD' THEN 'CLASS_HD' WHEN 'KLASS_CASTER_TYPE' THEN 'CLASS_CASTER_TYPE' WHEN 'KLASS_LEVEL_BAB' THEN 'CLASS_LEVEL_BAB' WHEN 'KLASS_LEVEL_SKILL_POINTS' THEN 'CLASS_LEVEL_SKILL_POINTS' WHEN 'KLASS_BONUS_SPELL_ABILITY_ID' THEN 'CLASS_BONUS_SPELL_ABILITY_ID' WHEN 'POWER_SAVE_EFFECT' THEN 'SPELL_SAVE_EFFECT' END WHERE field IN ('KLASS_HD', 'KLASS_CASTER_TYPE', 'KLASS_LEVEL_BAB', 'KLASS_LEVEL_SKILL_POINTS', 'KLASS_BONUS_SPELL_ABILITY_ID', 'POWER_SAVE_EFFECT');
UPDATE rules.entity_fields SET field = CASE field WHEN 'KLASS_HD' THEN 'CLASS_HD' WHEN 'KLASS_CASTER_TYPE' THEN 'CLASS_CASTER_TYPE' WHEN 'KLASS_LEVEL_BAB' THEN 'CLASS_LEVEL_BAB' WHEN 'KLASS_LEVEL_SKILL_POINTS' THEN 'CLASS_LEVEL_SKILL_POINTS' WHEN 'KLASS_BONUS_SPELL_ABILITY_ID' THEN 'CLASS_BONUS_SPELL_ABILITY_ID' WHEN 'POWER_SAVE_EFFECT' THEN 'SPELL_SAVE_EFFECT' END WHERE field IN ('KLASS_HD', 'KLASS_CASTER_TYPE', 'KLASS_LEVEL_BAB', 'KLASS_LEVEL_SKILL_POINTS', 'KLASS_BONUS_SPELL_ABILITY_ID', 'POWER_SAVE_EFFECT');
UPDATE rules.ruleset_fields SET field = CASE field WHEN 'KLASS_HD' THEN 'CLASS_HD' WHEN 'KLASS_CASTER_TYPE' THEN 'CLASS_CASTER_TYPE' WHEN 'KLASS_LEVEL_BAB' THEN 'CLASS_LEVEL_BAB' WHEN 'KLASS_LEVEL_SKILL_POINTS' THEN 'CLASS_LEVEL_SKILL_POINTS' WHEN 'KLASS_BONUS_SPELL_ABILITY_ID' THEN 'CLASS_BONUS_SPELL_ABILITY_ID' WHEN 'POWER_SAVE_EFFECT' THEN 'SPELL_SAVE_EFFECT' END WHERE field IN ('KLASS_HD', 'KLASS_CASTER_TYPE', 'KLASS_LEVEL_BAB', 'KLASS_LEVEL_SKILL_POINTS', 'KLASS_BONUS_SPELL_ABILITY_ID', 'POWER_SAVE_EFFECT');
UPDATE "character".fields SET field = CASE field WHEN 'KLASS_HD' THEN 'CLASS_HD' WHEN 'KLASS_CASTER_TYPE' THEN 'CLASS_CASTER_TYPE' WHEN 'KLASS_LEVEL_BAB' THEN 'CLASS_LEVEL_BAB' WHEN 'KLASS_LEVEL_SKILL_POINTS' THEN 'CLASS_LEVEL_SKILL_POINTS' WHEN 'KLASS_BONUS_SPELL_ABILITY_ID' THEN 'CLASS_BONUS_SPELL_ABILITY_ID' WHEN 'POWER_SAVE_EFFECT' THEN 'SPELL_SAVE_EFFECT' END WHERE field IN ('KLASS_HD', 'KLASS_CASTER_TYPE', 'KLASS_LEVEL_BAB', 'KLASS_LEVEL_SKILL_POINTS', 'KLASS_BONUS_SPELL_ABILITY_ID', 'POWER_SAVE_EFFECT');

-- The spells' level-up step
UPDATE "character".steps SET step = CASE step WHEN 'powers' THEN 'spells' END WHERE step IN ('powers');
UPDATE "character".advancement_picks SET step = CASE step WHEN 'powers' THEN 'spells' END WHERE step IN ('powers');

-- The target paths a customization names, and its formulas' (`[powers.…]`, `{{ 1 + powers.… }}`: a path anywhere in one)
UPDATE customization.modifiers SET target = regexp_replace(target, '^powers\.', 'spells.') WHERE target LIKE 'powers.%';
UPDATE customization.requirements SET target = regexp_replace(target, '^powers\.', 'spells.') WHERE target LIKE 'powers.%';
UPDATE customization.modifiers SET value = regexp_replace(value, '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])', '\1spells.', 'g') WHERE value ~ '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])';
UPDATE customization.requirements SET value = regexp_replace(value, '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])', '\1spells.', 'g') WHERE value ~ '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])';

-- What activities recorded: their types (`createKlassLevel` → `createClassLevel`, `updatePower` → `updateSpell`), tables and data
UPDATE account.activities SET type = replace(replace(type, 'Klass', 'Class'), 'Power', 'Spell') WHERE type ~ '^[a-z]+(Klass|Powers?)';
UPDATE account.activities SET target_table = CASE target_table WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' WHEN 'klass_skills' THEN 'class_skills' WHEN 'klass_level_feats' THEN 'class_level_feats' WHEN 'klass_level_powers' THEN 'class_level_spells' WHEN 'klass_level_saves' THEN 'class_level_saves' WHEN 'powers_aptitudes' THEN 'spells_aptitudes' END WHERE target_table IN ('powers', 'klasses', 'klass_levels', 'klass_skills', 'klass_level_feats', 'klass_level_powers', 'klass_level_saves', 'powers_aptitudes');
UPDATE account.activities SET data = regexp_replace(data::text, '("entityType"\s*:\s*")powers"', '\1spells"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"powers"';
UPDATE account.activities SET data = regexp_replace(data::text, '("entityType"\s*:\s*")klasses"', '\1classes"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"klasses"';
UPDATE account.activities SET data = regexp_replace(data::text, '("entityType"\s*:\s*")klass_levels"', '\1class_levels"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"klass_levels"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_HD"', '\1CLASS_HD"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_HD"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_CASTER_TYPE"', '\1CLASS_CASTER_TYPE"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_CASTER_TYPE"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_LEVEL_BAB"', '\1CLASS_LEVEL_BAB"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_LEVEL_BAB"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_LEVEL_SKILL_POINTS"', '\1CLASS_LEVEL_SKILL_POINTS"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_LEVEL_SKILL_POINTS"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_BONUS_SPELL_ABILITY_ID"', '\1CLASS_BONUS_SPELL_ABILITY_ID"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_BONUS_SPELL_ABILITY_ID"';
UPDATE account.activities SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")POWER_SAVE_EFFECT"', '\1SPELL_SAVE_EFFECT"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"POWER_SAVE_EFFECT"';
UPDATE account.activities SET data = regexp_replace(data::text, '("target"\s*:\s*")powers\.', '\1spells.', 'g')::json WHERE data::text ~ '"target"\s*:\s*"powers\.';
UPDATE account.activities SET data = regexp_replace(data::text, '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])', '\1spells.', 'g')::json WHERE data::text ~ '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])';

-- What notifications recorded: their types (`createKlassLevel` → `createClassLevel`, `updatePower` → `updateSpell`), tables and data
UPDATE account.notifications SET type = replace(replace(type, 'Klass', 'Class'), 'Power', 'Spell') WHERE type ~ '^[a-z]+(Klass|Powers?)';
UPDATE account.notifications SET target_table = CASE target_table WHEN 'powers' THEN 'spells' WHEN 'klasses' THEN 'classes' WHEN 'klass_levels' THEN 'class_levels' WHEN 'klass_skills' THEN 'class_skills' WHEN 'klass_level_feats' THEN 'class_level_feats' WHEN 'klass_level_powers' THEN 'class_level_spells' WHEN 'klass_level_saves' THEN 'class_level_saves' WHEN 'powers_aptitudes' THEN 'spells_aptitudes' END WHERE target_table IN ('powers', 'klasses', 'klass_levels', 'klass_skills', 'klass_level_feats', 'klass_level_powers', 'klass_level_saves', 'powers_aptitudes');
UPDATE account.notifications SET data = regexp_replace(data::text, '("entityType"\s*:\s*")powers"', '\1spells"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"powers"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("entityType"\s*:\s*")klasses"', '\1classes"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"klasses"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("entityType"\s*:\s*")klass_levels"', '\1class_levels"', 'g')::json WHERE data::text ~ '"entityType"\s*:\s*"klass_levels"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_HD"', '\1CLASS_HD"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_HD"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_CASTER_TYPE"', '\1CLASS_CASTER_TYPE"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_CASTER_TYPE"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_LEVEL_BAB"', '\1CLASS_LEVEL_BAB"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_LEVEL_BAB"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_LEVEL_SKILL_POINTS"', '\1CLASS_LEVEL_SKILL_POINTS"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_LEVEL_SKILL_POINTS"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")KLASS_BONUS_SPELL_ABILITY_ID"', '\1CLASS_BONUS_SPELL_ABILITY_ID"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"KLASS_BONUS_SPELL_ABILITY_ID"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("propertyType"\s*:\s*")POWER_SAVE_EFFECT"', '\1SPELL_SAVE_EFFECT"', 'g')::json WHERE data::text ~ '"propertyType"\s*:\s*"POWER_SAVE_EFFECT"';
UPDATE account.notifications SET data = regexp_replace(data::text, '("target"\s*:\s*")powers\.', '\1spells.', 'g')::json WHERE data::text ~ '"target"\s*:\s*"powers\.';
UPDATE account.notifications SET data = regexp_replace(data::text, '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])', '\1spells.', 'g')::json WHERE data::text ~ '(^|[^A-Za-z0-9_.])powers\.(?=[A-Za-z_])';

-- The foreign keys, as they were
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_step_entity_type_fkey FOREIGN KEY (step, entity_type) REFERENCES "character".steps(step, entity_type);
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_step_has_entity_has_via_fkey FOREIGN KEY (step, has_entity, has_via) REFERENCES "character".steps(step, has_entity, has_via);
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_step_repeats_fkey FOREIGN KEY (step, repeats) REFERENCES "character".steps(step, repeats) ON UPDATE CASCADE;
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_step_via_type_fkey FOREIGN KEY (step, via_type) REFERENCES "character".steps(step, via_type);
ALTER TABLE "character".advancement_picks ADD CONSTRAINT advancement_picks_via_id_via_type_fkey FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "character".advancements ADD CONSTRAINT advancements_track_id_track_type_fkey FOREIGN KEY (track_id, track_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "character".character_roles ADD CONSTRAINT character_roles_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
ALTER TABLE "character".fields ADD CONSTRAINT fields_owner_type_field_value_kind_multiple_fkey FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
ALTER TABLE "character".inventory ADD CONSTRAINT inventory_item_entity_fkey FOREIGN KEY (item_id, item_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "character".inventory ADD CONSTRAINT inventory_item_type_fkey FOREIGN KEY (item_type) REFERENCES "character".item_types(entity_type);
ALTER TABLE "character".item_types ADD CONSTRAINT item_types_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
ALTER TABLE "character".links ADD CONSTRAINT links_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "character".links ADD CONSTRAINT links_role_entity_type_single_fkey FOREIGN KEY (role, entity_type, single) REFERENCES "character".character_roles(role, entity_type, single) ON UPDATE CASCADE;
ALTER TABLE "character".steps ADD CONSTRAINT steps_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
ALTER TABLE "character".steps ADD CONSTRAINT steps_via_type_fkey FOREIGN KEY (via_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.entities ADD CONSTRAINT entities_owner_id_owner_type_fkey FOREIGN KEY (owner_id, owner_type) REFERENCES rules.entities(id, type) MATCH FULL ON DELETE CASCADE;
ALTER TABLE rules.entities ADD CONSTRAINT entities_type_owned_fkey FOREIGN KEY (type, owned) REFERENCES rules.entity_types(type, owned);
ALTER TABLE rules.entities ADD CONSTRAINT entities_type_owner_type_fkey FOREIGN KEY (type, owner_type) REFERENCES rules.entity_types(type, owner_type);
ALTER TABLE rules.entity_fields ADD CONSTRAINT entity_fields_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE;
ALTER TABLE rules.entity_fields ADD CONSTRAINT entity_fields_entity_type_field_value_kind_multiple_fkey FOREIGN KEY (entity_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_from_id_from_type_fkey FOREIGN KEY (from_id, from_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE;
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_role_from_type_to_type_has_via_fkey FOREIGN KEY (role, from_type, to_type, has_via) REFERENCES rules.link_roles(role, from_type, to_type, has_via);
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_role_from_type_to_type_single_fkey FOREIGN KEY (role, from_type, to_type, single) REFERENCES rules.link_roles(role, from_type, to_type, single) ON UPDATE CASCADE;
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_role_from_type_to_type_via_type_fkey FOREIGN KEY (role, from_type, to_type, via_type) REFERENCES rules.link_roles(role, from_type, to_type, via_type) ON UPDATE CASCADE;
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_to_id_to_type_fkey FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE rules.entity_links ADD CONSTRAINT entity_links_via_id_via_type_fkey FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE rules.entity_types ADD CONSTRAINT entity_types_owner_type_fkey FOREIGN KEY (owner_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.field_defs ADD CONSTRAINT field_defs_inherits_via_entity_type_entity_type_inherits_s_fkey FOREIGN KEY (inherits_via, entity_type, entity_type, inherits_single) REFERENCES rules.link_roles(role, from_type, to_type, single);
ALTER TABLE rules.link_role_kinds ADD CONSTRAINT link_role_kinds_from_type_fkey FOREIGN KEY (from_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_from_type_fkey FOREIGN KEY (from_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_role_from_type_single_fkey FOREIGN KEY (role, from_type, single) REFERENCES rules.link_role_kinds(role, from_type, single) ON UPDATE CASCADE;
ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_to_type_fkey FOREIGN KEY (to_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.link_roles ADD CONSTRAINT link_roles_via_type_fkey FOREIGN KEY (via_type) REFERENCES rules.entity_types(type);
ALTER TABLE rules.ruleset_fields ADD CONSTRAINT ruleset_fields_owner_type_field_value_kind_multiple_fkey FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
ALTER TABLE rules.ruleset_links ADD CONSTRAINT ruleset_links_role_to_type_fkey FOREIGN KEY (role, to_type) REFERENCES rules.ruleset_roles(role, to_type);
ALTER TABLE rules.ruleset_links ADD CONSTRAINT ruleset_links_to_id_to_type_fkey FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE rules.ruleset_roles ADD CONSTRAINT ruleset_roles_to_type_fkey FOREIGN KEY (to_type) REFERENCES rules.entity_types(type);

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
