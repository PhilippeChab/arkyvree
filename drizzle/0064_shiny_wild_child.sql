CREATE TYPE "public"."character_kind" AS ENUM('pc', 'familiar', 'animalcompanion', 'mount');--> statement-breakpoint
ALTER TABLE "character"."characters" ADD COLUMN "kind" character_kind DEFAULT 'pc' NOT NULL;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD COLUMN "parent_character_id" uuid;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_parent_character_id_fkey" FOREIGN KEY ("parent_character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "characters_parent_character_id_idx" ON "character"."characters" USING btree ("parent_character_id") WHERE (parent_character_id IS NOT NULL);--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_kind_parent_check" CHECK ((kind = 'pc') = (parent_character_id IS NULL));--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_no_self_parent_check" CHECK (id <> parent_character_id);