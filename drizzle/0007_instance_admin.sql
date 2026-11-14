CREATE TYPE "public"."sign_up_policy" AS ENUM('Open', 'Invite Only', 'Closed');--> statement-breakpoint
CREATE TABLE "account"."instance_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"sign_up_policy" "sign_up_policy" DEFAULT 'Invite Only' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_one_row_check" CHECK (id)
);
--> statement-breakpoint
ALTER TABLE "account"."users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account"."users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
-- The instance's admin: its oldest account that can sign in (an instance with none gets one with its first such account)
UPDATE "account"."users" SET "is_admin" = true WHERE "id" = (
	SELECT "id" FROM "account"."users"
	WHERE "deleted_at" IS NULL AND "deactivated_at" IS NULL AND "email_verified_at" IS NOT NULL
	ORDER BY "created_at", "id" LIMIT 1
);--> statement-breakpoint
-- Its sign-up setting: an instance that has accounts stays open to anyone, as it was; a new one takes invites alone
INSERT INTO "account"."instance_settings" ("sign_up_policy")
SELECT CASE WHEN EXISTS (SELECT 1 FROM "account"."users" WHERE "deleted_at" IS NULL) THEN 'Open' ELSE 'Invite Only' END::"sign_up_policy";
