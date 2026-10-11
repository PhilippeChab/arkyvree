ALTER TABLE "character"."characters" DROP CONSTRAINT "characters_kind_parent_check";--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "kind" SET DATA TYPE text USING "kind"::text;--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "kind" SET DEFAULT 'pc';--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_kind_parent_check" CHECK ((kind = 'pc') = (parent_character_id IS NULL));--> statement-breakpoint
DROP TYPE "public"."character_kind";--> statement-breakpoint
ALTER TABLE "rules"."races" ADD COLUMN "kind" text DEFAULT 'pc' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules"."klasses" ADD COLUMN "kind" text DEFAULT 'pc' NOT NULL;
