ALTER TABLE "rules"."rulesets" ADD COLUMN "system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: existing system-owned rulesets (bases + extensions) were stored with
-- userId IS NULL. Mark them as system content so future orphaned user forks —
-- which also get user_id nulled out by orphanByUser — don't get mistaken for them.
UPDATE "rules"."rulesets" SET "system" = true WHERE "user_id" IS NULL;
