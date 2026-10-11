-- A level's ability increase was one column of its row (ability_id), which held one ability raised by one. A level's
-- increases are rows of their own: each an ability and the amount it's raised by, so a ruleset may raise several, or
-- one by more.
--
-- Each level's increase moves to a row raising its ability by 1, with the level's timestamps; then the column goes.

CREATE TABLE "character"."level_ability_increases" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"character_level_id" uuid NOT NULL,
	"ability_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "level_ability_increases_pkey" PRIMARY KEY("character_level_id","ability_id"),
	CONSTRAINT "level_ability_increases_amount_check" CHECK (amount > 0)
);
--> statement-breakpoint
ALTER TABLE "character"."levels" DROP CONSTRAINT "levels_ability_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_ability_increases" ADD CONSTRAINT "level_ability_increases_character_level_id_fkey" FOREIGN KEY ("character_level_id") REFERENCES "character"."levels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_ability_increases" ADD CONSTRAINT "level_ability_increases_ability_id_fkey" FOREIGN KEY ("ability_id") REFERENCES "rules"."abilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_level_ability_increases_ability_id" ON "character"."level_ability_increases" USING btree ("ability_id");--> statement-breakpoint
CREATE INDEX "character_level_ability_increases_character_level_id" ON "character"."level_ability_increases" USING btree ("character_level_id");--> statement-breakpoint
INSERT INTO "character"."level_ability_increases" ("character_level_id", "ability_id", "amount", "created_at", "updated_at")
SELECT "id", "ability_id", 1, "created_at", "updated_at" FROM "character"."levels" WHERE "ability_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "character"."levels" DROP COLUMN "ability_id";