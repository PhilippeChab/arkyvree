-- A user's API keys, which act as their user on the public API (/v1). A key's token is shown once, when it's made: the
-- table keeps its SHA-256 digest, which a request's token is looked up by, and its start, which names it on the
-- settings page. A revoked key is deleted.

CREATE TABLE "account"."api_keys" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"digest" text NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account"."api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_digest" ON "account"."api_keys" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "api_keys_user_id" ON "account"."api_keys" USING btree ("user_id");