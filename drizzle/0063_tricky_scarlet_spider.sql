CREATE TYPE "public"."ruleset_kind" AS ENUM('ruleset', 'extension');--> statement-breakpoint
ALTER TABLE "rules"."rulesets" ADD COLUMN "kind" "ruleset_kind" DEFAULT 'ruleset' NOT NULL;--> statement-breakpoint
-- Backfill existing system extensions: a system-seeded ruleset with a parent
-- (ruleset_id IS NOT NULL) is by definition an extension, not a base.
UPDATE "rules"."rulesets" SET "kind" = 'extension'
WHERE "user_id" IS NULL AND "ruleset_id" IS NOT NULL;