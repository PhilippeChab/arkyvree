CREATE TABLE "account"."invite_links" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account"."users" ADD COLUMN "invite_link_id" uuid;--> statement-breakpoint
ALTER TABLE "account"."invite_links" ADD CONSTRAINT "invite_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_links_digest" ON "account"."invite_links" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "invite_links_created_by" ON "account"."invite_links" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "users_invite_link_id" ON "account"."users" USING btree ("invite_link_id");