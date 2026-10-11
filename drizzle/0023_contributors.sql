CREATE TYPE "public"."contributor_role" AS ENUM('Admin', 'Editor', 'Viewer');--> statement-breakpoint
CREATE TABLE "rules"."contributors" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"role" "contributor_role" DEFAULT 'Editor' NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "contributors_status_check" CHECK (status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])),
	CONSTRAINT "contributors_email_or_user" CHECK ((user_id IS NOT NULL) OR (email IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "rules"."contributors" ADD CONSTRAINT "contributors_ruleset_id_fk" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."contributors" ADD CONSTRAINT "contributors_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."contributors" ADD CONSTRAINT "contributors_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contributors_ruleset_status_idx" ON "rules"."contributors" USING btree ("ruleset_id","status");--> statement-breakpoint
CREATE INDEX "contributors_user_status_idx" ON "rules"."contributors" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "contributors_ruleset_user_unique" ON "rules"."contributors" USING btree ("ruleset_id","user_id") WHERE status IN ('Pending', 'Active') AND deleted_at IS NULL;