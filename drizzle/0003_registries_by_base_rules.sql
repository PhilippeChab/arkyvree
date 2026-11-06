-- Every base rules declares its own entity types, fields, link roles, ruleset and character roles, steps and item
-- types: each registry is keyed by base rules first, and so is every key into one, each row naming its base rules.
-- Every row today is 3.5's, which the new columns' default fills; the defaults go at the end.

-- 1. The keys into the registries, and the registries' keys to each other, which change
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" DROP CONSTRAINT "advancement_picks_step_entity_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" DROP CONSTRAINT "advancement_picks_step_has_entity_has_via_fkey";
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" DROP CONSTRAINT "advancement_picks_step_repeats_fkey";
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" DROP CONSTRAINT "advancement_picks_step_via_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."character_roles" DROP CONSTRAINT "character_roles_entity_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entities" DROP CONSTRAINT "entities_ruleset_id_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entities" DROP CONSTRAINT "entities_type_owned_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entities" DROP CONSTRAINT "entities_type_owner_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_fields" DROP CONSTRAINT "entity_fields_entity_type_field_value_kind_multiple_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" DROP CONSTRAINT "entity_links_role_from_type_to_type_has_via_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" DROP CONSTRAINT "entity_links_role_from_type_to_type_single_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" DROP CONSTRAINT "entity_links_role_from_type_to_type_via_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" DROP CONSTRAINT "entity_types_owner_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" DROP CONSTRAINT "field_defs_entity_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."fields" DROP CONSTRAINT "fields_owner_type_field_value_kind_multiple_fkey";
--> statement-breakpoint
ALTER TABLE "character"."inventory" DROP CONSTRAINT "inventory_item_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."item_types" DROP CONSTRAINT "item_types_entity_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" DROP CONSTRAINT "link_role_kinds_from_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_from_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_role_from_type_single_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_to_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_via_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."links" DROP CONSTRAINT "links_role_entity_type_single_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_fields" DROP CONSTRAINT "ruleset_fields_owner_type_field_value_kind_multiple_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_links" DROP CONSTRAINT "ruleset_links_role_to_type_fkey";
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" DROP CONSTRAINT "ruleset_roles_to_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_entity_type_fkey";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_via_type_fkey";
--> statement-breakpoint
-- 2. The registries' unique and primary keys
--> statement-breakpoint
ALTER TABLE "character"."character_roles" DROP CONSTRAINT "character_roles_role_entity_type_single_key";
--> statement-breakpoint
ALTER TABLE "character"."character_roles" DROP CONSTRAINT "character_roles_pkey";
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" DROP CONSTRAINT "entity_types_type_owner_type_key";
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" DROP CONSTRAINT "entity_types_type_owned_key";
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" DROP CONSTRAINT "entity_types_pkey";
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" DROP CONSTRAINT "field_defs_owner_type_field_value_kind_multiple_key";
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" DROP CONSTRAINT "field_defs_pkey";
--> statement-breakpoint
ALTER TABLE "character"."item_types" DROP CONSTRAINT "item_types_pkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" DROP CONSTRAINT "link_role_kinds_role_from_type_single_key";
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" DROP CONSTRAINT "link_role_kinds_pkey";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_role_from_type_to_type_single_key";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_role_from_type_to_type_has_via_key";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_role_from_type_to_type_via_type_key";
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" DROP CONSTRAINT "link_roles_pkey";
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" DROP CONSTRAINT "ruleset_roles_role_to_type_key";
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" DROP CONSTRAINT "ruleset_roles_pkey";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_step_has_entity_has_via_key";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_step_repeats_key";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_step_entity_type_key";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_step_via_type_key";
--> statement-breakpoint
ALTER TABLE "character"."steps" DROP CONSTRAINT "steps_pkey";
--> statement-breakpoint
-- 3. Each registry row, entity and row pointing at a registry names its base rules: today, 3.5
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."item_types" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."entities" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."entity_fields" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."links" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."fields" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "character"."inventory" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_fields" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_links" ADD COLUMN "base_rules" text DEFAULT 'Dungeons & Dragons: 3.5' NOT NULL;
--> statement-breakpoint
-- 4. The registries' keys, base rules first
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD CONSTRAINT "entity_types_pkey" PRIMARY KEY("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD CONSTRAINT "entity_types_type_owner_type_key" UNIQUE("base_rules","type","owner_type");
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD CONSTRAINT "entity_types_type_owned_key" UNIQUE("base_rules","type","owned");
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ADD CONSTRAINT "field_defs_pkey" PRIMARY KEY("base_rules","owner_type","field");
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ADD CONSTRAINT "field_defs_owner_type_field_value_kind_multiple_key" UNIQUE("base_rules","owner_type","field","value_kind","multiple");
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ADD CONSTRAINT "link_role_kinds_pkey" PRIMARY KEY("base_rules","role","from_type");
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ADD CONSTRAINT "link_role_kinds_role_from_type_single_key" UNIQUE("base_rules","role","from_type","single");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_pkey" PRIMARY KEY("base_rules","role","from_type","to_type");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_role_from_type_to_type_single_key" UNIQUE("base_rules","role","from_type","to_type","single");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_role_from_type_to_type_has_via_key" UNIQUE("base_rules","role","from_type","to_type","has_via");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_role_from_type_to_type_via_type_key" UNIQUE("base_rules","role","from_type","to_type","via_type");
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ADD CONSTRAINT "ruleset_roles_pkey" PRIMARY KEY("base_rules","role");
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ADD CONSTRAINT "ruleset_roles_role_to_type_key" UNIQUE("base_rules","role","to_type");
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ADD CONSTRAINT "character_roles_pkey" PRIMARY KEY("base_rules","role");
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ADD CONSTRAINT "character_roles_role_entity_type_single_key" UNIQUE("base_rules","role","entity_type","single");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_pkey" PRIMARY KEY("base_rules","step");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_step_has_entity_has_via_key" UNIQUE("base_rules","step","has_entity","has_via");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_step_repeats_key" UNIQUE("base_rules","step","repeats");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_step_entity_type_key" UNIQUE("base_rules","step","entity_type");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_step_via_type_key" UNIQUE("base_rules","step","via_type");
--> statement-breakpoint
ALTER TABLE "character"."item_types" ADD CONSTRAINT "item_types_pkey" PRIMARY KEY("base_rules","entity_type");
--> statement-breakpoint
ALTER TABLE "rules"."rulesets" ADD CONSTRAINT "rulesets_id_base_rules_key" UNIQUE("id","base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."entities" ADD CONSTRAINT "entities_id_base_rules_key" UNIQUE("id","base_rules");
--> statement-breakpoint
-- 5. The keys: each registry is of a base rules, each key into a registry names it, and an entity's, an entity's
-- fields' and links' and a ruleset's Settings' base rules are their ruleset's or their entity's
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD CONSTRAINT "entity_types_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ADD CONSTRAINT "entity_types_owner_type_fkey" FOREIGN KEY ("base_rules","owner_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ADD CONSTRAINT "field_defs_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ADD CONSTRAINT "field_defs_entity_type_fkey" FOREIGN KEY ("base_rules","entity_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ADD CONSTRAINT "link_role_kinds_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ADD CONSTRAINT "link_role_kinds_from_type_fkey" FOREIGN KEY ("base_rules","from_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_from_type_fkey" FOREIGN KEY ("base_rules","from_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_to_type_fkey" FOREIGN KEY ("base_rules","to_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_via_type_fkey" FOREIGN KEY ("base_rules","via_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ADD CONSTRAINT "link_roles_role_from_type_single_fkey" FOREIGN KEY ("base_rules","role","from_type","single") REFERENCES "rules"."link_role_kinds"("base_rules","role","from_type","single") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ADD CONSTRAINT "ruleset_roles_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ADD CONSTRAINT "ruleset_roles_to_type_fkey" FOREIGN KEY ("base_rules","to_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ADD CONSTRAINT "character_roles_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ADD CONSTRAINT "character_roles_entity_type_fkey" FOREIGN KEY ("base_rules","entity_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_entity_type_fkey" FOREIGN KEY ("base_rules","entity_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "character"."steps" ADD CONSTRAINT "steps_via_type_fkey" FOREIGN KEY ("base_rules","via_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "character"."item_types" ADD CONSTRAINT "item_types_base_rules_fkey" FOREIGN KEY ("base_rules") REFERENCES "rules"."modules"("base_rules");
--> statement-breakpoint
ALTER TABLE "character"."item_types" ADD CONSTRAINT "item_types_entity_type_fkey" FOREIGN KEY ("base_rules","entity_type") REFERENCES "rules"."entity_types"("base_rules","type");
--> statement-breakpoint
ALTER TABLE "rules"."entities" ADD CONSTRAINT "entities_ruleset_id_fkey" FOREIGN KEY ("ruleset_id","base_rules") REFERENCES "rules"."rulesets"("id","base_rules") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."entities" ADD CONSTRAINT "entities_type_owned_fkey" FOREIGN KEY ("base_rules","type","owned") REFERENCES "rules"."entity_types"("base_rules","type","owned");
--> statement-breakpoint
ALTER TABLE "rules"."entities" ADD CONSTRAINT "entities_type_owner_type_fkey" FOREIGN KEY ("base_rules","type","owner_type") REFERENCES "rules"."entity_types"("base_rules","type","owner_type");
--> statement-breakpoint
ALTER TABLE "rules"."entity_fields" ADD CONSTRAINT "entity_fields_entity_id_base_rules_fkey" FOREIGN KEY ("entity_id","base_rules") REFERENCES "rules"."entities"("id","base_rules") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."entity_fields" ADD CONSTRAINT "entity_fields_entity_type_field_value_kind_multiple_fkey" FOREIGN KEY ("base_rules","entity_type","field","value_kind","multiple") REFERENCES "rules"."field_defs"("base_rules","owner_type","field","value_kind","multiple") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ADD CONSTRAINT "entity_links_from_id_base_rules_fkey" FOREIGN KEY ("from_id","base_rules") REFERENCES "rules"."entities"("id","base_rules") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ADD CONSTRAINT "entity_links_role_from_type_to_type_has_via_fkey" FOREIGN KEY ("base_rules","role","from_type","to_type","has_via") REFERENCES "rules"."link_roles"("base_rules","role","from_type","to_type","has_via");
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ADD CONSTRAINT "entity_links_role_from_type_to_type_single_fkey" FOREIGN KEY ("base_rules","role","from_type","to_type","single") REFERENCES "rules"."link_roles"("base_rules","role","from_type","to_type","single") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ADD CONSTRAINT "entity_links_role_from_type_to_type_via_type_fkey" FOREIGN KEY ("base_rules","role","from_type","to_type","via_type") REFERENCES "rules"."link_roles"("base_rules","role","from_type","to_type","via_type") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ADD CONSTRAINT "advancement_picks_step_entity_type_fkey" FOREIGN KEY ("base_rules","step","entity_type") REFERENCES "character"."steps"("base_rules","step","entity_type");
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ADD CONSTRAINT "advancement_picks_step_has_entity_has_via_fkey" FOREIGN KEY ("base_rules","step","has_entity","has_via") REFERENCES "character"."steps"("base_rules","step","has_entity","has_via");
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ADD CONSTRAINT "advancement_picks_step_repeats_fkey" FOREIGN KEY ("base_rules","step","repeats") REFERENCES "character"."steps"("base_rules","step","repeats") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ADD CONSTRAINT "advancement_picks_step_via_type_fkey" FOREIGN KEY ("base_rules","step","via_type") REFERENCES "character"."steps"("base_rules","step","via_type");
--> statement-breakpoint
ALTER TABLE "character"."links" ADD CONSTRAINT "links_role_entity_type_single_fkey" FOREIGN KEY ("base_rules","role","entity_type","single") REFERENCES "character"."character_roles"("base_rules","role","entity_type","single") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "character"."fields" ADD CONSTRAINT "fields_owner_type_field_value_kind_multiple_fkey" FOREIGN KEY ("base_rules","owner_type","field","value_kind","multiple") REFERENCES "rules"."field_defs"("base_rules","owner_type","field","value_kind","multiple") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "character"."inventory" ADD CONSTRAINT "inventory_item_type_fkey" FOREIGN KEY ("base_rules","item_type") REFERENCES "character"."item_types"("base_rules","entity_type");
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_fields" ADD CONSTRAINT "ruleset_fields_ruleset_id_base_rules_fkey" FOREIGN KEY ("ruleset_id","base_rules") REFERENCES "rules"."rulesets"("id","base_rules") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_fields" ADD CONSTRAINT "ruleset_fields_owner_type_field_value_kind_multiple_fkey" FOREIGN KEY ("base_rules","owner_type","field","value_kind","multiple") REFERENCES "rules"."field_defs"("base_rules","owner_type","field","value_kind","multiple") ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_links" ADD CONSTRAINT "ruleset_links_ruleset_id_base_rules_fkey" FOREIGN KEY ("ruleset_id","base_rules") REFERENCES "rules"."rulesets"("id","base_rules") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_links" ADD CONSTRAINT "ruleset_links_role_to_type_fkey" FOREIGN KEY ("base_rules","role","to_type") REFERENCES "rules"."ruleset_roles"("base_rules","role","to_type");
--> statement-breakpoint
-- 6. A delete applies its entity's own base rules' rules: what names an entity is of its family
CREATE OR REPLACE FUNCTION rules.apply_delete_rules() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Entities a role deletes with what they point at (a save with its key ability)
  DELETE FROM rules.entities e USING rules.entity_links l, rules.link_roles r
   WHERE l.to_id = OLD.id AND r.base_rules = OLD.base_rules
     AND r.role = l.role AND r.from_type = l.from_type AND r.to_type = l.to_type
     AND r.on_delete = 'delete' AND e.id = l.from_id;
  DELETE FROM rules.entity_links l USING rules.link_roles r
   WHERE r.base_rules = OLD.base_rules AND r.role = l.role AND r.from_type = l.from_type AND r.to_type = l.to_type
     AND ((l.to_id = OLD.id AND r.on_delete = 'unlink') OR (l.via_id = OLD.id AND r.via_on_delete = 'unlink'));
  DELETE FROM rules.ruleset_links l USING rules.ruleset_roles r
   WHERE l.to_id = OLD.id AND r.base_rules = OLD.base_rules AND r.role = l.role AND r.on_delete = 'unlink';
  DELETE FROM character.links l USING character.character_roles r
   WHERE l.entity_id = OLD.id AND r.base_rules = OLD.base_rules AND r.role = l.role AND r.on_delete = 'delete';
  DELETE FROM character.advancement_picks p USING character.steps s
   WHERE p.entity_id = OLD.id AND s.base_rules = OLD.base_rules AND s.step = p.step AND s.on_delete = 'delete';
  RETURN NULL;
END $$;
--> statement-breakpoint
-- 7. The defaults go: a write names its row's base rules
--> statement-breakpoint
ALTER TABLE "rules"."entity_types" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."field_defs" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."link_role_kinds" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."link_roles" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_roles" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."character_roles" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."steps" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."item_types" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."entities" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."entity_fields" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."entity_links" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."advancement_picks" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."links" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."fields" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "character"."inventory" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_fields" ALTER COLUMN "base_rules" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_links" ALTER COLUMN "base_rules" DROP DEFAULT;
