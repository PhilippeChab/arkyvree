CREATE TABLE "account"."exports" (
  "id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_name" text NOT NULL,
  "data" bytea NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "exports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "account"."users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "exports_user_id_idx" ON "account"."exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exports_expires_at_idx" ON "account"."exports" USING btree ("expires_at");
