CREATE TEMP TABLE before_characters ON COMMIT DROP AS SELECT id, last_changed_at, updated_at FROM character.characters;
-- Phase 4, revision 7: the generic tables.
--
-- Registries (`entity_types`, `field_defs`, `link_roles`, `ruleset_roles`, `character_roles`, `steps`, `item_types`) hold
-- what the registered modules declare, synced on migrate; a sync refuses a declaration that conflicts with another
-- module's (names are global). Typed rows carry what their registry row requires (`single`, `owned`, `has_*`) so a
-- foreign key checks it, and a partial unique index enforces a single role.
-- Every reference that doesn't own its row is `DEFERRABLE INITIALLY DEFERRED` NO ACTION: a cascade that deletes both
-- ends commits, whatever order its rows sit in; a reference left dangling is refused at commit. What deleting a
-- referenced entity does is each role's or step's rule, applied by `apply_delete_rules` on every path.

-- Registries -----------------------------------------------------------------------------------------------------------

-- The registered modules, by the base rules their rulesets name
CREATE TABLE rules.modules (
  base_rules text PRIMARY KEY
);

CREATE TABLE rules.entity_types (
  type text PRIMARY KEY,
  owner_type text REFERENCES rules.entity_types(type),
  owned boolean GENERATED ALWAYS AS (owner_type IS NOT NULL) STORED,
  UNIQUE (type, owner_type),
  UNIQUE (type, owned)
);

-- A role is single or not for its from-type, whatever it points at
CREATE TABLE rules.link_role_kinds (
  role text NOT NULL,
  from_type text NOT NULL REFERENCES rules.entity_types(type),
  single boolean NOT NULL,
  PRIMARY KEY (role, from_type),
  UNIQUE (role, from_type, single)
);

CREATE TABLE rules.link_roles (
  role text NOT NULL,
  from_type text NOT NULL REFERENCES rules.entity_types(type),
  to_type text NOT NULL REFERENCES rules.entity_types(type),
  via_type text REFERENCES rules.entity_types(type),
  has_via boolean GENERATED ALWAYS AS (via_type IS NOT NULL) STORED,
  single boolean NOT NULL,
  on_delete text NOT NULL CHECK (on_delete IN ('refuse', 'unlink', 'delete')),
  via_on_delete text NOT NULL CHECK (via_on_delete IN ('refuse', 'unlink')),
  merge text NOT NULL CHECK (merge IN ('winner', 'fallback', 'union')),
  PRIMARY KEY (role, from_type, to_type),
  UNIQUE (role, from_type, to_type, single),
  UNIQUE (role, from_type, to_type, has_via),
  UNIQUE (role, from_type, to_type, via_type),
  FOREIGN KEY (role, from_type, single) REFERENCES rules.link_role_kinds(role, from_type, single) ON UPDATE CASCADE,
  CHECK (NOT single OR merge <> 'union')
);

CREATE TABLE rules.field_defs (
  owner_kind text NOT NULL CHECK (owner_kind IN ('entity', 'ruleset', 'character')),
  owner_type text NOT NULL,
  entity_type text GENERATED ALWAYS AS (CASE WHEN owner_kind = 'entity' THEN owner_type END) STORED
    REFERENCES rules.entity_types(type),
  field text NOT NULL,
  value_kind text NOT NULL CHECK (value_kind IN ('text', 'number', 'flag')),
  multiple boolean NOT NULL,
  -- `fallback`: the winning copy's value, else the first sibling's; `winner`: the winning copy's or none; `union`: all
  merge text NOT NULL CHECK (merge IN ('winner', 'fallback', 'union')),
  -- The role an entity follows to read the field off another when it has none (3.5's items, by `madeFrom`)
  inherits_via text,
  inherits_single boolean GENERATED ALWAYS AS (CASE WHEN inherits_via IS NOT NULL THEN true END) STORED,
  PRIMARY KEY (owner_type, field),
  UNIQUE (owner_type, field, value_kind, multiple),
  -- One hop, along a single-valued role from the type to itself (an item's template)
  FOREIGN KEY (inherits_via, entity_type, entity_type, inherits_single) REFERENCES rules.link_roles(role, from_type, to_type, single),
  CHECK ((owner_kind = 'ruleset') = (owner_type = 'rulesets') AND (owner_kind = 'character') = (owner_type = 'characters')),
  CHECK (multiple OR merge <> 'union'),
  CHECK (owner_kind = 'entity' OR inherits_via IS NULL)
);

CREATE TABLE rules.ruleset_roles (
  role text PRIMARY KEY,
  to_type text NOT NULL REFERENCES rules.entity_types(type),
  on_delete text NOT NULL CHECK (on_delete IN ('refuse', 'unlink')),
  UNIQUE (role, to_type)
);

CREATE TABLE character.character_roles (
  role text PRIMARY KEY,
  entity_type text NOT NULL REFERENCES rules.entity_types(type),
  single boolean NOT NULL,
  on_delete text NOT NULL CHECK (on_delete IN ('refuse', 'delete')),
  UNIQUE (role, entity_type, single)
);

CREATE TABLE character.steps (
  step text PRIMARY KEY,
  entity_type text REFERENCES rules.entity_types(type),
  via_type text REFERENCES rules.entity_types(type),
  has_entity boolean GENERATED ALWAYS AS (entity_type IS NOT NULL) STORED,
  has_via boolean GENERATED ALWAYS AS (via_type IS NOT NULL) STORED,
  on_delete text NOT NULL CHECK (on_delete IN ('refuse', 'delete')),
  -- Whether a step picks one entity more than once at an advancement (3.5's stackable feats)
  repeats boolean NOT NULL,
  UNIQUE (step, has_entity, has_via),
  UNIQUE (step, repeats),
  UNIQUE (step, entity_type),
  UNIQUE (step, via_type)
);

CREATE TABLE character.item_types (
  entity_type text PRIMARY KEY REFERENCES rules.entity_types(type)
);

-- Rules ----------------------------------------------------------------------------------------------------------------

CREATE TABLE rules.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL REFERENCES rules.rulesets(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaign.campaigns(id) ON DELETE CASCADE,
  -- The campaign as a key: an owned child is in its owner's ruleset and campaign
  campaign_key uuid GENERATED ALWAYS AS (coalesce(campaign_id, '00000000-0000-0000-0000-000000000000')) STORED,
  type text NOT NULL,
  name text,
  description text,
  owner_id uuid,
  owner_type text,
  owned boolean GENERATED ALWAYS AS (owner_id IS NOT NULL) STORED,
  position integer,
  partition text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, type),
  UNIQUE (id, ruleset_id, campaign_key),
  FOREIGN KEY (type, owned) REFERENCES rules.entity_types(type, owned),
  FOREIGN KEY (type, owner_type) REFERENCES rules.entity_types(type, owner_type),
  FOREIGN KEY (owner_id, owner_type) REFERENCES rules.entities(id, type) MATCH FULL ON DELETE CASCADE,
  FOREIGN KEY (owner_id, ruleset_id, campaign_key) REFERENCES rules.entities(id, ruleset_id, campaign_key) ON DELETE CASCADE,
  CHECK (name IS NOT NULL OR (owner_id IS NOT NULL AND position IS NOT NULL))
);
CREATE UNIQUE INDEX entities_without_campaign_unique_idx ON rules.entities (ruleset_id, type, partition, name)
  WHERE campaign_id IS NULL AND name IS NOT NULL;
CREATE UNIQUE INDEX entities_with_campaign_unique_idx ON rules.entities (ruleset_id, campaign_id, type, partition, name)
  WHERE campaign_id IS NOT NULL AND name IS NOT NULL;
CREATE UNIQUE INDEX entities_owner_position_unique_idx ON rules.entities (owner_id, position) WHERE owner_id IS NOT NULL;
CREATE INDEX entities_ruleset_type_campaign_idx ON rules.entities (ruleset_id, type, campaign_id);
CREATE INDEX entities_campaign_idx ON rules.entities (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX entities_search_idx ON rules.entities USING gin (name gin_trgm_ops, description gin_trgm_ops);

-- An entity's fields, its ruleset's settings, a character's fields: one typed value per row, a set by ordinal (a key,
-- not the order a reader shows them in), no value twice
CREATE TABLE rules.entity_fields (
  entity_id uuid NOT NULL,
  entity_type text NOT NULL,
  field text NOT NULL,
  ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  value_kind text NOT NULL,
  multiple boolean NOT NULL,
  text_value text,
  number_value numeric CHECK (number_value NOT IN ('NaN', 'Infinity', '-Infinity')),
  flag_value boolean,
  -- A value as a key of any length: what a set's no-value-twice index compares
  value_key text GENERATED ALWAYS AS (coalesce(md5(text_value), trim_scale(number_value)::text, flag_value::text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, field, ordinal),
  FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE,
  FOREIGN KEY (entity_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple)
    ON UPDATE CASCADE,
  CHECK (multiple OR ordinal = 0),
  CHECK ((text_value IS NOT NULL) = (value_kind = 'text') AND (number_value IS NOT NULL) = (value_kind = 'number')
    AND (flag_value IS NOT NULL) = (value_kind = 'flag'))
);
-- No value twice in a set, whatever its length (a btree key holds at most 2704 bytes: `value_key` hashes a text)
CREATE UNIQUE INDEX entity_fields_set_value_idx ON rules.entity_fields (entity_id, field, value_key) WHERE multiple;
CREATE INDEX entity_fields_text_idx ON rules.entity_fields USING hash (text_value);

CREATE TABLE rules.ruleset_fields (
  ruleset_id uuid NOT NULL REFERENCES rules.rulesets(id) ON DELETE CASCADE,
  owner_type text NOT NULL DEFAULT 'rulesets' CHECK (owner_type = 'rulesets'),
  field text NOT NULL,
  ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  value_kind text NOT NULL,
  multiple boolean NOT NULL,
  text_value text,
  number_value numeric CHECK (number_value NOT IN ('NaN', 'Infinity', '-Infinity')),
  flag_value boolean,
  -- A value as a key of any length: what a set's no-value-twice index compares
  value_key text GENERATED ALWAYS AS (coalesce(md5(text_value), trim_scale(number_value)::text, flag_value::text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ruleset_id, field, ordinal),
  FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple)
    ON UPDATE CASCADE,
  CHECK (multiple OR ordinal = 0),
  CHECK ((text_value IS NOT NULL) = (value_kind = 'text') AND (number_value IS NOT NULL) = (value_kind = 'number')
    AND (flag_value IS NOT NULL) = (value_kind = 'flag'))
);

CREATE UNIQUE INDEX ruleset_fields_set_value_idx ON rules.ruleset_fields (ruleset_id, field, value_key) WHERE multiple;

CREATE TABLE rules.entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id uuid NOT NULL,
  from_type text NOT NULL,
  role text NOT NULL,
  single boolean NOT NULL,
  to_id uuid NOT NULL,
  to_type text NOT NULL,
  via_id uuid,
  via_type text,
  has_via boolean GENERATED ALWAYS AS (via_id IS NOT NULL) STORED,
  tier integer,
  amount integer,
  free boolean NOT NULL DEFAULT false,
  ordinal integer NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (from_id, from_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE,
  FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (role, from_type, to_type, single) REFERENCES rules.link_roles(role, from_type, to_type, single)
    ON UPDATE CASCADE,
  FOREIGN KEY (role, from_type, to_type, has_via) REFERENCES rules.link_roles(role, from_type, to_type, has_via),
  FOREIGN KEY (role, from_type, to_type, via_type) REFERENCES rules.link_roles(role, from_type, to_type, via_type)
    ON UPDATE CASCADE,
  UNIQUE (from_id, role, to_id)
);
CREATE UNIQUE INDEX entity_links_single_idx ON rules.entity_links (from_id, role) WHERE single;
CREATE INDEX entity_links_to_idx ON rules.entity_links (to_id, role);
CREATE INDEX entity_links_via_idx ON rules.entity_links (via_id) WHERE via_id IS NOT NULL;

CREATE TABLE rules.ruleset_links (
  ruleset_id uuid NOT NULL REFERENCES rules.rulesets(id) ON DELETE CASCADE,
  role text NOT NULL,
  to_id uuid NOT NULL,
  to_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ruleset_id, role),
  FOREIGN KEY (role, to_type) REFERENCES rules.ruleset_roles(role, to_type),
  FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ruleset_links_to_idx ON rules.ruleset_links (to_id);

-- Characters -----------------------------------------------------------------------------------------------------------

CREATE TABLE character.fields (
  character_id uuid NOT NULL REFERENCES character.characters(id) ON DELETE CASCADE,
  owner_type text NOT NULL DEFAULT 'characters' CHECK (owner_type = 'characters'),
  field text NOT NULL,
  ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  value_kind text NOT NULL,
  multiple boolean NOT NULL,
  text_value text,
  number_value numeric CHECK (number_value NOT IN ('NaN', 'Infinity', '-Infinity')),
  flag_value boolean,
  -- A value as a key of any length: what a set's no-value-twice index compares
  value_key text GENERATED ALWAYS AS (coalesce(md5(text_value), trim_scale(number_value)::text, flag_value::text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, field, ordinal),
  FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple)
    ON UPDATE CASCADE,
  CHECK (multiple OR ordinal = 0),
  CHECK ((text_value IS NOT NULL) = (value_kind = 'text') AND (number_value IS NOT NULL) = (value_kind = 'number')
    AND (flag_value IS NOT NULL) = (value_kind = 'flag'))
);

CREATE UNIQUE INDEX fields_set_value_idx ON character.fields (character_id, field, value_key) WHERE multiple;

CREATE TABLE character.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES character.characters(id) ON DELETE CASCADE,
  role text NOT NULL,
  single boolean NOT NULL,
  entity_id uuid NOT NULL,
  entity_type text NOT NULL,
  amount integer,
  ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (role, entity_type, single) REFERENCES character.character_roles(role, entity_type, single) ON UPDATE CASCADE,
  FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (character_id, role, entity_id, ordinal)
);
CREATE UNIQUE INDEX links_single_idx ON character.links (character_id, role) WHERE single;
CREATE INDEX links_entity_idx ON character.links (entity_id);

CREATE TABLE character.advancements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES character.characters(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  track_id uuid,
  track_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  FOREIGN KEY (track_id, track_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED
);
-- A live advancement per position, as today's levels: an archived character's levels don't hold theirs
CREATE UNIQUE INDEX advancements_character_position_idx ON character.advancements (character_id, position)
  WHERE deleted_at IS NULL;
CREATE INDEX advancements_track_idx ON character.advancements (track_id) WHERE track_id IS NOT NULL;

CREATE TABLE character.advancement_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advancement_id uuid NOT NULL REFERENCES character.advancements(id) ON DELETE CASCADE,
  step text NOT NULL,
  entity_id uuid,
  entity_type text,
  via_id uuid,
  via_type text,
  has_entity boolean GENERATED ALWAYS AS (entity_id IS NOT NULL) STORED,
  has_via boolean GENERATED ALWAYS AS (via_id IS NOT NULL) STORED,
  -- The entity as a key: a value step (hit points) picks none, and holds one pick per advancement
  entity_key uuid GENERATED ALWAYS AS (coalesce(entity_id, '00000000-0000-0000-0000-000000000000')) STORED,
  amount integer,
  ordinal smallint NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
  repeats boolean NOT NULL,
  tier integer,
  parent_pick_id uuid REFERENCES character.advancement_picks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (step, has_entity, has_via) REFERENCES character.steps(step, has_entity, has_via),
  FOREIGN KEY (step, repeats) REFERENCES character.steps(step, repeats) ON UPDATE CASCADE,
  CHECK (repeats OR ordinal = 0),
  FOREIGN KEY (step, entity_type) REFERENCES character.steps(step, entity_type),
  FOREIGN KEY (step, via_type) REFERENCES character.steps(step, via_type),
  FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX advancement_picks_unique_idx ON character.advancement_picks (advancement_id, step, entity_key, ordinal);
CREATE INDEX advancement_picks_entity_idx ON character.advancement_picks (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX advancement_picks_via_idx ON character.advancement_picks (via_id) WHERE via_id IS NOT NULL;
CREATE INDEX advancement_picks_parent_idx ON character.advancement_picks (parent_pick_id) WHERE parent_pick_id IS NOT NULL;

ALTER TABLE character.inventory
  ADD COLUMN item_type text,
  ADD COLUMN location_text text,
  ADD COLUMN groups smallint[] DEFAULT '{}';

-- An entity's customizations are found by their owner: a full index, which the delete triggers use
CREATE INDEX modifiers_source_idx ON customization.modifiers (source_id, source_type);
DROP INDEX customization.modifiers_source_id_source_type_idx;

-- What deleting a referenced entity does, on every path (an app delete, an owner's or a ruleset's cascade, a purge) ----

CREATE FUNCTION rules.apply_delete_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Entities a role deletes with what they point at (a save with its key ability)
  DELETE FROM rules.entities e USING rules.entity_links l, rules.link_roles r
   WHERE l.to_id = OLD.id AND r.role = l.role AND r.from_type = l.from_type AND r.to_type = l.to_type
     AND r.on_delete = 'delete' AND e.id = l.from_id;
  DELETE FROM rules.entity_links l USING rules.link_roles r
   WHERE r.role = l.role AND r.from_type = l.from_type AND r.to_type = l.to_type
     AND ((l.to_id = OLD.id AND r.on_delete = 'unlink') OR (l.via_id = OLD.id AND r.via_on_delete = 'unlink'));
  DELETE FROM rules.ruleset_links l USING rules.ruleset_roles r
   WHERE l.to_id = OLD.id AND r.role = l.role AND r.on_delete = 'unlink';
  DELETE FROM character.links l USING character.character_roles r
   WHERE l.entity_id = OLD.id AND r.role = l.role AND r.on_delete = 'delete';
  DELETE FROM character.advancement_picks p USING character.steps s
   WHERE p.entity_id = OLD.id AND s.step = p.step AND s.on_delete = 'delete';
  RETURN NULL;
END $$;

-- Customizations owned by the deleted entities, once per statement (polymorphic, so no foreign key)
CREATE FUNCTION rules.delete_entity_customizations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM deleted_rows) THEN
    RETURN NULL;
  END IF;
  DELETE FROM customization.modifiers m USING deleted_rows d WHERE m.source_id = d.id AND m.source_type = d.type;
  DELETE FROM customization.requirements r USING deleted_rows d WHERE r.entity_id = d.id AND r.entity_type = d.type;
  RETURN NULL;
END $$;

-- A registry sync (a rename, a flip) rewrites characters' rows without changing them: their last change doesn't move
CREATE OR REPLACE FUNCTION character.touch_characters(character_ids uuid[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  master_ids uuid[];
BEGIN
  IF current_setting('arkyvree.registry_sync', true) = 'on' THEN
    RETURN;
  END IF;
  master_ids := ARRAY(
    SELECT parent_character_id FROM character.characters
    WHERE id = ANY (character_ids) AND parent_character_id IS NOT NULL
  );
  -- Its updates fire the characters' statement triggers, which call this again with the masters of the rows they
  -- wrote, even of none: an empty list runs no update, which ends it
  IF cardinality(master_ids) > 0 THEN
    UPDATE character.characters SET last_changed_at = now() WHERE id = ANY (master_ids) AND last_changed_at < now();
  END IF;
  IF cardinality(character_ids) > 0 THEN
    UPDATE character.characters SET last_changed_at = now() WHERE id = ANY (character_ids) AND last_changed_at < now();
  END IF;
END $$;
CREATE TEMP TABLE prop_defs (owner_kind text, owner_type text, field text, value_kind text, multiple boolean, inherits boolean, merge text) ON COMMIT DROP;
INSERT INTO prop_defs VALUES
  ('entity', 'feats', 'FEAT_FAMILY', 'text', true, false, 'union'),
  ('entity', 'feats', 'FEAT_WEAPON_FINESSE', 'flag', false, false, 'winner'),
  ('entity', 'feats', 'FEAT_OVERSIZED_TWO_WEAPON_FIGHTING', 'flag', false, false, 'winner'),
  ('entity', 'feats', 'WIZARD_PROHIBITED_SCHOOL', 'text', true, false, 'union'),
  ('entity', 'items', 'WEAPON_TYPE', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_PROFICIENCY', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_FAMILY', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_SIZE', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_BASE_DAMAGE', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_DOUBLE_DAMAGE', 'text', false, true, 'winner'),
  ('entity', 'items', 'DAMAGE_TYPE', 'text', true, true, 'union'),
  ('entity', 'items', 'WEAPON_CRITICAL_RANGE', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_CRITICAL_MULTIPLIER', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_STRENGTH_DAMAGE', 'text', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_MIGHTY', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_RANGED', 'flag', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_RANGE', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_MAX_RANGE_INCREMENTS', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_REACH', 'number', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_FINESSABLE', 'flag', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_ONE_HAND_TRAINING', 'flag', false, true, 'winner'),
  ('entity', 'items', 'WEAPON_ONE_HANDED_PENALTY', 'number', false, true, 'winner'),
  ('entity', 'items', 'ARMOR_TYPE', 'text', false, true, 'winner'),
  ('entity', 'items', 'ARMOR_PROFICIENCY', 'text', false, true, 'winner'),
  ('entity', 'items', 'ARMOR_AC_BONUS', 'number', false, true, 'winner'),
  ('entity', 'items', 'SHIELD_TYPE', 'text', false, true, 'winner'),
  ('entity', 'items', 'SHIELD_PROFICIENCY', 'text', false, true, 'winner'),
  ('entity', 'items', 'SHIELD_AC_BONUS', 'number', false, true, 'winner'),
  ('entity', 'items', 'ARMOR_MAX_DEX', 'number', false, true, 'winner'),
  ('entity', 'items', 'ARMOR_CHECK_PENALTY', 'number', false, true, 'winner'),
  ('entity', 'items', 'ITEM_SPELL_FAILURE', 'number', false, true, 'winner'),
  ('entity', 'items', 'ITEM_MASTERWORK', 'flag', false, true, 'winner'),
  ('entity', 'items', 'ITEM_MADE_OF', 'text', false, true, 'winner'),
  ('entity', 'items', 'ITEM_HAS_CHARGES', 'number', false, true, 'winner'),
  ('entity', 'items', 'MAGIC_CASTER_LEVEL', 'number', false, true, 'winner'),
  ('entity', 'items', 'MAGIC_AURA', 'text', true, true, 'union'),
  ('entity', 'klasses', 'KLASS_CASTER_TYPE', 'text', false, false, 'winner'),
  ('entity', 'klass_levels', 'KLASS_LEVEL_BAB', 'number', false, false, 'winner'),
  ('entity', 'klass_levels', 'KLASS_LEVEL_SKILL_POINTS', 'number', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_SCHOOL', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_SUBSCHOOL', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_DESCRIPTOR', 'text', true, false, 'union'),
  ('entity', 'powers', 'SPELL_COMPONENT', 'text', true, false, 'union'),
  ('entity', 'powers', 'SPELL_CASTING_TIME', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_RANGE_TYPE', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_TARGET', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_EFFECT', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_AREA_OF_EFFECT', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_DURATION', 'text', false, false, 'winner'),
  ('entity', 'powers', 'SPELL_RESISTANCE', 'text', false, false, 'winner'),
  ('entity', 'races', 'RACE_SPEED_IGNORES_ENCUMBRANCE', 'flag', false, false, 'winner'),
  ('entity', 'races', 'RACE_QUADRUPED', 'flag', false, false, 'winner'),
  ('ruleset', 'rulesets', 'RULESET_FEAT_ADVANCEMENT', 'text', true, false, 'union'),
  ('ruleset', 'rulesets', 'RULESET_ABILITY_INCREASES', 'text', true, false, 'union'),
  ('entity', 'skills', 'SKILL_IMPACTED_BY_WEIGHT', 'flag', false, false, 'winner'),
  ('entity', 'skills', 'SKILL_CHECK_PENALTY_MULTIPLIER', 'number', false, false, 'winner'),
  ('entity', 'skills', 'SKILL_USABLE_WITHOUT_TRAINING', 'flag', false, false, 'winner')
;
-- Phase 4, revision 7: copy today's rows into the generic tables, every id kept. Runs in the migration's transaction.

-- Today's data must fit before anything moves. Each check names what it found; any finding aborts the migration.
DO $$
DECLARE finding text; described bigint;
BEGIN
  SELECT string_agg(DISTINCT entity_type || '.' || type, ', ') INTO finding FROM customization.properties p
   WHERE NOT EXISTS (SELECT 1 FROM pg_temp.prop_defs d WHERE d.owner_type = p.entity_type AND d.field = p.type)
     AND (entity_type, type) NOT IN (('klasses', 'KLASS_BONUS_SPELL_ABILITY_ID'), ('rulesets', 'RULESET_SKILL_POINT_ABILITY_ID'));
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Properties no field declares: %', finding; END IF;

  SELECT string_agg(DISTINCT entity_type || '.' || type, ', ') INTO finding FROM customization.properties
   WHERE deleted_at IS NOT NULL;
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Soft-deleted properties, which no reader shows: %', finding; END IF;

  SELECT string_agg(DISTINCT p.entity_type, ', ') INTO finding FROM customization.properties p
   WHERE NOT EXISTS (
     SELECT 1 FROM rules.feats x WHERE x.id = p.entity_id AND p.entity_type = 'feats'
     UNION ALL SELECT 1 FROM rules.items x WHERE x.id = p.entity_id AND p.entity_type = 'items'
     UNION ALL SELECT 1 FROM rules.klasses x WHERE x.id = p.entity_id AND p.entity_type = 'klasses'
     UNION ALL SELECT 1 FROM rules.klass_levels x WHERE x.id = p.entity_id AND p.entity_type = 'klass_levels'
     UNION ALL SELECT 1 FROM rules.powers x WHERE x.id = p.entity_id AND p.entity_type = 'powers'
     UNION ALL SELECT 1 FROM rules.races x WHERE x.id = p.entity_id AND p.entity_type = 'races'
     UNION ALL SELECT 1 FROM rules.skills x WHERE x.id = p.entity_id AND p.entity_type = 'skills'
     UNION ALL SELECT 1 FROM rules.rulesets x WHERE x.id = p.entity_id AND p.entity_type = 'rulesets');
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Properties whose owner is gone, on: %', finding; END IF;

  SELECT string_agg(DISTINCT kind, ', ') INTO finding FROM (
    SELECT p.entity_type || '.' || p.type AS kind FROM customization.properties p
    LEFT JOIN pg_temp.prop_defs d ON d.owner_type = p.entity_type AND d.field = p.type
    WHERE coalesce(d.multiple, false) = false GROUP BY p.entity_id, p.entity_type, p.type HAVING count(*) > 1) x;
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Single-valued properties holding several values: %', finding; END IF;

  SELECT string_agg(DISTINCT p.type || ' = ' || p.value, ', ') INTO finding FROM customization.properties p
   JOIN pg_temp.prop_defs d ON d.owner_type = p.entity_type AND d.field = p.type
   WHERE (d.value_kind = 'number' AND p.value !~ '^-?[0-9]+(\.[0-9]+)?$')
      OR (d.value_kind = 'flag' AND p.value NOT IN ('true', 'false'));
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Values their field''s kind doesn''t read: %', finding; END IF;

  SELECT string_agg(DISTINCT p.type || ' = ' || p.value, ', ') INTO finding FROM customization.properties p
   WHERE p.type IN ('KLASS_BONUS_SPELL_ABILITY_ID', 'RULESET_SKILL_POINT_ABILITY_ID')
     AND NOT EXISTS (SELECT 1 FROM rules.abilities a WHERE a.id::text = lower(p.value));
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Ability ids naming no ability: %', finding; END IF;

  SELECT string_agg(DISTINCT p.type || ' = ' || p.value, ', ') INTO finding FROM customization.properties p
   JOIN pg_temp.prop_defs d ON d.owner_type = p.entity_type AND d.field = p.type
   WHERE CASE WHEN d.value_kind = 'number' AND p.value ~ '^-?[0-9]+(\.[0-9]+)?$' THEN p.value::numeric::text <> p.value ELSE false END;
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Numbers whose text a number doesn''t keep: %', finding; END IF;

  SELECT string_agg(DISTINCT t, ', ') INTO finding FROM (
    SELECT 'rules.feats_aptitudes' AS t FROM rules.feats_aptitudes WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'rules.powers_aptitudes' FROM rules.powers_aptitudes WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'rules.klass_skills' FROM rules.klass_skills WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'rules.klass_level_feats' FROM rules.klass_level_feats WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'rules.klass_level_powers' FROM rules.klass_level_powers WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'rules.klass_level_saves' FROM rules.klass_level_saves WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.character_abilities' FROM character.character_abilities WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.languages' FROM character.languages WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.level_ability_increases' FROM character.level_ability_increases WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.level_feats' FROM character.level_feats WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.level_powers' FROM character.level_powers WHERE deleted_at IS NOT NULL
    UNION ALL SELECT 'character.level_skills' FROM character.level_skills WHERE deleted_at IS NOT NULL) x;
  IF finding IS NOT NULL THEN RAISE EXCEPTION 'Soft-deleted links or picks, which the new tables don''t keep: %', finding; END IF;

  -- A property's description has no reader since the property editor went (#7): dropped, and counted
  SELECT count(*) INTO described FROM customization.properties WHERE description IS NOT NULL;
  RAISE NOTICE 'Dropping % property descriptions, which nothing reads', described;
END $$;

ALTER TABLE character.characters DISABLE TRIGGER USER;
ALTER TABLE character.inventory DISABLE TRIGGER USER;

-- Registries: what the 3.5 module declares -----------------------------------------------------------------------------

INSERT INTO rules.modules (base_rules) VALUES ('Dungeons & Dragons: 3.5');

INSERT INTO rules.entity_types (type, owner_type) VALUES
  ('abilities', NULL), ('aptitudes', NULL), ('feats', NULL), ('items', NULL), ('klasses', NULL),
  ('klass_levels', 'klasses'), ('languages', NULL), ('mechanics', NULL), ('powers', NULL), ('races', NULL),
  ('saves', NULL), ('skills', NULL);

INSERT INTO rules.link_role_kinds (role, from_type, single) VALUES
  ('subraceOf', 'races', true), ('subclassOf', 'klasses', true), ('madeFrom', 'items', true), ('listedIn', 'feats', false),
  ('listedIn', 'powers', false), ('classSkill', 'klasses', false), ('grants', 'klass_levels', false),
  ('baseBonus', 'klass_levels', false), ('keyAbility', 'saves', true), ('keyAbility', 'skills', true),
  ('resistedBy', 'powers', true), ('bonusSpellAbility', 'klasses', true);

INSERT INTO rules.link_roles (role, from_type, to_type, via_type, single, on_delete, via_on_delete, merge) VALUES
  ('subraceOf', 'races', 'races', NULL, true, 'delete', 'refuse', 'winner'),
  ('subclassOf', 'klasses', 'klasses', NULL, true, 'delete', 'refuse', 'winner'),
  ('madeFrom', 'items', 'items', NULL, true, 'refuse', 'refuse', 'winner'),
  ('listedIn', 'feats', 'aptitudes', NULL, false, 'unlink', 'refuse', 'union'),
  ('listedIn', 'powers', 'aptitudes', NULL, false, 'unlink', 'refuse', 'union'),
  ('classSkill', 'klasses', 'skills', NULL, false, 'unlink', 'refuse', 'winner'),
  ('grants', 'klass_levels', 'feats', 'aptitudes', false, 'unlink', 'unlink', 'winner'),
  ('grants', 'klass_levels', 'powers', 'aptitudes', false, 'unlink', 'unlink', 'winner'),
  ('baseBonus', 'klass_levels', 'saves', NULL, false, 'refuse', 'refuse', 'winner'),
  ('keyAbility', 'saves', 'abilities', NULL, true, 'delete', 'refuse', 'winner'),
  ('keyAbility', 'skills', 'abilities', NULL, true, 'delete', 'refuse', 'winner'),
  ('resistedBy', 'powers', 'saves', NULL, true, 'unlink', 'refuse', 'winner'),
  ('bonusSpellAbility', 'klasses', 'abilities', NULL, true, 'unlink', 'refuse', 'fallback');

INSERT INTO rules.field_defs (owner_kind, owner_type, field, value_kind, multiple, merge, inherits_via) VALUES
  ('entity', 'klasses', 'KLASS_HD', 'number', false, 'winner', NULL),
  ('entity', 'feats', 'FEAT_STACKABLE', 'flag', false, 'winner', NULL),
  ('entity', 'feats', 'FEAT_SELECTABLE', 'flag', false, 'winner', NULL),
  ('entity', 'feats', 'FEAT_GENERATED', 'flag', false, 'winner', NULL),
  ('entity', 'races', 'RACE_SIZE', 'text', false, 'winner', NULL),
  ('entity', 'races', 'RACE_BASE_SPEED', 'number', false, 'winner', NULL),
  ('entity', 'items', 'ITEM_WEIGHT', 'number', false, 'winner', NULL),
  ('entity', 'items', 'ITEM_COST_GP', 'number', false, 'winner', NULL),
  ('entity', 'items', 'ITEM_TYPE', 'text', false, 'winner', NULL),
  ('entity', 'items', 'ITEM_SLOT', 'text', false, 'winner', NULL),
  ('entity', 'items', 'ITEM_IS_TEMPLATE', 'flag', false, 'winner', NULL),
  ('entity', 'languages', 'LANGUAGE_TYPE', 'text', false, 'winner', NULL),
  ('entity', 'powers', 'POWER_SAVE_EFFECT', 'text', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_XP', 'number', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_ALIGNMENT', 'text', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_AGE', 'number', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_GENDER', 'text', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_HEIGHT', 'text', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_WEIGHT', 'text', false, 'winner', NULL),
  ('character', 'characters', 'CHARACTER_DEITY', 'text', false, 'winner', NULL);
-- Today's properties: a set unions its siblings' values, a single value is the winning copy's or else a sibling's;
-- a ruleset's setting is the nearest ruleset's in its chain, whole; an item reads its template's when it has none
INSERT INTO rules.field_defs (owner_kind, owner_type, field, value_kind, multiple, merge, inherits_via)
SELECT owner_kind, owner_type, field, value_kind, multiple,
  CASE WHEN owner_kind = 'ruleset' THEN 'winner' WHEN multiple THEN 'union' ELSE 'fallback' END,
  CASE WHEN inherits THEN 'madeFrom' END
FROM pg_temp.prop_defs;

INSERT INTO rules.ruleset_roles (role, to_type, on_delete) VALUES ('skillPointAbility', 'abilities', 'unlink');
INSERT INTO character.character_roles (role, entity_type, single, on_delete) VALUES
  ('race', 'races', true, 'refuse'), ('score', 'abilities', false, 'delete'), ('speaks', 'languages', false, 'refuse');
INSERT INTO character.steps (step, entity_type, via_type, on_delete, repeats) VALUES
  ('hp', NULL, NULL, 'refuse', false), ('abilities', 'abilities', NULL, 'delete', false),
  ('skills', 'skills', NULL, 'refuse', false), ('feats', 'feats', 'aptitudes', 'refuse', true),
  ('powers', 'powers', 'aptitudes', 'refuse', false);
INSERT INTO character.item_types (entity_type) VALUES ('items');

-- Entities -------------------------------------------------------------------------------------------------------------

INSERT INTO rules.entities (id, ruleset_id, campaign_id, type, name, description, partition, created_at, updated_at, deleted_at)
SELECT id, ruleset_id, campaign_id, 'abilities', name, description, '', created_at, updated_at, deleted_at FROM rules.abilities
UNION ALL SELECT id, ruleset_id, campaign_id, 'aptitudes', name, description, '', created_at, updated_at, deleted_at FROM rules.aptitudes
UNION ALL SELECT id, ruleset_id, campaign_id, 'feats', name, description, '', created_at, updated_at, deleted_at FROM rules.feats
UNION ALL SELECT id, ruleset_id, campaign_id, 'items', name, description, '', created_at, updated_at, deleted_at FROM rules.items
UNION ALL SELECT id, ruleset_id, campaign_id, 'klasses', name, description, kind, created_at, updated_at, deleted_at FROM rules.klasses
UNION ALL SELECT id, ruleset_id, campaign_id, 'languages', name, description, '', created_at, updated_at, deleted_at FROM rules.languages
UNION ALL SELECT id, ruleset_id, campaign_id, 'mechanics', name, description, '', created_at, updated_at, deleted_at FROM rules.mechanics
UNION ALL SELECT id, ruleset_id, campaign_id, 'powers', name, description, '', created_at, updated_at, deleted_at FROM rules.powers
UNION ALL SELECT id, ruleset_id, campaign_id, 'races', name, description, kind, created_at, updated_at, deleted_at FROM rules.races
UNION ALL SELECT id, ruleset_id, campaign_id, 'saves', name, description, '', created_at, updated_at, deleted_at FROM rules.saves
UNION ALL SELECT id, ruleset_id, campaign_id, 'skills', name, description, '', created_at, updated_at, deleted_at FROM rules.skills;

INSERT INTO rules.entities (id, ruleset_id, campaign_id, type, owner_id, owner_type, position, partition, created_at, updated_at,
  deleted_at)
SELECT l.id, k.ruleset_id, k.campaign_id, 'klass_levels', k.id, 'klasses', l.level, '', l.created_at, l.updated_at, l.deleted_at
FROM rules.klass_levels l JOIN rules.klasses k ON k.id = l.klass_id;

-- Entity fields: the former columns (a NOT NULL one always has its row, a NULL one none), then the properties ----------

INSERT INTO rules.entity_fields (entity_id, entity_type, field, value_kind, multiple, text_value, number_value, flag_value,
  created_at, updated_at)
SELECT id, 'klasses', 'KLASS_HD', 'number', false, NULL::text, hd::numeric, NULL::boolean, created_at, updated_at FROM rules.klasses
UNION ALL SELECT id, 'feats', 'FEAT_STACKABLE', 'flag', false, NULL, NULL, stackable, created_at, updated_at FROM rules.feats
UNION ALL SELECT id, 'feats', 'FEAT_SELECTABLE', 'flag', false, NULL, NULL, selectable, created_at, updated_at FROM rules.feats
UNION ALL SELECT id, 'feats', 'FEAT_GENERATED', 'flag', false, NULL, NULL, generated, created_at, updated_at FROM rules.feats
UNION ALL SELECT id, 'races', 'RACE_SIZE', 'text', false, size::text, NULL, NULL, created_at, updated_at FROM rules.races
UNION ALL SELECT id, 'races', 'RACE_BASE_SPEED', 'number', false, NULL, base_speed, NULL, created_at, updated_at FROM rules.races
UNION ALL SELECT id, 'items', 'ITEM_WEIGHT', 'number', false, NULL, weight, NULL, created_at, updated_at FROM rules.items WHERE weight IS NOT NULL
UNION ALL SELECT id, 'items', 'ITEM_COST_GP', 'number', false, NULL, cost_gp, NULL, created_at, updated_at FROM rules.items WHERE cost_gp IS NOT NULL
UNION ALL SELECT id, 'items', 'ITEM_TYPE', 'text', false, type, NULL, NULL, created_at, updated_at FROM rules.items WHERE type IS NOT NULL
UNION ALL SELECT id, 'items', 'ITEM_SLOT', 'text', false, slot::text, NULL, NULL, created_at, updated_at FROM rules.items
UNION ALL SELECT id, 'items', 'ITEM_IS_TEMPLATE', 'flag', false, NULL, NULL, is_template, created_at, updated_at FROM rules.items
UNION ALL SELECT id, 'languages', 'LANGUAGE_TYPE', 'text', false, type, NULL, NULL, created_at, updated_at FROM rules.languages
UNION ALL SELECT id, 'powers', 'POWER_SAVE_EFFECT', 'text', false, save_effect, NULL, NULL, created_at, updated_at FROM rules.powers WHERE save_effect IS NOT NULL;

-- A property's text becomes its field's typed value; a value its kind can't read aborts the migration
INSERT INTO rules.entity_fields (entity_id, entity_type, field, ordinal, value_kind, multiple, text_value, number_value,
  flag_value, created_at, updated_at)
SELECT p.entity_id, p.entity_type, p.type,
  (row_number() OVER (PARTITION BY p.entity_id, p.type ORDER BY p.created_at, p.value) - 1)::smallint,
  d.value_kind, d.multiple,
  CASE WHEN d.value_kind = 'text' THEN p.value END,
  CASE WHEN d.value_kind = 'number' THEN p.value::numeric END,
  CASE WHEN d.value_kind = 'flag' THEN p.value::boolean END,
  p.created_at, p.updated_at
FROM customization.properties p JOIN rules.field_defs d ON d.owner_type = p.entity_type AND d.field = p.type
WHERE d.owner_kind = 'entity';

INSERT INTO rules.ruleset_fields (ruleset_id, field, ordinal, value_kind, multiple, text_value, number_value, flag_value,
  created_at, updated_at)
SELECT p.entity_id, p.type,
  (row_number() OVER (PARTITION BY p.entity_id, p.type ORDER BY p.created_at, p.value) - 1)::smallint,
  d.value_kind, d.multiple,
  CASE WHEN d.value_kind = 'text' THEN p.value END,
  CASE WHEN d.value_kind = 'number' THEN p.value::numeric END,
  CASE WHEN d.value_kind = 'flag' THEN p.value::boolean END,
  p.created_at, p.updated_at
FROM customization.properties p JOIN rules.field_defs d ON d.owner_type = p.entity_type AND d.field = p.type
WHERE d.owner_kind = 'ruleset';

-- Entity links ---------------------------------------------------------------------------------------------------------

INSERT INTO rules.entity_links (id, from_id, from_type, role, single, to_id, to_type, via_id, via_type, tier, amount, free,
  created_at, updated_at)
SELECT gen_random_uuid(), id, 'races', 'subraceOf', true, parent_id, 'races', NULL::uuid, NULL::text, NULL::integer,
  NULL::integer, false, created_at, updated_at FROM rules.races WHERE parent_id IS NOT NULL
UNION ALL SELECT gen_random_uuid(), id, 'klasses', 'subclassOf', true, parent_id, 'klasses', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.klasses WHERE parent_id IS NOT NULL
UNION ALL SELECT gen_random_uuid(), id, 'items', 'madeFrom', true, source_item_id, 'items', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.items WHERE source_item_id IS NOT NULL
UNION ALL SELECT gen_random_uuid(), feat_id, 'feats', 'listedIn', false, aptitude_id, 'aptitudes', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.feats_aptitudes
UNION ALL SELECT gen_random_uuid(), power_id, 'powers', 'listedIn', false, aptitude_id, 'aptitudes', NULL, NULL, level, NULL, false,
  created_at, updated_at FROM rules.powers_aptitudes
UNION ALL SELECT gen_random_uuid(), klass_id, 'klasses', 'classSkill', false, skill_id, 'skills', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.klass_skills
UNION ALL SELECT id, klass_level_id, 'klass_levels', 'grants', false, feat_id, 'feats', aptitude_id, 'aptitudes', NULL, NULL, free,
  created_at, updated_at FROM rules.klass_level_feats
UNION ALL SELECT gen_random_uuid(), klass_level_id, 'klass_levels', 'grants', false, power_id, 'powers', aptitude_id, 'aptitudes',
  NULL, NULL, free, created_at, updated_at FROM rules.klass_level_powers
UNION ALL SELECT gen_random_uuid(), klass_level_id, 'klass_levels', 'baseBonus', false, save_id, 'saves', NULL, NULL, NULL, base,
  false, created_at, updated_at FROM rules.klass_level_saves
UNION ALL SELECT gen_random_uuid(), id, 'saves', 'keyAbility', true, ability_id, 'abilities', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.saves
UNION ALL SELECT gen_random_uuid(), id, 'skills', 'keyAbility', true, primary_ability_id, 'abilities', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.skills
UNION ALL SELECT gen_random_uuid(), id, 'powers', 'resistedBy', true, save_id, 'saves', NULL, NULL, NULL, NULL, false,
  created_at, updated_at FROM rules.powers WHERE save_id IS NOT NULL
UNION ALL SELECT gen_random_uuid(), p.entity_id, 'klasses', 'bonusSpellAbility', true, lower(p.value)::uuid, 'abilities', NULL, NULL,
  NULL, NULL, false, p.created_at, p.updated_at
  FROM customization.properties p WHERE p.entity_type = 'klasses' AND p.type = 'KLASS_BONUS_SPELL_ABILITY_ID';

-- Each from-entity's links of a role, in today's order: grants of feats by (created_at, id), of powers by
-- (created_at, power), pools by (created_at, pool)
UPDATE rules.entity_links l SET ordinal = o.ordinal FROM (
  SELECT id, (row_number() OVER (PARTITION BY from_id, role, to_type
    ORDER BY created_at, CASE WHEN role = 'grants' AND to_type = 'feats' THEN id::text ELSE to_id::text END) - 1)::integer AS ordinal
  FROM rules.entity_links) o
WHERE o.id = l.id;

INSERT INTO rules.ruleset_links (ruleset_id, role, to_id, to_type, created_at, updated_at)
SELECT p.entity_id, 'skillPointAbility', lower(p.value)::uuid, 'abilities', p.created_at, p.updated_at
FROM customization.properties p WHERE p.entity_type = 'rulesets' AND p.type = 'RULESET_SKILL_POINT_ABILITY_ID';

-- Characters -----------------------------------------------------------------------------------------------------------

INSERT INTO character.fields (character_id, field, value_kind, multiple, text_value, number_value, flag_value, created_at, updated_at)
SELECT id, 'CHARACTER_XP', 'number', false, NULL::text, xp::numeric, NULL::boolean, created_at, updated_at FROM character.characters
UNION ALL SELECT id, 'CHARACTER_ALIGNMENT', 'text', false, alignment::text, NULL, NULL, created_at, updated_at FROM character.characters
UNION ALL SELECT id, 'CHARACTER_AGE', 'number', false, NULL, age, NULL, created_at, updated_at FROM character.characters WHERE age IS NOT NULL
UNION ALL SELECT id, 'CHARACTER_GENDER', 'text', false, gender::text, NULL, NULL, created_at, updated_at FROM character.characters
UNION ALL SELECT id, 'CHARACTER_HEIGHT', 'text', false, height, NULL, NULL, created_at, updated_at FROM character.characters WHERE height IS NOT NULL
UNION ALL SELECT id, 'CHARACTER_WEIGHT', 'text', false, weight, NULL, NULL, created_at, updated_at FROM character.characters WHERE weight IS NOT NULL
UNION ALL SELECT id, 'CHARACTER_DEITY', 'text', false, deity, NULL, NULL, created_at, updated_at FROM character.characters WHERE deity IS NOT NULL;

INSERT INTO character.links (character_id, role, single, entity_id, entity_type, amount, created_at, updated_at)
SELECT id, 'race', true, race_id, 'races', NULL::integer, created_at, updated_at FROM character.characters
UNION ALL SELECT character_id, 'score', false, ability_id, 'abilities', score, created_at, updated_at FROM character.character_abilities
UNION ALL SELECT character_id, 'speaks', false, language_id, 'languages', NULL, created_at, updated_at FROM character.languages;

INSERT INTO character.advancements (id, character_id, position, track_id, track_type, created_at, updated_at, deleted_at)
SELECT id, character_id, position, klass_level_id, 'klass_levels', created_at, updated_at, deleted_at FROM character.levels;

INSERT INTO character.advancement_picks (id, advancement_id, step, entity_id, entity_type, via_id, via_type, amount, ordinal,
  repeats, created_at, updated_at)
SELECT gen_random_uuid(), id, 'hp', NULL::uuid, NULL::text, NULL::uuid, NULL::text, hp, 0::smallint, false, created_at, updated_at
  FROM character.levels
UNION ALL SELECT gen_random_uuid(), character_level_id, 'abilities', ability_id, 'abilities', NULL, NULL, amount, 0, false,
  created_at, updated_at FROM character.level_ability_increases
UNION ALL SELECT gen_random_uuid(), character_level_id, 'skills', skill_id, 'skills', NULL, NULL, rank, 0, false,
  created_at, updated_at FROM character.level_skills
UNION ALL SELECT id, character_level_id, 'feats', feat_id, 'feats', aptitude_id, 'aptitudes', NULL,
  (row_number() OVER (PARTITION BY character_level_id, feat_id ORDER BY created_at, id) - 1)::smallint, true,
  created_at, updated_at FROM character.level_feats
UNION ALL SELECT gen_random_uuid(), character_level_id, 'powers', power_id, 'powers', aptitude_id, 'aptitudes', NULL, 0, false,
  created_at, updated_at FROM character.level_powers;

UPDATE character.inventory SET item_type = 'items', location_text = location::text, groups = weapon_sets;
ALTER TABLE character.inventory ALTER COLUMN item_type SET NOT NULL, ALTER COLUMN groups SET NOT NULL,
  ADD FOREIGN KEY (item_type) REFERENCES character.item_types(entity_type),
  ADD CONSTRAINT inventory_item_entity_fkey FOREIGN KEY (item_id, item_type) REFERENCES rules.entities(id, type)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE character.characters ENABLE TRIGGER USER;
ALTER TABLE character.inventory ENABLE TRIGGER USER;

-- The new character tables move their character's last change, as today's do (0078)
CREATE FUNCTION character.touch_characters_of_advancement_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM character.touch_characters(
    ARRAY(SELECT a.character_id FROM changed_rows r JOIN character.advancements a ON a.id = r.advancement_id)
  );
  RETURN NULL;
END $$;
DO $$
DECLARE touched record;
BEGIN
  FOR touched IN SELECT * FROM (VALUES
    ('character.fields', 'character.touch_characters_of_rows'),
    ('character.links', 'character.touch_characters_of_rows'),
    ('character.advancements', 'character.touch_characters_of_rows'),
    ('character.advancement_picks', 'character.touch_characters_of_advancement_rows')
  ) AS tables (table_name, function_name) LOOP
    EXECUTE format('CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON %s REFERENCING NEW TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
    EXECUTE format('CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON %s REFERENCING NEW TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
    EXECUTE format('CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON %s REFERENCING OLD TABLE AS changed_rows '
      'FOR EACH STATEMENT EXECUTE FUNCTION %s()', touched.table_name, touched.function_name);
  END LOOP;
END $$;

-- The delete rules' trigger comes last, once every row is in place
CREATE TRIGGER apply_delete_rules AFTER DELETE ON rules.entities FOR EACH ROW EXECUTE FUNCTION rules.apply_delete_rules();
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.entities REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION rules.delete_entity_customizations();

ALTER TABLE rules.rulesets ALTER COLUMN base_rules TYPE text;
ALTER TABLE rules.rulesets ADD FOREIGN KEY (base_rules) REFERENCES rules.modules(base_rules);
-- Phase 4, revision 2: rebuild every old table from the generic rows, and compare both ways, row for row.
-- Each row: the table, its rows, rows the rebuild lacks, rows the rebuild adds. Both differences must be 0.

CREATE TEMP VIEW f AS
SELECT entity_id, field, text_value, number_value, flag_value FROM rules.entity_fields WHERE ordinal = 0;

CREATE TEMP VIEW l AS
SELECT * FROM rules.entity_links;

CREATE TEMP TABLE checks (tbl text, rows bigint, missing bigint, extra bigint);

CREATE FUNCTION pg_temp.compare(tbl text, old_q text, new_q text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint; m bigint; e bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) o', old_q) INTO n;
  EXECUTE format('SELECT count(*) FROM ((%s) EXCEPT ALL (%s)) d', old_q, new_q) INTO m;
  EXECUTE format('SELECT count(*) FROM ((%s) EXCEPT ALL (%s)) d', new_q, old_q) INTO e;
  INSERT INTO checks VALUES (tbl, n, m, e);
END $$;

-- Entities with their former columns
SELECT pg_temp.compare('abilities',
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.abilities$q$,
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.entities WHERE type = 'abilities'$q$);
SELECT pg_temp.compare('aptitudes',
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.aptitudes$q$,
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.entities WHERE type = 'aptitudes'$q$);
SELECT pg_temp.compare('mechanics',
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.mechanics$q$,
  $q$SELECT id, ruleset_id, campaign_id, name, description, created_at, updated_at, deleted_at FROM rules.entities WHERE type = 'mechanics'$q$);
SELECT pg_temp.compare('feats',
  $q$SELECT id, ruleset_id, campaign_id, name, description, stackable, selectable, generated, created_at, updated_at, deleted_at FROM rules.feats$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT flag_value FROM f WHERE entity_id = e.id AND field = 'FEAT_STACKABLE'),
       (SELECT flag_value FROM f WHERE entity_id = e.id AND field = 'FEAT_SELECTABLE'),
       (SELECT flag_value FROM f WHERE entity_id = e.id AND field = 'FEAT_GENERATED'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'feats'$q$);
SELECT pg_temp.compare('items',
  $q$SELECT id, ruleset_id, campaign_id, name, description, weight, cost_gp, type, slot::text, source_item_id, is_template, created_at, updated_at, deleted_at FROM rules.items$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT number_value FROM f WHERE entity_id = e.id AND field = 'ITEM_WEIGHT'),
       (SELECT number_value FROM f WHERE entity_id = e.id AND field = 'ITEM_COST_GP'),
       (SELECT text_value FROM f WHERE entity_id = e.id AND field = 'ITEM_TYPE'),
       (SELECT text_value FROM f WHERE entity_id = e.id AND field = 'ITEM_SLOT'),
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'madeFrom'),
       (SELECT flag_value FROM f WHERE entity_id = e.id AND field = 'ITEM_IS_TEMPLATE'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'items'$q$);
SELECT pg_temp.compare('klasses',
  $q$SELECT id, ruleset_id, campaign_id, name, description, hd, parent_id, kind, created_at, updated_at, deleted_at FROM rules.klasses$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT number_value FROM f WHERE entity_id = e.id AND field = 'KLASS_HD')::integer,
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'subclassOf'),
       e.partition, e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'klasses'$q$);
SELECT pg_temp.compare('klass_levels',
  $q$SELECT id, klass_id, level, created_at, updated_at, deleted_at FROM rules.klass_levels$q$,
  $q$SELECT id, owner_id, position, created_at, updated_at, deleted_at FROM rules.entities WHERE type = 'klass_levels'$q$);
SELECT pg_temp.compare('languages',
  $q$SELECT id, ruleset_id, campaign_id, name, description, type, created_at, updated_at, deleted_at FROM rules.languages$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT text_value FROM f WHERE entity_id = e.id AND field = 'LANGUAGE_TYPE'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'languages'$q$);
SELECT pg_temp.compare('powers',
  $q$SELECT id, ruleset_id, campaign_id, name, description, save_id, save_effect, created_at, updated_at, deleted_at FROM rules.powers$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'resistedBy'),
       (SELECT text_value FROM f WHERE entity_id = e.id AND field = 'POWER_SAVE_EFFECT'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'powers'$q$);
SELECT pg_temp.compare('races',
  $q$SELECT id, ruleset_id, campaign_id, name, description, size::text, base_speed, parent_id, kind, created_at, updated_at, deleted_at FROM rules.races$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT text_value FROM f WHERE entity_id = e.id AND field = 'RACE_SIZE'),
       (SELECT number_value FROM f WHERE entity_id = e.id AND field = 'RACE_BASE_SPEED')::integer,
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'subraceOf'),
       e.partition, e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'races'$q$);
SELECT pg_temp.compare('saves',
  $q$SELECT id, ruleset_id, campaign_id, name, description, ability_id, created_at, updated_at, deleted_at FROM rules.saves$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'keyAbility'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'saves'$q$);
SELECT pg_temp.compare('skills',
  $q$SELECT id, ruleset_id, campaign_id, name, description, primary_ability_id, created_at, updated_at, deleted_at FROM rules.skills$q$,
  $q$SELECT e.id, e.ruleset_id, e.campaign_id, e.name, e.description,
       (SELECT to_id FROM l WHERE from_id = e.id AND role = 'keyAbility'),
       e.created_at, e.updated_at, e.deleted_at FROM rules.entities e WHERE type = 'skills'$q$);

-- Join tables
SELECT pg_temp.compare('feats_aptitudes',
  $q$SELECT feat_id, aptitude_id, created_at, updated_at, deleted_at FROM rules.feats_aptitudes$q$,
  $q$SELECT from_id, to_id, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'listedIn' AND from_type = 'feats'$q$);
SELECT pg_temp.compare('powers_aptitudes',
  $q$SELECT power_id, aptitude_id, level, created_at, updated_at, deleted_at FROM rules.powers_aptitudes$q$,
  $q$SELECT from_id, to_id, tier, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'listedIn' AND from_type = 'powers'$q$);
SELECT pg_temp.compare('klass_skills',
  $q$SELECT klass_id, skill_id, created_at, updated_at, deleted_at FROM rules.klass_skills$q$,
  $q$SELECT from_id, to_id, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'classSkill'$q$);
SELECT pg_temp.compare('klass_level_feats',
  $q$SELECT id, klass_level_id, feat_id, aptitude_id, free, created_at, updated_at, deleted_at FROM rules.klass_level_feats$q$,
  $q$SELECT id, from_id, to_id, via_id, free, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'grants' AND to_type = 'feats'$q$);
SELECT pg_temp.compare('klass_level_powers',
  $q$SELECT klass_level_id, power_id, aptitude_id, free, created_at, updated_at, deleted_at FROM rules.klass_level_powers$q$,
  $q$SELECT from_id, to_id, via_id, free, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'grants' AND to_type = 'powers'$q$);
SELECT pg_temp.compare('klass_level_saves',
  $q$SELECT klass_level_id, save_id, base, created_at, updated_at, deleted_at FROM rules.klass_level_saves$q$,
  $q$SELECT from_id, to_id, amount, created_at, updated_at, NULL::timestamptz FROM l WHERE role = 'baseBonus'$q$);

-- Properties that named an entity
SELECT pg_temp.compare('klass bonus spell ability',
  $q$SELECT entity_id, value::uuid FROM customization.properties WHERE entity_type = 'klasses' AND type = 'KLASS_BONUS_SPELL_ABILITY_ID'$q$,
  $q$SELECT from_id, to_id FROM l WHERE role = 'bonusSpellAbility'$q$);
SELECT pg_temp.compare('ruleset skill point ability',
  $q$SELECT entity_id, value::uuid FROM customization.properties WHERE entity_type = 'rulesets' AND type = 'RULESET_SKILL_POINT_ABILITY_ID'$q$,
  $q$SELECT ruleset_id, to_id FROM rules.ruleset_links WHERE role = 'skillPointAbility'$q$);

-- Characters
SELECT pg_temp.compare('characters',
  $q$SELECT id, race_id, xp, alignment::text, age, gender::text, height, weight, deity FROM character.characters$q$,
  $q$SELECT c.id,
       (SELECT entity_id FROM character.links WHERE character_id = c.id AND role = 'race'),
       (SELECT number_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_XP')::integer,
       (SELECT text_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_ALIGNMENT'),
       (SELECT number_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_AGE')::integer,
       (SELECT text_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_GENDER'),
       (SELECT text_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_HEIGHT'),
       (SELECT text_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_WEIGHT'),
       (SELECT text_value FROM character.fields WHERE character_id = c.id AND field = 'CHARACTER_DEITY')
     FROM character.characters c$q$);
SELECT pg_temp.compare('character_abilities',
  $q$SELECT character_id, ability_id, score, created_at, updated_at, deleted_at FROM character.character_abilities$q$,
  $q$SELECT character_id, entity_id, amount, created_at, updated_at, NULL::timestamptz FROM character.links WHERE role = 'score'$q$);
SELECT pg_temp.compare('character languages',
  $q$SELECT character_id, language_id, created_at, updated_at, deleted_at FROM character.languages$q$,
  $q$SELECT character_id, entity_id, created_at, updated_at, NULL::timestamptz FROM character.links WHERE role = 'speaks'$q$);
SELECT pg_temp.compare('levels',
  $q$SELECT id, character_id, klass_level_id, hp, position, created_at, updated_at, deleted_at FROM character.levels$q$,
  $q$SELECT a.id, a.character_id, a.track_id,
       (SELECT amount FROM character.advancement_picks WHERE advancement_id = a.id AND step = 'hp'),
       a.position, a.created_at, a.updated_at, a.deleted_at FROM character.advancements a$q$);
SELECT pg_temp.compare('level_ability_increases',
  $q$SELECT character_level_id, ability_id, amount, created_at, updated_at, deleted_at FROM character.level_ability_increases$q$,
  $q$SELECT advancement_id, entity_id, amount, created_at, updated_at, NULL::timestamptz FROM character.advancement_picks WHERE step = 'abilities'$q$);
SELECT pg_temp.compare('level_skills',
  $q$SELECT character_level_id, skill_id, rank, created_at, updated_at, deleted_at FROM character.level_skills$q$,
  $q$SELECT advancement_id, entity_id, amount, created_at, updated_at, NULL::timestamptz FROM character.advancement_picks WHERE step = 'skills'$q$);
SELECT pg_temp.compare('level_feats',
  $q$SELECT id, character_level_id, feat_id, aptitude_id, created_at, updated_at, deleted_at FROM character.level_feats$q$,
  $q$SELECT id, advancement_id, entity_id, via_id, created_at, updated_at, NULL::timestamptz FROM character.advancement_picks WHERE step = 'feats'$q$);
SELECT pg_temp.compare('level_powers',
  $q$SELECT character_level_id, power_id, aptitude_id, created_at, updated_at, deleted_at FROM character.level_powers$q$,
  $q$SELECT advancement_id, entity_id, via_id, created_at, updated_at, NULL::timestamptz FROM character.advancement_picks WHERE step = 'powers'$q$);
SELECT pg_temp.compare('inventory',
  $q$SELECT id, item_id, location::text, weapon_sets FROM character.inventory$q$,
  $q$SELECT id, item_id, location_text, groups FROM character.inventory$q$);


-- Today's properties, rebuilt from typed fields: the same text, the same rows
SELECT pg_temp.compare('properties as fields',
  $q$SELECT entity_id, entity_type, type, value, created_at, updated_at FROM customization.properties
     WHERE type NOT IN ('KLASS_BONUS_SPELL_ABILITY_ID', 'RULESET_SKILL_POINT_ABILITY_ID')$q$,
  $q$SELECT f.entity_id, f.entity_type, f.field, coalesce(f.text_value, f.number_value::text, f.flag_value::text), f.created_at, f.updated_at
     FROM rules.entity_fields f
     WHERE f.field NOT IN ('KLASS_HD', 'FEAT_STACKABLE', 'FEAT_SELECTABLE', 'FEAT_GENERATED', 'RACE_SIZE', 'RACE_BASE_SPEED',
       'ITEM_WEIGHT', 'ITEM_COST_GP', 'ITEM_TYPE', 'ITEM_SLOT', 'ITEM_IS_TEMPLATE', 'LANGUAGE_TYPE', 'POWER_SAVE_EFFECT')
     UNION ALL
     SELECT ruleset_id, 'rulesets', field, coalesce(text_value, number_value::text, flag_value::text), created_at, updated_at
     FROM rules.ruleset_fields$q$);

-- Today's orders, kept as ordinals
SELECT pg_temp.compare('grants of feats, in order',
  $q$SELECT klass_level_id, feat_id, row_number() OVER (PARTITION BY klass_level_id ORDER BY created_at, id) FROM rules.klass_level_feats$q$,
  $q$SELECT from_id, to_id, ordinal + 1 FROM rules.entity_links WHERE role = 'grants' AND to_type = 'feats'$q$);
SELECT pg_temp.compare('grants of powers, in order',
  $q$SELECT klass_level_id, power_id, row_number() OVER (PARTITION BY klass_level_id ORDER BY created_at, power_id) FROM rules.klass_level_powers$q$,
  $q$SELECT from_id, to_id, ordinal + 1 FROM rules.entity_links WHERE role = 'grants' AND to_type = 'powers'$q$);
SELECT pg_temp.compare('pools of feats, in order',
  $q$SELECT feat_id, aptitude_id, row_number() OVER (PARTITION BY feat_id ORDER BY created_at, aptitude_id) FROM rules.feats_aptitudes$q$,
  $q$SELECT from_id, to_id, ordinal + 1 FROM rules.entity_links WHERE role = 'listedIn' AND from_type = 'feats'$q$);
SELECT pg_temp.compare('pools of powers, in order',
  $q$SELECT power_id, aptitude_id, row_number() OVER (PARTITION BY power_id ORDER BY created_at, aptitude_id) FROM rules.powers_aptitudes$q$,
  $q$SELECT from_id, to_id, ordinal + 1 FROM rules.entity_links WHERE role = 'listedIn' AND from_type = 'powers'$q$);

-- Characters' last change must not have moved
SELECT pg_temp.compare('characters last_changed_at',
  $q$SELECT id, last_changed_at, updated_at FROM character.characters$q$,
  $q$SELECT id, last_changed_at, updated_at FROM pg_temp.before_characters$q$);

SELECT * FROM checks ORDER BY tbl;
DO $$
DECLARE failed text;
BEGIN
  SELECT string_agg(tbl, ', ') INTO failed FROM checks WHERE missing <> 0 OR extra <> 0;
  IF failed IS NOT NULL THEN RAISE EXCEPTION 'Migration checks failed: %', failed; END IF;
  RAISE NOTICE 'All % migration checks passed', (SELECT count(*) FROM checks);
END $$;

-- Temp views and functions outlive a commit on a pooled connection: dropped by hand
DROP VIEW f, l;
DROP FUNCTION pg_temp.compare(text, text, text);
DROP TABLE checks;
-- In the migration's transaction, once its checks pass: today's tables, columns, enums and their functions go
DROP TABLE character.level_ability_increases, character.level_feats, character.level_powers, character.level_skills,
  character.levels, character.languages, character.character_abilities CASCADE;
DROP TABLE rules.feats_aptitudes, rules.powers_aptitudes, rules.klass_skills, rules.klass_level_feats,
  rules.klass_level_powers, rules.klass_level_saves, rules.klass_levels CASCADE;
ALTER TABLE character.inventory DROP COLUMN location, DROP COLUMN weapon_sets;
ALTER TABLE character.inventory RENAME COLUMN location_text TO location;
ALTER TABLE character.inventory DROP CONSTRAINT IF EXISTS inventory_item_id_fkey;
DROP TABLE rules.abilities, rules.aptitudes, rules.feats, rules.items, rules.klasses, rules.languages, rules.mechanics,
  rules.powers, rules.races, rules.saves, rules.skills CASCADE;
-- The kept owners' trigger (rulesets, characters, modifiers) no longer deletes properties: their fields cascade
CREATE OR REPLACE FUNCTION customization.delete_owned_customizations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A statement trigger fires on a delete of no row too: the modifiers' would set off its own delete forever
  IF NOT EXISTS (SELECT FROM deleted_rows) THEN
    RETURN NULL;
  END IF;
  DELETE FROM customization.modifiers m USING deleted_rows d WHERE m.source_type = TG_ARGV[0] AND m.source_id = d.id;
  DELETE FROM customization.requirements r USING deleted_rows d WHERE r.entity_type = TG_ARGV[0] AND r.entity_id = d.id;
  RETURN NULL;
END $$;
DROP TABLE customization.properties CASCADE;
ALTER TABLE character.characters DROP COLUMN race_id, DROP COLUMN xp, DROP COLUMN alignment, DROP COLUMN age,
  DROP COLUMN gender, DROP COLUMN height, DROP COLUMN weight, DROP COLUMN deity;
ALTER TABLE character.characters DROP CONSTRAINT IF EXISTS characters_kind_parent_check;
DROP INDEX IF EXISTS character.characters_one_bonded_per_kind_per_master_idx;
DROP TYPE alignment, gender, size_type, location, base_rules;

DROP FUNCTION character.touch_characters_of_level_rows();

ANALYZE rules.entities, rules.entity_fields, rules.entity_links, rules.ruleset_fields, rules.ruleset_links, character.fields, character.links, character.advancements, character.advancement_picks;
