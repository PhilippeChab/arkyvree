ALTER TABLE "account"."starred_rulesets" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "account"."starred_rulesets" ADD COLUMN "deleted_at" timestamp;