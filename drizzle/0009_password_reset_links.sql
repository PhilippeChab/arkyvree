CREATE TABLE "account"."password_reset_links" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"digest" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account"."password_reset_links" ADD CONSTRAINT "password_reset_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account"."password_reset_links" ADD CONSTRAINT "password_reset_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_links_digest" ON "account"."password_reset_links" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "password_reset_links_user_id" ON "account"."password_reset_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_links_created_by" ON "account"."password_reset_links" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "password_reset_links_expires_at" ON "account"."password_reset_links" USING btree ("expires_at");