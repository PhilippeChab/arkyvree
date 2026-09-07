CREATE TABLE "character"."character_contributors" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"role" "contributor_role" DEFAULT 'Editor' NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	CONSTRAINT "character_contributors_status_check" CHECK (status = ANY (ARRAY['Pending', 'Active', 'Rejected', 'Revoked'])),
	CONSTRAINT "character_contributors_email_or_user" CHECK ((user_id IS NOT NULL) OR (email IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "character"."character_contributors" ADD CONSTRAINT "character_contributors_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "character"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."character_contributors" ADD CONSTRAINT "character_contributors_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."character_contributors" ADD CONSTRAINT "character_contributors_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_contributors_character_status_idx" ON "character"."character_contributors" USING btree ("character_id","status");--> statement-breakpoint
CREATE INDEX "character_contributors_user_status_idx" ON "character"."character_contributors" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "character_contributors_character_user_unique" ON "character"."character_contributors" USING btree ("character_id","user_id") WHERE status IN ('Pending', 'Active') AND deleted_at IS NULL;