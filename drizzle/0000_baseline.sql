CREATE SCHEMA account;
--> statement-breakpoint
CREATE SCHEMA campaign;
--> statement-breakpoint
CREATE SCHEMA "character";
--> statement-breakpoint
CREATE SCHEMA customization;
--> statement-breakpoint
CREATE SCHEMA rules;
--> statement-breakpoint
CREATE SCHEMA storage;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
--> statement-breakpoint
CREATE TYPE public.contributor_role AS ENUM (
    'Admin',
    'Editor',
    'Viewer'
);
--> statement-breakpoint
CREATE TYPE public.export_status AS ENUM (
    'pending',
    'ready',
    'failed'
);
--> statement-breakpoint
CREATE TYPE public.role AS ENUM (
    'Game Master',
    'Player Character'
);
--> statement-breakpoint
CREATE TYPE public.ruleset_kind AS ENUM (
    'ruleset',
    'extension'
);
--> statement-breakpoint
CREATE TYPE public.ruleset_status AS ENUM (
    'Draft',
    'Published',
    'Archived'
);
--> statement-breakpoint
CREATE TABLE account.activities (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_id uuid NOT NULL,
    target_type text NOT NULL,
    type text NOT NULL,
    data json
);
--> statement-breakpoint
CREATE TABLE account.api_keys (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    digest text NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE account.email_verifications (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE account.exports (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    mime_type text NOT NULL,
    file_name text NOT NULL,
    data bytea,
    expires_at timestamp with time zone NOT NULL,
    status public.export_status DEFAULT 'ready'::public.export_status NOT NULL
);
--> statement-breakpoint
CREATE TABLE account.notifications (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    activity_id uuid,
    type text NOT NULL,
    target_id uuid NOT NULL,
    target_type text NOT NULL,
    data json,
    read_at timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE account.oauth_accounts (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL
);
--> statement-breakpoint
CREATE TABLE account.password_resets (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE account.sessions (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);
--> statement-breakpoint
CREATE TABLE account.starred_rulesets (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    ruleset_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE account.users (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    email_address text NOT NULL,
    password_digest text,
    username text,
    email_verified_at timestamp with time zone,
    pending_email_address text,
    onboarding_completed_at timestamp with time zone,
    expires_at timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE campaign.campaigns (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    ruleset_id uuid NOT NULL,
    name text NOT NULL,
    description text
);
--> statement-breakpoint
CREATE TABLE campaign.invites (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid,
    email text,
    player_id uuid NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    CONSTRAINT invites_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Rejected'::text, 'Expired'::text, 'Revoked'::text]))),
    CONSTRAINT invites_user_or_email_check CHECK (((user_id IS NOT NULL) OR (email IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE campaign.player_characters (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    player_id uuid NOT NULL,
    character_id uuid NOT NULL,
    visibility text DEFAULT 'Private'::text NOT NULL,
    CONSTRAINT player_characters_visibility_check CHECK ((visibility = ANY (ARRAY['Private'::text, 'Public'::text, 'Partial'::text])))
);
--> statement-breakpoint
CREATE TABLE campaign.players (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid,
    campaign_id uuid NOT NULL,
    role public.role NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character".advancement_picks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    advancement_id uuid NOT NULL,
    step text NOT NULL,
    entity_id uuid,
    entity_type text,
    via_id uuid,
    via_type text,
    has_entity boolean GENERATED ALWAYS AS ((entity_id IS NOT NULL)) STORED,
    has_via boolean GENERATED ALWAYS AS ((via_id IS NOT NULL)) STORED,
    entity_key uuid GENERATED ALWAYS AS (COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
    amount integer,
    ordinal smallint DEFAULT 0 NOT NULL,
    repeats boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT advancement_picks_check CHECK ((repeats OR (ordinal = 0))),
    CONSTRAINT advancement_picks_ordinal_check CHECK ((ordinal >= 0))
);
--> statement-breakpoint
CREATE TABLE "character".advancements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    "position" integer NOT NULL,
    entry_id uuid NOT NULL,
    entry_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT advancements_position_check CHECK (("position" > 0))
);
--> statement-breakpoint
CREATE TABLE "character".character_contributors (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    role public.contributor_role DEFAULT 'Editor'::public.contributor_role NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    invited_by uuid NOT NULL,
    CONSTRAINT character_contributors_email_or_user CHECK (((user_id IS NOT NULL) OR (email IS NOT NULL))),
    CONSTRAINT character_contributors_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Active'::text, 'Rejected'::text, 'Revoked'::text])))
);
--> statement-breakpoint
CREATE TABLE "character".character_roles (
    role text NOT NULL,
    entity_type text NOT NULL,
    single boolean NOT NULL,
    on_delete text NOT NULL,
    CONSTRAINT character_roles_on_delete_check CHECK ((on_delete = ANY (ARRAY['refuse'::text, 'delete'::text])))
);
--> statement-breakpoint
CREATE TABLE "character".characters (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    ruleset_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    notes text,
    private_notes text,
    share_token text,
    kind text NOT NULL,
    parent_character_id uuid,
    last_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT characters_no_self_parent_check CHECK ((id <> parent_character_id))
);
--> statement-breakpoint
CREATE TABLE "character".fields (
    character_id uuid NOT NULL,
    owner_type text DEFAULT 'characters'::text NOT NULL,
    field text NOT NULL,
    ordinal smallint DEFAULT 0 NOT NULL,
    value_kind text NOT NULL,
    multiple boolean NOT NULL,
    text_value text,
    number_value numeric,
    flag_value boolean,
    value_key text GENERATED ALWAYS AS (COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fields_check CHECK ((multiple OR (ordinal = 0))),
    CONSTRAINT fields_check1 CHECK ((((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text)))),
    CONSTRAINT fields_number_value_check CHECK ((number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric]))),
    CONSTRAINT fields_ordinal_check CHECK ((ordinal >= 0)),
    CONSTRAINT fields_owner_type_check CHECK ((owner_type = 'characters'::text))
);
--> statement-breakpoint
CREATE TABLE "character".inventory (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    character_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity integer NOT NULL,
    total_charges integer,
    remaining_charges integer,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    item_type text NOT NULL,
    location text,
    groups smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    CONSTRAINT inventory_check CHECK (((total_charges IS NULL) OR ((total_charges >= 0) AND (remaining_charges IS NOT NULL)))),
    CONSTRAINT inventory_check1 CHECK (((remaining_charges IS NULL) OR ((remaining_charges >= 0) AND (total_charges IS NOT NULL)))),
    CONSTRAINT inventory_quantity_check CHECK ((quantity > 0))
);
--> statement-breakpoint
CREATE TABLE "character".item_types (
    entity_type text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character".links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    role text NOT NULL,
    single boolean NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    amount integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character".steps (
    step text NOT NULL,
    entity_type text,
    via_type text,
    has_entity boolean GENERATED ALWAYS AS ((entity_type IS NOT NULL)) STORED,
    has_via boolean GENERATED ALWAYS AS ((via_type IS NOT NULL)) STORED,
    on_delete text NOT NULL,
    repeats boolean NOT NULL,
    CONSTRAINT steps_on_delete_check CHECK ((on_delete = ANY (ARRAY['refuse'::text, 'delete'::text])))
);
--> statement-breakpoint
CREATE TABLE customization.modifiers (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    source_type text NOT NULL,
    target text NOT NULL,
    value text NOT NULL,
    value_type text NOT NULL,
    operator text NOT NULL,
    CONSTRAINT modifiers_operator_check CHECK ((operator = ANY (ARRAY['add'::text, 'subtract'::text, 'multiply'::text, 'divide'::text, 'set'::text]))),
    CONSTRAINT modifiers_value_type_check CHECK ((value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])))
);
--> statement-breakpoint
CREATE TABLE customization.requirements (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    level text NOT NULL,
    target text,
    value text,
    value_type text,
    operator text,
    chaining_operator text,
    CONSTRAINT requirements_check CHECK (((chaining_operator = ANY (ARRAY['and'::text, 'or'::text])) AND (((chaining_operator IS NULL) AND (operator IS NOT NULL) AND (value IS NOT NULL) AND (value_type IS NOT NULL) AND (target IS NOT NULL)) OR ((chaining_operator IS NOT NULL) AND (operator IS NULL) AND (value IS NULL) AND (value_type IS NULL) AND (target IS NULL))))),
    CONSTRAINT requirements_operator_check CHECK ((operator = ANY (ARRAY['equal'::text, 'not_equal'::text, 'greater_than'::text, 'less_than'::text, 'greater_than_or_equal'::text, 'less_than_or_equal'::text, 'contains'::text, 'not_contains'::text, 'starts_with'::text, 'ends_with'::text, 'matches_regex'::text, 'not_matches_regex'::text, 'is_empty'::text, 'not_empty'::text]))),
    CONSTRAINT requirements_value_type_check CHECK ((value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])))
);
--> statement-breakpoint
CREATE TABLE rules.content_packages (
    name text NOT NULL,
    type text NOT NULL,
    version integer NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE rules.contributors (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    ruleset_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    role public.contributor_role DEFAULT 'Editor'::public.contributor_role NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    invited_by uuid NOT NULL,
    CONSTRAINT contributors_email_or_user CHECK (((user_id IS NOT NULL) OR (email IS NOT NULL))),
    CONSTRAINT contributors_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Active'::text, 'Rejected'::text, 'Revoked'::text])))
);
--> statement-breakpoint
CREATE TABLE rules.entities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ruleset_id uuid NOT NULL,
    type text NOT NULL,
    name text,
    description text,
    owner_id uuid,
    owner_type text,
    owned boolean GENERATED ALWAYS AS ((owner_id IS NOT NULL)) STORED,
    "position" integer,
    partition text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entities_check CHECK (((name IS NOT NULL) OR ((owner_id IS NOT NULL) AND ("position" IS NOT NULL))))
);
--> statement-breakpoint
CREATE TABLE rules.entity_fields (
    entity_id uuid NOT NULL,
    entity_type text NOT NULL,
    field text NOT NULL,
    ordinal smallint DEFAULT 0 NOT NULL,
    value_kind text NOT NULL,
    multiple boolean NOT NULL,
    text_value text,
    number_value numeric,
    flag_value boolean,
    value_key text GENERATED ALWAYS AS (COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_fields_check CHECK ((multiple OR (ordinal = 0))),
    CONSTRAINT entity_fields_check1 CHECK ((((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text)))),
    CONSTRAINT entity_fields_number_value_check CHECK ((number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric]))),
    CONSTRAINT entity_fields_ordinal_check CHECK ((ordinal >= 0))
);
--> statement-breakpoint
CREATE TABLE rules.entity_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_id uuid NOT NULL,
    from_type text NOT NULL,
    role text NOT NULL,
    single boolean NOT NULL,
    to_id uuid NOT NULL,
    to_type text NOT NULL,
    via_id uuid,
    via_type text,
    has_via boolean GENERATED ALWAYS AS ((via_id IS NOT NULL)) STORED,
    tier integer,
    amount integer,
    free boolean DEFAULT false NOT NULL,
    ordinal integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT entity_links_ordinal_check CHECK ((ordinal >= 0))
);
--> statement-breakpoint
CREATE TABLE rules.entity_snapshots (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    ruleset_id uuid NOT NULL,
    source_entity_id uuid NOT NULL,
    forked_entity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE rules.entity_types (
    type text NOT NULL,
    owner_type text,
    owned boolean GENERATED ALWAYS AS ((owner_type IS NOT NULL)) STORED
);
--> statement-breakpoint
CREATE TABLE rules.field_defs (
    owner_kind text NOT NULL,
    owner_type text NOT NULL,
    entity_type text GENERATED ALWAYS AS (
CASE
    WHEN (owner_kind = 'entity'::text) THEN owner_type
    ELSE NULL::text
END) STORED,
    field text NOT NULL,
    value_kind text NOT NULL,
    multiple boolean NOT NULL,
    CONSTRAINT field_defs_check CHECK ((((owner_kind = 'ruleset'::text) = (owner_type = 'rulesets'::text)) AND ((owner_kind = 'character'::text) = (owner_type = 'characters'::text)))),
    CONSTRAINT field_defs_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['entity'::text, 'ruleset'::text, 'character'::text]))),
    CONSTRAINT field_defs_value_kind_check CHECK ((value_kind = ANY (ARRAY['text'::text, 'number'::text, 'flag'::text])))
);
--> statement-breakpoint
CREATE TABLE rules.link_role_kinds (
    role text NOT NULL,
    from_type text NOT NULL,
    single boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE rules.link_roles (
    role text NOT NULL,
    from_type text NOT NULL,
    to_type text NOT NULL,
    via_type text,
    has_via boolean GENERATED ALWAYS AS ((via_type IS NOT NULL)) STORED,
    single boolean NOT NULL,
    on_delete text NOT NULL,
    via_on_delete text NOT NULL,
    CONSTRAINT link_roles_on_delete_check CHECK ((on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text, 'delete'::text]))),
    CONSTRAINT link_roles_via_on_delete_check CHECK ((via_on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text])))
);
--> statement-breakpoint
CREATE TABLE rules.modules (
    base_rules text NOT NULL
);
--> statement-breakpoint
CREATE TABLE rules.ruleset_extensions (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    ruleset_id uuid NOT NULL,
    extension_id uuid NOT NULL,
    ordinal integer NOT NULL,
    CONSTRAINT ruleset_extensions_ordinal_check CHECK ((ordinal >= 0))
);
--> statement-breakpoint
CREATE TABLE rules.ruleset_fields (
    ruleset_id uuid NOT NULL,
    owner_type text DEFAULT 'rulesets'::text NOT NULL,
    field text NOT NULL,
    ordinal smallint DEFAULT 0 NOT NULL,
    value_kind text NOT NULL,
    multiple boolean NOT NULL,
    text_value text,
    number_value numeric,
    flag_value boolean,
    value_key text GENERATED ALWAYS AS (COALESCE(md5(text_value), (trim_scale(number_value))::text, (flag_value)::text)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ruleset_fields_check CHECK ((multiple OR (ordinal = 0))),
    CONSTRAINT ruleset_fields_check1 CHECK ((((text_value IS NOT NULL) = (value_kind = 'text'::text)) AND ((number_value IS NOT NULL) = (value_kind = 'number'::text)) AND ((flag_value IS NOT NULL) = (value_kind = 'flag'::text)))),
    CONSTRAINT ruleset_fields_number_value_check CHECK ((number_value <> ALL (ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric]))),
    CONSTRAINT ruleset_fields_ordinal_check CHECK ((ordinal >= 0)),
    CONSTRAINT ruleset_fields_owner_type_check CHECK ((owner_type = 'rulesets'::text))
);
--> statement-breakpoint
CREATE TABLE rules.ruleset_links (
    ruleset_id uuid NOT NULL,
    role text NOT NULL,
    to_id uuid NOT NULL,
    to_type text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE rules.ruleset_roles (
    role text NOT NULL,
    to_type text NOT NULL,
    on_delete text NOT NULL,
    CONSTRAINT ruleset_roles_on_delete_check CHECK ((on_delete = ANY (ARRAY['refuse'::text, 'unlink'::text])))
);
--> statement-breakpoint
CREATE TABLE rules.rulesets (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    ruleset_id uuid,
    description text NOT NULL,
    user_id uuid,
    private boolean DEFAULT false NOT NULL,
    status public.ruleset_status DEFAULT 'Draft'::public.ruleset_status NOT NULL,
    base_rules text NOT NULL,
    system boolean DEFAULT false NOT NULL,
    kind public.ruleset_kind DEFAULT 'ruleset'::public.ruleset_kind NOT NULL,
    content_version bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE storage.attachments (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    record_type text NOT NULL,
    record_id uuid NOT NULL,
    name text NOT NULL,
    blob_id uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE storage.blobs (
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    key text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    byte_size integer NOT NULL,
    metadata json DEFAULT '{}'::json NOT NULL,
    attached_at timestamp with time zone
);
--> statement-breakpoint
CREATE FUNCTION "character".touch_characters(character_ids uuid[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
--> statement-breakpoint
CREATE FUNCTION "character".touch_characters_of_advancement_rows() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM character.touch_characters(
    ARRAY(SELECT a.character_id FROM changed_rows r JOIN character.advancements a ON a.id = r.advancement_id)
  );
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "character".touch_characters_of_rows() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT character_id FROM changed_rows));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "character".touch_masters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(
    SELECT parent_character_id FROM changed_rows
    WHERE parent_character_id IS NOT NULL AND (TG_OP = 'DELETE' OR last_changed_at >= now())
  ));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION "character".touch_own_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
CREATE FUNCTION customization.delete_owned_customizations() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- A statement trigger fires on a delete of no row too: the modifiers' would set off its own delete forever
  IF NOT EXISTS (SELECT FROM deleted_rows) THEN
    RETURN NULL;
  END IF;
  DELETE FROM customization.modifiers m USING deleted_rows d WHERE m.source_type = TG_ARGV[0] AND m.source_id = d.id;
  DELETE FROM customization.requirements r USING deleted_rows d WHERE r.entity_type = TG_ARGV[0] AND r.entity_id = d.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION customization.touch_characters_of_customizations() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
CREATE FUNCTION customization.touch_characters_of_modifiers() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT source_id FROM changed_rows WHERE source_type = 'characters'));
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION rules.apply_delete_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
--> statement-breakpoint
CREATE FUNCTION rules.delete_entity_customizations() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT FROM deleted_rows) THEN
    RETURN NULL;
  END IF;
  DELETE FROM customization.modifiers m USING deleted_rows d WHERE m.source_id = d.id AND m.source_type = d.type;
  DELETE FROM customization.requirements r USING deleted_rows d WHERE r.entity_id = d.id AND r.entity_type = d.type;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION storage.delete_owned_attachments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  DELETE FROM storage.attachments a USING deleted_rows d WHERE a.record_type = TG_ARGV[0] AND a.record_id = d.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION storage.touch_characters_of_attachments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM character.touch_characters(ARRAY(SELECT record_id FROM changed_rows WHERE record_type = 'Character'));
  RETURN NULL;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;
--> statement-breakpoint
ALTER TABLE ONLY account.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.exports
    ADD CONSTRAINT exports_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.oauth_accounts
    ADD CONSTRAINT oauth_accounts_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.password_resets
    ADD CONSTRAINT password_resets_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY account.starred_rulesets
    ADD CONSTRAINT starred_rulesets_pkey PRIMARY KEY (user_id, ruleset_id);
--> statement-breakpoint
ALTER TABLE ONLY account.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY campaign.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY campaign.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY campaign.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".advancements
    ADD CONSTRAINT advancements_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".character_contributors
    ADD CONSTRAINT character_contributors_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".character_roles
    ADD CONSTRAINT character_roles_pkey PRIMARY KEY (role);
--> statement-breakpoint
ALTER TABLE ONLY "character".character_roles
    ADD CONSTRAINT character_roles_role_entity_type_single_key UNIQUE (role, entity_type, single);
--> statement-breakpoint
ALTER TABLE ONLY "character".characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".fields
    ADD CONSTRAINT fields_pkey PRIMARY KEY (character_id, field, ordinal);
--> statement-breakpoint
ALTER TABLE ONLY "character".inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".item_types
    ADD CONSTRAINT item_types_pkey PRIMARY KEY (entity_type);
--> statement-breakpoint
ALTER TABLE ONLY "character".links
    ADD CONSTRAINT links_character_id_role_entity_id_key UNIQUE (character_id, role, entity_id);
--> statement-breakpoint
ALTER TABLE ONLY "character".links
    ADD CONSTRAINT links_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_pkey PRIMARY KEY (step);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_step_entity_type_key UNIQUE (step, entity_type);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_step_has_entity_has_via_key UNIQUE (step, has_entity, has_via);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_step_repeats_key UNIQUE (step, repeats);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_step_via_type_key UNIQUE (step, via_type);
--> statement-breakpoint
ALTER TABLE ONLY customization.modifiers
    ADD CONSTRAINT modifiers_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY customization.requirements
    ADD CONSTRAINT requirements_entity_id_entity_type_level_key UNIQUE (entity_id, entity_type, level);
--> statement-breakpoint
ALTER TABLE ONLY customization.requirements
    ADD CONSTRAINT requirements_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY rules.content_packages
    ADD CONSTRAINT content_packages_pkey PRIMARY KEY (name);
--> statement-breakpoint
ALTER TABLE ONLY rules.contributors
    ADD CONSTRAINT contributors_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_id_ruleset_id_key UNIQUE (id, ruleset_id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_id_type_key UNIQUE (id, type);
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_fields
    ADD CONSTRAINT entity_fields_pkey PRIMARY KEY (entity_id, field, ordinal);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_from_id_role_to_id_key UNIQUE (from_id, role, to_id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_snapshots
    ADD CONSTRAINT entity_snapshots_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_snapshots
    ADD CONSTRAINT entity_snapshots_ruleset_id_source_entity_id_key UNIQUE (ruleset_id, source_entity_id);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_types
    ADD CONSTRAINT entity_types_pkey PRIMARY KEY (type);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_types
    ADD CONSTRAINT entity_types_type_owned_key UNIQUE (type, owned);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_types
    ADD CONSTRAINT entity_types_type_owner_type_key UNIQUE (type, owner_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.field_defs
    ADD CONSTRAINT field_defs_owner_type_field_value_kind_multiple_key UNIQUE (owner_type, field, value_kind, multiple);
--> statement-breakpoint
ALTER TABLE ONLY rules.field_defs
    ADD CONSTRAINT field_defs_pkey PRIMARY KEY (owner_type, field);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_role_kinds
    ADD CONSTRAINT link_role_kinds_pkey PRIMARY KEY (role, from_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_role_kinds
    ADD CONSTRAINT link_role_kinds_role_from_type_single_key UNIQUE (role, from_type, single);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_pkey PRIMARY KEY (role, from_type, to_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_role_from_type_to_type_has_via_key UNIQUE (role, from_type, to_type, has_via);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_role_from_type_to_type_single_key UNIQUE (role, from_type, to_type, single);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_role_from_type_to_type_via_type_key UNIQUE (role, from_type, to_type, via_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (base_rules);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_extensions
    ADD CONSTRAINT ruleset_extensions_pkey PRIMARY KEY (ruleset_id, extension_id);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_fields
    ADD CONSTRAINT ruleset_fields_pkey PRIMARY KEY (ruleset_id, field, ordinal);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_links
    ADD CONSTRAINT ruleset_links_pkey PRIMARY KEY (ruleset_id, role);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_roles
    ADD CONSTRAINT ruleset_roles_pkey PRIMARY KEY (role);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_roles
    ADD CONSTRAINT ruleset_roles_role_to_type_key UNIQUE (role, to_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.rulesets
    ADD CONSTRAINT rulesets_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY storage.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
--> statement-breakpoint
ALTER TABLE ONLY storage.blobs
    ADD CONSTRAINT blobs_pkey PRIMARY KEY (id);
--> statement-breakpoint
CREATE INDEX activities_created_at_idx ON account.activities USING btree (created_at);
--> statement-breakpoint
CREATE INDEX activities_target_id_target_type ON account.activities USING btree (target_id, target_type);
--> statement-breakpoint
CREATE INDEX activities_user_id_created_at_idx ON account.activities USING btree (user_id, created_at DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX api_keys_digest ON account.api_keys USING btree (digest);
--> statement-breakpoint
CREATE INDEX api_keys_expires_at ON account.api_keys USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX api_keys_user_id ON account.api_keys USING btree (user_id);
--> statement-breakpoint
CREATE INDEX email_verifications_expires_at_idx ON account.email_verifications USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX email_verifications_user_id ON account.email_verifications USING btree (user_id);
--> statement-breakpoint
CREATE INDEX exports_expires_at_idx ON account.exports USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX exports_user_id_idx ON account.exports USING btree (user_id);
--> statement-breakpoint
CREATE INDEX notifications_activity_id_idx ON account.notifications USING btree (activity_id);
--> statement-breakpoint
CREATE INDEX notifications_actor_id_idx ON account.notifications USING btree (actor_id);
--> statement-breakpoint
CREATE INDEX notifications_created_at_idx ON account.notifications USING btree (created_at);
--> statement-breakpoint
CREATE INDEX notifications_recipient_id_created_at_idx ON account.notifications USING btree (recipient_id, created_at DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX notifications_recipient_unread_idx ON account.notifications USING btree (recipient_id, created_at DESC NULLS LAST) WHERE (read_at IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX oauth_accounts_provider_provider_account_id ON account.oauth_accounts USING btree (provider, provider_account_id) WHERE (deleted_at IS NULL);
--> statement-breakpoint
CREATE INDEX oauth_accounts_user_id ON account.oauth_accounts USING btree (user_id);
--> statement-breakpoint
CREATE INDEX password_resets_expires_at_idx ON account.password_resets USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX password_resets_user_id ON account.password_resets USING btree (user_id);
--> statement-breakpoint
CREATE INDEX sessions_expires_at_idx ON account.sessions USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX sessions_user_id ON account.sessions USING btree (user_id);
--> statement-breakpoint
CREATE INDEX starred_rulesets_ruleset_id_idx ON account.starred_rulesets USING btree (ruleset_id);
--> statement-breakpoint
CREATE UNIQUE INDEX users_email ON account.users USING btree (email_address);
--> statement-breakpoint
CREATE INDEX users_expires_at_idx ON account.users USING btree (expires_at);
--> statement-breakpoint
CREATE INDEX users_search_trgm_idx ON account.users USING gin (username public.gin_trgm_ops, email_address public.gin_trgm_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX users_username ON account.users USING btree (username);
--> statement-breakpoint
CREATE INDEX campaigns_ruleset_id_name_idx ON campaign.campaigns USING btree (ruleset_id, name text_pattern_ops);
--> statement-breakpoint
CREATE INDEX campaigns_search_trgm_idx ON campaign.campaigns USING gin (name public.gin_trgm_ops, description public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX invites_email_status_idx ON campaign.invites USING btree (email, status) WHERE (deleted_at IS NULL);
--> statement-breakpoint
CREATE INDEX invites_player_id_idx ON campaign.invites USING btree (player_id);
--> statement-breakpoint
CREATE INDEX invites_user_id_status_idx ON campaign.invites USING btree (user_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX player_characters_character_id_active_idx ON campaign.player_characters USING btree (character_id);
--> statement-breakpoint
CREATE INDEX player_characters_player_id_character_id_idx ON campaign.player_characters USING btree (player_id, character_id);
--> statement-breakpoint
CREATE INDEX players_campaign_id_idx ON campaign.players USING btree (campaign_id);
--> statement-breakpoint
CREATE INDEX players_user_id_campaign_id_idx ON campaign.players USING btree (user_id, campaign_id);
--> statement-breakpoint
CREATE INDEX advancement_picks_entity_idx ON "character".advancement_picks USING btree (entity_id) WHERE (entity_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX advancement_picks_unique_idx ON "character".advancement_picks USING btree (advancement_id, step, entity_key, ordinal);
--> statement-breakpoint
CREATE INDEX advancement_picks_via_idx ON "character".advancement_picks USING btree (via_id) WHERE (via_id IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX advancements_character_entry_idx ON "character".advancements USING btree (character_id, entry_id);
--> statement-breakpoint
CREATE UNIQUE INDEX advancements_character_position_idx ON "character".advancements USING btree (character_id, "position");
--> statement-breakpoint
CREATE INDEX advancements_entry_idx ON "character".advancements USING btree (entry_id);
--> statement-breakpoint
CREATE UNIQUE INDEX character_contributors_character_email_unique ON "character".character_contributors USING btree (character_id, email) WHERE ((user_id IS NULL) AND (status = ANY (ARRAY['Pending'::text, 'Active'::text])));
--> statement-breakpoint
CREATE INDEX character_contributors_character_status_idx ON "character".character_contributors USING btree (character_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX character_contributors_character_user_unique ON "character".character_contributors USING btree (character_id, user_id) WHERE (status = ANY (ARRAY['Pending'::text, 'Active'::text]));
--> statement-breakpoint
CREATE INDEX character_contributors_invited_by_idx ON "character".character_contributors USING btree (invited_by);
--> statement-breakpoint
CREATE INDEX character_contributors_user_status_idx ON "character".character_contributors USING btree (user_id, status);
--> statement-breakpoint
CREATE INDEX character_inventory_character_id ON "character".inventory USING btree (character_id);
--> statement-breakpoint
CREATE INDEX character_inventory_item_id ON "character".inventory USING btree (item_id);
--> statement-breakpoint
CREATE UNIQUE INDEX characters_one_live_child_per_kind_idx ON "character".characters USING btree (parent_character_id, kind) WHERE ((deleted_at IS NULL) AND (parent_character_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX characters_parent_character_id_idx ON "character".characters USING btree (parent_character_id) WHERE (parent_character_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX characters_ruleset_id_idx ON "character".characters USING btree (ruleset_id);
--> statement-breakpoint
CREATE INDEX characters_search_trgm_idx ON "character".characters USING gin (name public.gin_trgm_ops, description public.gin_trgm_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX characters_share_token_unique_idx ON "character".characters USING btree (share_token) WHERE (share_token IS NOT NULL);
--> statement-breakpoint
CREATE INDEX characters_user_id_idx ON "character".characters USING btree (user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX fields_set_value_idx ON "character".fields USING btree (character_id, field, value_key) WHERE multiple;
--> statement-breakpoint
CREATE INDEX links_entity_idx ON "character".links USING btree (entity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX links_single_idx ON "character".links USING btree (character_id, role) WHERE single;
--> statement-breakpoint
CREATE INDEX modifiers_source_idx ON customization.modifiers USING btree (source_id, source_type);
--> statement-breakpoint
CREATE INDEX contributors_email_trgm_idx ON rules.contributors USING gin (email public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX contributors_invited_by_idx ON rules.contributors USING btree (invited_by);
--> statement-breakpoint
CREATE UNIQUE INDEX contributors_ruleset_email_unique ON rules.contributors USING btree (ruleset_id, email) WHERE ((user_id IS NULL) AND (status = ANY (ARRAY['Pending'::text, 'Active'::text])));
--> statement-breakpoint
CREATE INDEX contributors_ruleset_status_idx ON rules.contributors USING btree (ruleset_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX contributors_ruleset_user_unique ON rules.contributors USING btree (ruleset_id, user_id) WHERE (status = ANY (ARRAY['Pending'::text, 'Active'::text]));
--> statement-breakpoint
CREATE INDEX contributors_user_status_idx ON rules.contributors USING btree (user_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX entities_name_unique_idx ON rules.entities USING btree (ruleset_id, type, partition, name) WHERE (name IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX entities_owner_position_unique_idx ON rules.entities USING btree (owner_id, "position") WHERE (owner_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX entities_ruleset_type_idx ON rules.entities USING btree (ruleset_id, type);
--> statement-breakpoint
CREATE INDEX entities_search_idx ON rules.entities USING gin (name public.gin_trgm_ops, description public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX entity_fields_field_idx ON rules.entity_fields USING btree (field, entity_id);
--> statement-breakpoint
CREATE UNIQUE INDEX entity_fields_set_value_idx ON rules.entity_fields USING btree (entity_id, field, value_key) WHERE multiple;
--> statement-breakpoint
CREATE INDEX entity_fields_text_idx ON rules.entity_fields USING hash (text_value);
--> statement-breakpoint
CREATE UNIQUE INDEX entity_links_single_idx ON rules.entity_links USING btree (from_id, role) WHERE single;
--> statement-breakpoint
CREATE INDEX entity_links_to_idx ON rules.entity_links USING btree (to_id, role);
--> statement-breakpoint
CREATE INDEX entity_links_via_idx ON rules.entity_links USING btree (via_id) WHERE (via_id IS NOT NULL);
--> statement-breakpoint
CREATE INDEX entity_snapshots_source_entity_id_idx ON rules.entity_snapshots USING btree (source_entity_id);
--> statement-breakpoint
CREATE INDEX ruleset_extensions_extension_id_idx ON rules.ruleset_extensions USING btree (extension_id);
--> statement-breakpoint
CREATE UNIQUE INDEX ruleset_extensions_ruleset_id_ordinal_idx ON rules.ruleset_extensions USING btree (ruleset_id, ordinal) WHERE (deleted_at IS NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX ruleset_fields_set_value_idx ON rules.ruleset_fields USING btree (ruleset_id, field, value_key) WHERE multiple;
--> statement-breakpoint
CREATE INDEX ruleset_links_to_idx ON rules.ruleset_links USING btree (to_id);
--> statement-breakpoint
CREATE UNIQUE INDEX rulesets_name_unique_idx ON rules.rulesets USING btree (name);
--> statement-breakpoint
CREATE INDEX rulesets_ruleset_id_idx ON rules.rulesets USING btree (ruleset_id);
--> statement-breakpoint
CREATE INDEX rulesets_search_trgm_idx ON rules.rulesets USING gin (name public.gin_trgm_ops, description public.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX rulesets_status_idx ON rules.rulesets USING btree (status);
--> statement-breakpoint
CREATE INDEX rulesets_user_id_status_idx ON rules.rulesets USING btree (user_id, status);
--> statement-breakpoint
CREATE INDEX attachments_blob_id_idx ON storage.attachments USING btree (blob_id);
--> statement-breakpoint
CREATE UNIQUE INDEX attachments_record_name_unique_idx ON storage.attachments USING btree (record_type, record_id, name);
--> statement-breakpoint
CREATE INDEX blobs_attached_idx ON storage.blobs USING btree (created_at) WHERE (attached_at IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX blobs_key_unique_idx ON storage.blobs USING btree (key);
--> statement-breakpoint
CREATE INDEX blobs_pending_idx ON storage.blobs USING btree (created_at) WHERE (attached_at IS NULL);
--> statement-breakpoint
CREATE TRIGGER delete_attachments AFTER DELETE ON account.users REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.delete_owned_attachments('User');
--> statement-breakpoint
CREATE TRIGGER delete_attachments AFTER DELETE ON "character".characters REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.delete_owned_attachments('Character');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON "character".characters REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('characters');
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".advancement_picks REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_advancement_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".advancements REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".characters REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_masters();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".fields REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".inventory REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON "character".links REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".advancement_picks REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_advancement_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".advancements REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".characters REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_masters();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".fields REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".inventory REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON "character".links REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".advancement_picks REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_advancement_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".advancements REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".characters REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_masters();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".fields REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".inventory REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON "character".links REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "character".touch_characters_of_rows();
--> statement-breakpoint
CREATE TRIGGER touch_own_row BEFORE UPDATE ON "character".characters FOR EACH ROW EXECUTE FUNCTION "character".touch_own_row();
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON customization.modifiers REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('modifiers');
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON customization.modifiers REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_modifiers();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON customization.requirements REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_customizations();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON customization.modifiers REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_modifiers();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON customization.requirements REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_customizations();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON customization.modifiers REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_modifiers();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON customization.requirements REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.touch_characters_of_customizations();
--> statement-breakpoint
CREATE TRIGGER apply_delete_rules AFTER DELETE ON rules.entities FOR EACH ROW EXECUTE FUNCTION rules.apply_delete_rules();
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.entities REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION rules.delete_entity_customizations();
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.rulesets REFERENCING OLD TABLE AS deleted_rows FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('rulesets');
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_delete AFTER DELETE ON storage.attachments REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.touch_characters_of_attachments();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_insert AFTER INSERT ON storage.attachments REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.touch_characters_of_attachments();
--> statement-breakpoint
CREATE TRIGGER touch_characters_on_update AFTER UPDATE ON storage.attachments REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION storage.touch_characters_of_attachments();
--> statement-breakpoint
ALTER TABLE ONLY account.activities
    ADD CONSTRAINT activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.email_verifications
    ADD CONSTRAINT email_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.exports
    ADD CONSTRAINT exports_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.notifications
    ADD CONSTRAINT notifications_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES account.activities(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY account.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.oauth_accounts
    ADD CONSTRAINT oauth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.password_resets
    ADD CONSTRAINT password_resets_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.starred_rulesets
    ADD CONSTRAINT starred_rulesets_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY account.starred_rulesets
    ADD CONSTRAINT starred_rulesets_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.campaigns
    ADD CONSTRAINT campaigns_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.invites
    ADD CONSTRAINT invites_player_id_fkey FOREIGN KEY (player_id) REFERENCES campaign.players(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.invites
    ADD CONSTRAINT invites_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.player_characters
    ADD CONSTRAINT player_characters_character_id_fkey FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.player_characters
    ADD CONSTRAINT player_characters_player_id_fkey FOREIGN KEY (player_id) REFERENCES campaign.players(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.players
    ADD CONSTRAINT players_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaign.campaigns(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY campaign.players
    ADD CONSTRAINT players_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_advancement_id_fkey FOREIGN KEY (advancement_id) REFERENCES "character".advancements(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_step_entity_type_fkey FOREIGN KEY (step, entity_type) REFERENCES "character".steps(step, entity_type);
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_step_has_entity_has_via_fkey FOREIGN KEY (step, has_entity, has_via) REFERENCES "character".steps(step, has_entity, has_via);
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_step_repeats_fkey FOREIGN KEY (step, repeats) REFERENCES "character".steps(step, repeats) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_step_via_type_fkey FOREIGN KEY (step, via_type) REFERENCES "character".steps(step, via_type);
--> statement-breakpoint
ALTER TABLE ONLY "character".advancement_picks
    ADD CONSTRAINT advancement_picks_via_id_via_type_fkey FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancements
    ADD CONSTRAINT advancements_character_id_fkey FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".advancements
    ADD CONSTRAINT advancements_entry_id_entry_type_fkey FOREIGN KEY (entry_id, entry_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY "character".character_contributors
    ADD CONSTRAINT character_contributors_character_id_fk FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".character_contributors
    ADD CONSTRAINT character_contributors_invited_by_fk FOREIGN KEY (invited_by) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".character_contributors
    ADD CONSTRAINT character_contributors_user_id_fk FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".character_roles
    ADD CONSTRAINT character_roles_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY "character".characters
    ADD CONSTRAINT characters_parent_character_id_fkey FOREIGN KEY (parent_character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".characters
    ADD CONSTRAINT characters_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".characters
    ADD CONSTRAINT characters_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".fields
    ADD CONSTRAINT fields_character_id_fkey FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".fields
    ADD CONSTRAINT fields_owner_type_field_value_kind_multiple_fkey FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".inventory
    ADD CONSTRAINT inventory_character_id_fkey FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".inventory
    ADD CONSTRAINT inventory_item_entity_fkey FOREIGN KEY (item_id, item_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY "character".inventory
    ADD CONSTRAINT inventory_item_type_fkey FOREIGN KEY (item_type) REFERENCES "character".item_types(entity_type);
--> statement-breakpoint
ALTER TABLE ONLY "character".item_types
    ADD CONSTRAINT item_types_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY "character".links
    ADD CONSTRAINT links_character_id_fkey FOREIGN KEY (character_id) REFERENCES "character".characters(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".links
    ADD CONSTRAINT links_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY "character".links
    ADD CONSTRAINT links_role_entity_type_single_fkey FOREIGN KEY (role, entity_type, single) REFERENCES "character".character_roles(role, entity_type, single) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY "character".steps
    ADD CONSTRAINT steps_via_type_fkey FOREIGN KEY (via_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.contributors
    ADD CONSTRAINT contributors_invited_by_fk FOREIGN KEY (invited_by) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.contributors
    ADD CONSTRAINT contributors_ruleset_id_fk FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.contributors
    ADD CONSTRAINT contributors_user_id_fk FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_owner_id_owner_type_fkey FOREIGN KEY (owner_id, owner_type) REFERENCES rules.entities(id, type) MATCH FULL ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_owner_id_ruleset_id_fkey FOREIGN KEY (owner_id, ruleset_id) REFERENCES rules.entities(id, ruleset_id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_type_owned_fkey FOREIGN KEY (type, owned) REFERENCES rules.entity_types(type, owned);
--> statement-breakpoint
ALTER TABLE ONLY rules.entities
    ADD CONSTRAINT entities_type_owner_type_fkey FOREIGN KEY (type, owner_type) REFERENCES rules.entity_types(type, owner_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_fields
    ADD CONSTRAINT entity_fields_entity_id_entity_type_fkey FOREIGN KEY (entity_id, entity_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_fields
    ADD CONSTRAINT entity_fields_entity_type_field_value_kind_multiple_fkey FOREIGN KEY (entity_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_from_id_from_type_fkey FOREIGN KEY (from_id, from_type) REFERENCES rules.entities(id, type) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_role_from_type_to_type_has_via_fkey FOREIGN KEY (role, from_type, to_type, has_via) REFERENCES rules.link_roles(role, from_type, to_type, has_via);
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_role_from_type_to_type_single_fkey FOREIGN KEY (role, from_type, to_type, single) REFERENCES rules.link_roles(role, from_type, to_type, single) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_role_from_type_to_type_via_type_fkey FOREIGN KEY (role, from_type, to_type, via_type) REFERENCES rules.link_roles(role, from_type, to_type, via_type) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_to_id_to_type_fkey FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_links
    ADD CONSTRAINT entity_links_via_id_via_type_fkey FOREIGN KEY (via_id, via_type) REFERENCES rules.entities(id, type) MATCH FULL DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_snapshots
    ADD CONSTRAINT entity_snapshots_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.entity_types
    ADD CONSTRAINT entity_types_owner_type_fkey FOREIGN KEY (owner_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.field_defs
    ADD CONSTRAINT field_defs_entity_type_fkey FOREIGN KEY (entity_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_role_kinds
    ADD CONSTRAINT link_role_kinds_from_type_fkey FOREIGN KEY (from_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_from_type_fkey FOREIGN KEY (from_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_role_from_type_single_fkey FOREIGN KEY (role, from_type, single) REFERENCES rules.link_role_kinds(role, from_type, single) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_to_type_fkey FOREIGN KEY (to_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.link_roles
    ADD CONSTRAINT link_roles_via_type_fkey FOREIGN KEY (via_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_extensions
    ADD CONSTRAINT ruleset_extensions_extension_id_fkey FOREIGN KEY (extension_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_extensions
    ADD CONSTRAINT ruleset_extensions_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_fields
    ADD CONSTRAINT ruleset_fields_owner_type_field_value_kind_multiple_fkey FOREIGN KEY (owner_type, field, value_kind, multiple) REFERENCES rules.field_defs(owner_type, field, value_kind, multiple) ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_fields
    ADD CONSTRAINT ruleset_fields_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_links
    ADD CONSTRAINT ruleset_links_role_to_type_fkey FOREIGN KEY (role, to_type) REFERENCES rules.ruleset_roles(role, to_type);
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_links
    ADD CONSTRAINT ruleset_links_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_links
    ADD CONSTRAINT ruleset_links_to_id_to_type_fkey FOREIGN KEY (to_id, to_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE ONLY rules.ruleset_roles
    ADD CONSTRAINT ruleset_roles_to_type_fkey FOREIGN KEY (to_type) REFERENCES rules.entity_types(type);
--> statement-breakpoint
ALTER TABLE ONLY rules.rulesets
    ADD CONSTRAINT rulesets_base_rules_fkey FOREIGN KEY (base_rules) REFERENCES rules.modules(base_rules);
--> statement-breakpoint
ALTER TABLE ONLY rules.rulesets
    ADD CONSTRAINT rulesets_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES rules.rulesets(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY rules.rulesets
    ADD CONSTRAINT rulesets_user_id_fkey FOREIGN KEY (user_id) REFERENCES account.users(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ONLY storage.attachments
    ADD CONSTRAINT attachments_blob_id_fkey FOREIGN KEY (blob_id) REFERENCES storage.blobs(id) ON DELETE CASCADE;
