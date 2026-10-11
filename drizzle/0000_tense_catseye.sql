CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
--> statement-breakpoint
CREATE SCHEMA "account";
--> statement-breakpoint
CREATE SCHEMA "campaign";
--> statement-breakpoint
CREATE SCHEMA "character";
--> statement-breakpoint
CREATE SCHEMA "customization";
--> statement-breakpoint
CREATE SCHEMA "rules";
--> statement-breakpoint
CREATE TYPE "public"."alignment" AS ENUM('Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil');--> statement-breakpoint
CREATE TYPE "public"."base_rules" AS ENUM('Dungeons & Dragons: 3.5');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('Male', 'Female', 'Other');--> statement-breakpoint
CREATE TYPE "public"."location" AS ENUM('Head', 'Neck', 'Torso', 'Wrists', 'Hands', 'Waist', 'Finger', 'Trinket', 'Main Hand', 'Off Hand', 'Two Handed', 'Other');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('Game Master', 'Player Character');--> statement-breakpoint
CREATE TYPE "public"."ruleset_status" AS ENUM('Draft', 'Published', 'Archived');--> statement-breakpoint
CREATE TYPE "public"."size_type" AS ENUM('Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal');--> statement-breakpoint
CREATE TABLE "rules"."abilities" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account"."activities" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"target_table" text NOT NULL,
	"type" text NOT NULL,
	"data" json
);
--> statement-breakpoint
CREATE TABLE "rules"."aptitudes" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "campaign"."campaigns" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character"."character_abilities" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_id" uuid NOT NULL,
	"ability_id" uuid NOT NULL,
	"score" integer NOT NULL,
	CONSTRAINT "character_abilities_pkey" PRIMARY KEY("character_id","ability_id"),
	CONSTRAINT "character_abilities_score_check" CHECK ((score >= 1) AND (score <= 100))
);
--> statement-breakpoint
CREATE TABLE "character"."characters" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"race_id" uuid NOT NULL,
	"xp" integer NOT NULL,
	"name" text NOT NULL,
	"alignment" "alignment" NOT NULL,
	"age" integer NOT NULL,
	"gender" "gender" NOT NULL,
	"height" text NOT NULL,
	"weight" text NOT NULL,
	"deity" text,
	"description" text,
	"notes" text,
	"private_notes" text,
	CONSTRAINT "characters_xp_check" CHECK (xp >= 0),
	CONSTRAINT "characters_age_check" CHECK (age > 0)
);
--> statement-breakpoint
CREATE TABLE "rules"."feats_aptitudes" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"feat_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	CONSTRAINT "feats_aptitudes_pkey" PRIMARY KEY("feat_id","aptitude_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."feats" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character"."inventory" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"total_charges" integer,
	"remaining_charges" integer,
	"equipped" boolean DEFAULT false NOT NULL,
	"location" "location",
	"weapon_set" smallint,
	CONSTRAINT "inventory_pkey" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "inventory_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "inventory_check" CHECK ((total_charges IS NULL) OR ((total_charges >= 0) AND (remaining_charges IS NOT NULL))),
	CONSTRAINT "inventory_check1" CHECK ((remaining_charges IS NULL) OR ((remaining_charges > 0) AND (total_charges IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "campaign"."invites" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text,
	"player_id" uuid NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	CONSTRAINT "invites_status_check" CHECK (status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Rejected'::text, 'Expired'::text, 'Revoked'::text])),
	CONSTRAINT "invites_user_or_email_check" CHECK ((user_id IS NOT NULL) OR (email IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "rules"."items" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"weight" numeric(6, 2),
	"cost_gp" numeric(10, 2),
	"type" text,
	"rarity" text DEFAULT 'Common' NOT NULL,
	"slot" "location" DEFAULT 'Other' NOT NULL,
	CONSTRAINT "items_weight_check" CHECK (weight >= (0)::numeric),
	CONSTRAINT "items_cost_gp_check" CHECK (cost_gp >= (0)::numeric)
);
--> statement-breakpoint
CREATE TABLE "rules"."klass_level_feats" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"klass_level_id" uuid NOT NULL,
	"feat_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	CONSTRAINT "klass_level_feats_pkey" PRIMARY KEY("klass_level_id","feat_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."klass_level_powers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"klass_level_id" uuid NOT NULL,
	"power_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	"free" boolean DEFAULT false NOT NULL,
	CONSTRAINT "klass_level_powers_pkey" PRIMARY KEY("klass_level_id","power_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."klass_level_saves" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"klass_level_id" uuid NOT NULL,
	"save_id" uuid NOT NULL,
	"base" integer NOT NULL,
	CONSTRAINT "klass_level_saves_pkey" PRIMARY KEY("klass_level_id","save_id"),
	CONSTRAINT "klass_level_saves_base_check" CHECK ((base >= 0) AND (base <= 12))
);
--> statement-breakpoint
CREATE TABLE "rules"."klass_levels" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"klass_id" uuid NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "klass_levels_klass_id_level_key" UNIQUE("klass_id","level"),
	CONSTRAINT "klass_levels_level_check" CHECK ((level >= 1) AND (level <= 20))
);
--> statement-breakpoint
CREATE TABLE "rules"."klass_skills" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"klass_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	CONSTRAINT "klass_skills_pkey" PRIMARY KEY("klass_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."klasses" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"hd" integer NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "klasses_hd_check" CHECK (hd = ANY (ARRAY[4, 6, 8, 10, 12]))
);
--> statement-breakpoint
CREATE TABLE "character"."languages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_id" uuid NOT NULL,
	"language_id" uuid NOT NULL,
	CONSTRAINT "languages_pkey" PRIMARY KEY("character_id","language_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."languages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character"."level_feats" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_level_id" uuid NOT NULL,
	"feat_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	CONSTRAINT "level_feats_pkey" PRIMARY KEY("character_level_id","feat_id")
);
--> statement-breakpoint
CREATE TABLE "character"."level_powers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_level_id" uuid NOT NULL,
	"power_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	CONSTRAINT "level_powers_pkey" PRIMARY KEY("character_level_id","power_id")
);
--> statement-breakpoint
CREATE TABLE "character"."level_skills" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"character_level_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "level_skills_pkey" PRIMARY KEY("character_level_id","skill_id"),
	CONSTRAINT "level_skills_rank_check" CHECK (rank > 0)
);
--> statement-breakpoint
CREATE TABLE "character"."levels" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"klass_level_id" uuid NOT NULL,
	"hp" integer NOT NULL,
	"ability_id" uuid,
	CONSTRAINT "levels_character_id_klass_level_id_key" UNIQUE("character_id","klass_level_id"),
	CONSTRAINT "levels_hp_check" CHECK (hp > 0)
);
--> statement-breakpoint
CREATE TABLE "customization"."modifiers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"target" text NOT NULL,
	"value" text NOT NULL,
	"value_type" text NOT NULL,
	"operator" text NOT NULL,
	CONSTRAINT "modifiers_source_id_source_type_target_key" UNIQUE("source_id","source_type","target"),
	CONSTRAINT "modifiers_value_type_check" CHECK (value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])),
	CONSTRAINT "modifiers_operator_check" CHECK (operator = ANY (ARRAY['add'::text, 'subtract'::text, 'multiply'::text, 'divide'::text, 'set'::text, 'replace_ability'::text]))
);
--> statement-breakpoint
CREATE TABLE "campaign"."player_characters" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"player_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"visibility" text DEFAULT 'Private' NOT NULL,
	CONSTRAINT "player_characters_visibility_check" CHECK (visibility = ANY (ARRAY['Private'::text, 'Public'::text, 'Partial'::text]))
);
--> statement-breakpoint
CREATE TABLE "campaign"."players" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"campaign_id" uuid NOT NULL,
	"role" "role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules"."powers_aptitudes" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"power_id" uuid NOT NULL,
	"aptitude_id" uuid NOT NULL,
	"level" integer,
	"ability_dc_id" uuid,
	CONSTRAINT "powers_aptitudes_pkey" PRIMARY KEY("power_id","aptitude_id")
);
--> statement-breakpoint
CREATE TABLE "rules"."powers" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"save_id" uuid,
	"save_effect" text
);
--> statement-breakpoint
CREATE TABLE "customization"."properties" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"value" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	CONSTRAINT "properties_entity_id_entity_type_type_value_key" UNIQUE("entity_id","entity_type","type","value")
);
--> statement-breakpoint
CREATE TABLE "rules"."races" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"size" "size_type" NOT NULL,
	"base_speed" integer NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "races_base_speed_check" CHECK (base_speed > 0)
);
--> statement-breakpoint
CREATE TABLE "customization"."requirements" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"level" text NOT NULL,
	"target" text,
	"value" text,
	"value_type" text,
	"operator" text,
	"chaining_operator" text,
	CONSTRAINT "requirements_entity_id_entity_type_level_key" UNIQUE("entity_id","entity_type","level"),
	CONSTRAINT "requirements_value_type_check" CHECK (value_type = ANY (ARRAY['number'::text, 'string'::text, 'boolean'::text])),
	CONSTRAINT "requirements_operator_check" CHECK (operator = ANY (ARRAY['equal'::text, 'not_equal'::text, 'greater_than'::text, 'less_than'::text, 'greater_than_or_equal'::text, 'less_than_or_equal'::text, 'contains'::text, 'not_contains'::text, 'starts_with'::text, 'ends_with'::text, 'matches_regex'::text, 'not_matches_regex'::text, 'is_empty'::text, 'not_empty'::text])),
	CONSTRAINT "requirements_check" CHECK ((chaining_operator = ANY (ARRAY['and'::text, 'or'::text])) AND (((chaining_operator IS NULL) AND (operator IS NOT NULL) AND (value IS NOT NULL) AND (value_type IS NOT NULL) AND (target IS NOT NULL)) OR ((chaining_operator IS NOT NULL) AND (operator IS NULL) AND (value IS NULL) AND (value_type IS NULL) AND (target IS NULL))))
);
--> statement-breakpoint
CREATE TABLE "rules"."rulesets" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ruleset_id" uuid,
	"description" text NOT NULL,
	"user_id" uuid,
	"private" boolean DEFAULT false NOT NULL,
	"status" "ruleset_status" DEFAULT 'Draft' NOT NULL,
	"base_rules" "base_rules" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules"."saves" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"ability_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account"."sessions" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules"."skills" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"primary_ability_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account"."starred_rulesets" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"ruleset_id" uuid NOT NULL,
	CONSTRAINT "starred_rulesets_pkey" PRIMARY KEY("user_id","ruleset_id")
);
--> statement-breakpoint
CREATE TABLE "account"."users" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"email_address" text NOT NULL,
	"password_digest" text NOT NULL,
	"username" text
);
--> statement-breakpoint
ALTER TABLE "rules"."abilities" ADD CONSTRAINT "abilities_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."abilities" ADD CONSTRAINT "abilities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."aptitudes" ADD CONSTRAINT "aptitudes_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."aptitudes" ADD CONSTRAINT "aptitudes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."campaigns" ADD CONSTRAINT "campaigns_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."character_abilities" ADD CONSTRAINT "character_abilities_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."character_abilities" ADD CONSTRAINT "character_abilities_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "rules"."abilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "rules"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."feats_aptitudes" ADD CONSTRAINT "feats_aptitudes_feat_id_fkey" FOREIGN KEY ("feat_id") REFERENCES "rules"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."feats_aptitudes" ADD CONSTRAINT "feats_aptitudes_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."feats" ADD CONSTRAINT "feats_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."feats" ADD CONSTRAINT "feats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."inventory" ADD CONSTRAINT "inventory_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."inventory" ADD CONSTRAINT "inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "rules"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."invites" ADD CONSTRAINT "invites_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "campaign"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."invites" ADD CONSTRAINT "invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."items" ADD CONSTRAINT "items_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."items" ADD CONSTRAINT "items_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_feats" ADD CONSTRAINT "klass_level_feats_klass_level_id_fkey" FOREIGN KEY ("klass_level_id") REFERENCES "rules"."klass_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_feats" ADD CONSTRAINT "klass_level_feats_feat_id_fkey" FOREIGN KEY ("feat_id") REFERENCES "rules"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_feats" ADD CONSTRAINT "klass_level_feats_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_powers" ADD CONSTRAINT "klass_level_powers_klass_level_id_fkey" FOREIGN KEY ("klass_level_id") REFERENCES "rules"."klass_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_powers" ADD CONSTRAINT "klass_level_powers_power_id_fkey" FOREIGN KEY ("power_id") REFERENCES "rules"."powers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_powers" ADD CONSTRAINT "klass_level_powers_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_saves" ADD CONSTRAINT "klass_level_saves_klass_level_id_fkey" FOREIGN KEY ("klass_level_id") REFERENCES "rules"."klass_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_level_saves" ADD CONSTRAINT "klass_level_saves_save_id_fkey" FOREIGN KEY ("save_id") REFERENCES "rules"."saves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_levels" ADD CONSTRAINT "klass_levels_klass_id_fkey" FOREIGN KEY ("klass_id") REFERENCES "rules"."klasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_skills" ADD CONSTRAINT "klass_skills_klass_id_fkey" FOREIGN KEY ("klass_id") REFERENCES "rules"."klasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klass_skills" ADD CONSTRAINT "klass_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "rules"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klasses" ADD CONSTRAINT "klasses_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klasses" ADD CONSTRAINT "klasses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."klasses" ADD CONSTRAINT "klasses_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "rules"."klasses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."languages" ADD CONSTRAINT "languages_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."languages" ADD CONSTRAINT "languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "rules"."languages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."languages" ADD CONSTRAINT "languages_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."languages" ADD CONSTRAINT "languages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD CONSTRAINT "level_feats_character_level_id_fkey" FOREIGN KEY ("character_level_id") REFERENCES "character"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD CONSTRAINT "level_feats_feat_id_fkey" FOREIGN KEY ("feat_id") REFERENCES "rules"."feats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD CONSTRAINT "level_feats_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_powers" ADD CONSTRAINT "level_powers_character_level_id_fkey" FOREIGN KEY ("character_level_id") REFERENCES "character"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_powers" ADD CONSTRAINT "level_powers_power_id_fkey" FOREIGN KEY ("power_id") REFERENCES "rules"."powers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_powers" ADD CONSTRAINT "level_powers_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_skills" ADD CONSTRAINT "level_skills_character_level_id_fkey" FOREIGN KEY ("character_level_id") REFERENCES "character"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_skills" ADD CONSTRAINT "level_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "rules"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."levels" ADD CONSTRAINT "levels_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."levels" ADD CONSTRAINT "levels_klass_level_id_fkey" FOREIGN KEY ("klass_level_id") REFERENCES "rules"."klass_levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."levels" ADD CONSTRAINT "levels_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "rules"."abilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."player_characters" ADD CONSTRAINT "player_characters_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "campaign"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."player_characters" ADD CONSTRAINT "player_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign"."players" ADD CONSTRAINT "players_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers_aptitudes" ADD CONSTRAINT "powers_aptitudes_power_id_fkey" FOREIGN KEY ("power_id") REFERENCES "rules"."powers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers_aptitudes" ADD CONSTRAINT "powers_aptitudes_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers_aptitudes" ADD CONSTRAINT "powers_aptitudes_ability_dc_id_fkey" FOREIGN KEY ("ability_dc_id") REFERENCES "rules"."abilities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers" ADD CONSTRAINT "powers_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers" ADD CONSTRAINT "powers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."powers" ADD CONSTRAINT "powers_save_id_fkey" FOREIGN KEY ("save_id") REFERENCES "rules"."saves"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."races" ADD CONSTRAINT "races_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."races" ADD CONSTRAINT "races_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."races" ADD CONSTRAINT "races_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "rules"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."rulesets" ADD CONSTRAINT "rulesets_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."rulesets" ADD CONSTRAINT "rulesets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."saves" ADD CONSTRAINT "saves_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."saves" ADD CONSTRAINT "saves_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."saves" ADD CONSTRAINT "saves_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "rules"."abilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."skills" ADD CONSTRAINT "skills_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."skills" ADD CONSTRAINT "skills_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."skills" ADD CONSTRAINT "skills_primary_ability_id_fkey" FOREIGN KEY ("primary_ability_id") REFERENCES "rules"."abilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."starred_rulesets" ADD CONSTRAINT "starred_rulesets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."starred_rulesets" ADD CONSTRAINT "starred_rulesets_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "abilities_ruleset_id_campaign_id_idx" ON "rules"."abilities" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "abilities_with_campaign_unique_idx" ON "rules"."abilities" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "abilities_without_campaign_unique_idx" ON "rules"."abilities" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "activities_target_id_target_table" ON "account"."activities" USING btree ("target_id","target_table");--> statement-breakpoint
CREATE INDEX "activities_user_id_created_at_idx" ON "account"."activities" USING btree ("user_id","created_at" DESC) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "aptitudes_ruleset_id_campaign_id_idx" ON "rules"."aptitudes" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "aptitudes_with_campaign_unique_idx" ON "rules"."aptitudes" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "aptitudes_without_campaign_unique_idx" ON "rules"."aptitudes" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "campaigns_ruleset_id_name_idx" ON "campaign"."campaigns" USING btree ("ruleset_id","name" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "character_abilities_ability_id" ON "character"."character_abilities" USING btree ("ability_id");--> statement-breakpoint
CREATE INDEX "character_abilities_character_id" ON "character"."character_abilities" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "characters_user_id_idx" ON "character"."characters" USING btree ("user_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "characters_ruleset_id_idx" ON "character"."characters" USING btree ("ruleset_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "feats_ruleset_id_campaign_id_idx" ON "rules"."feats" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "feats_with_campaign_unique_idx" ON "rules"."feats" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "feats_without_campaign_unique_idx" ON "rules"."feats" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "feats_aptitudes_aptitude_id_idx" ON "rules"."feats_aptitudes" USING btree ("aptitude_id");--> statement-breakpoint
CREATE INDEX "character_inventory_character_id" ON "character"."inventory" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_inventory_item_id" ON "character"."inventory" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "invites_player_id_idx" ON "campaign"."invites" USING btree ("player_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "invites_user_id_status_idx" ON "campaign"."invites" USING btree ("user_id","status") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "invites_email_status_idx" ON "campaign"."invites" USING btree ("email","status") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "items_ruleset_id_campaign_id_idx" ON "rules"."items" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "items_with_campaign_unique_idx" ON "rules"."items" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "items_without_campaign_unique_idx" ON "rules"."items" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "klass_level_feats_feat_id" ON "rules"."klass_level_feats" USING btree ("feat_id");--> statement-breakpoint
CREATE INDEX "klass_level_feats_klass_level_id" ON "rules"."klass_level_feats" USING btree ("klass_level_id");--> statement-breakpoint
CREATE INDEX "klass_level_powers_power_id" ON "rules"."klass_level_powers" USING btree ("power_id");--> statement-breakpoint
CREATE INDEX "klass_level_powers_klass_level_id" ON "rules"."klass_level_powers" USING btree ("klass_level_id");--> statement-breakpoint
CREATE INDEX "klass_level_saves_klass_level_id" ON "rules"."klass_level_saves" USING btree ("klass_level_id");--> statement-breakpoint
CREATE INDEX "klass_level_saves_save_id" ON "rules"."klass_level_saves" USING btree ("save_id");--> statement-breakpoint
CREATE INDEX "klass_levels_klass_id_idx" ON "rules"."klass_levels" USING btree ("klass_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "klass_levels_klass_id_level" ON "rules"."klass_levels" USING btree ("klass_id","level");--> statement-breakpoint
CREATE INDEX "klass_skills_klass_id" ON "rules"."klass_skills" USING btree ("klass_id");--> statement-breakpoint
CREATE INDEX "klass_skills_skill_id" ON "rules"."klass_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "klasses_ruleset_id_campaign_id_idx" ON "rules"."klasses" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "klasses_with_campaign_unique_idx" ON "rules"."klasses" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "klasses_without_campaign_unique_idx" ON "rules"."klasses" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "character_languages_character_id" ON "character"."languages" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_languages_language_id" ON "character"."languages" USING btree ("language_id");--> statement-breakpoint
CREATE INDEX "languages_ruleset_id_campaign_id_idx" ON "rules"."languages" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "languages_with_campaign_unique_idx" ON "rules"."languages" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "languages_without_campaign_unique_idx" ON "rules"."languages" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "character_level_feats_character_level_id" ON "character"."level_feats" USING btree ("character_level_id");--> statement-breakpoint
CREATE INDEX "character_level_feats_feat_id" ON "character"."level_feats" USING btree ("feat_id");--> statement-breakpoint
CREATE INDEX "character_level_powers_character_level_id" ON "character"."level_powers" USING btree ("character_level_id");--> statement-breakpoint
CREATE INDEX "character_level_powers_power_id" ON "character"."level_powers" USING btree ("power_id");--> statement-breakpoint
CREATE INDEX "character_level_skills_character_level_id" ON "character"."level_skills" USING btree ("character_level_id");--> statement-breakpoint
CREATE INDEX "character_level_skills_skill_id" ON "character"."level_skills" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "character_levels_character_id_idx" ON "character"."levels" USING btree ("character_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "character_levels_klass_level_id" ON "character"."levels" USING btree ("klass_level_id");--> statement-breakpoint
CREATE INDEX "modifiers_source_id_source_type_idx" ON "customization"."modifiers" USING btree ("source_id","source_type") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "player_characters_player_id_character_id_idx" ON "campaign"."player_characters" USING btree ("player_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_characters_character_id_active_idx" ON "campaign"."player_characters" USING btree ("character_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "player_characters_player_id_idx" ON "campaign"."player_characters" USING btree ("player_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "player_characters_character_id_idx" ON "campaign"."player_characters" USING btree ("character_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "players_campaign_id_idx" ON "campaign"."players" USING btree ("campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "players_user_id_campaign_id_idx" ON "campaign"."players" USING btree ("user_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "powers_ruleset_id_campaign_id_idx" ON "rules"."powers" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "powers_with_campaign_unique_idx" ON "rules"."powers" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "powers_without_campaign_unique_idx" ON "rules"."powers" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "powers_aptitudes_aptitude_id_level_idx" ON "rules"."powers_aptitudes" USING btree ("aptitude_id","level");--> statement-breakpoint
CREATE INDEX "properties_entity_id_entity_type_idx" ON "customization"."properties" USING btree ("entity_id","entity_type") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "races_ruleset_id_campaign_id_idx" ON "rules"."races" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "races_with_campaign_unique_idx" ON "rules"."races" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "races_without_campaign_unique_idx" ON "rules"."races" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "requirements_entity_id_entity_type_idx" ON "customization"."requirements" USING btree ("entity_id","entity_type") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "rulesets_name_unique_idx" ON "rules"."rulesets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "rulesets_user_id_status_idx" ON "rules"."rulesets" USING btree ("user_id","status") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "rulesets_status_idx" ON "rules"."rulesets" USING btree ("status") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "saves_ruleset_id_campaign_id_idx" ON "rules"."saves" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "saves_with_campaign_unique_idx" ON "rules"."saves" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "saves_without_campaign_unique_idx" ON "rules"."saves" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "account"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skills_ruleset_id_campaign_id_idx" ON "rules"."skills" USING btree ("ruleset_id","campaign_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "skills_with_campaign_unique_idx" ON "rules"."skills" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "skills_without_campaign_unique_idx" ON "rules"."skills" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE INDEX "starred_rulesets_user_id" ON "account"."starred_rulesets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email" ON "account"."users" USING btree ("email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username" ON "account"."users" USING btree ("username");