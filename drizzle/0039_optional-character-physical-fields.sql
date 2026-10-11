ALTER TABLE "character"."characters" DROP CONSTRAINT "characters_age_check";--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "age" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "height" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character"."characters" ALTER COLUMN "weight" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_age_check" CHECK (age IS NULL OR age > 0);