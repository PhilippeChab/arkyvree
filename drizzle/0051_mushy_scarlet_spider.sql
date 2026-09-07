CREATE SCHEMA "storage";
--> statement-breakpoint
CREATE TABLE "storage"."attachments" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"name" text NOT NULL,
	"blob_id" uuid NOT NULL,
	"position" integer
);
--> statement-breakpoint
CREATE TABLE "storage"."blobs" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum" text,
	"metadata" json DEFAULT '{}'::json NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storage"."attachments" ADD CONSTRAINT "attachments_blob_id_fkey" FOREIGN KEY ("blob_id") REFERENCES "storage"."blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_record_name_unique_idx" ON "storage"."attachments" USING btree ("record_type","record_id","name") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "attachments_record_idx" ON "storage"."attachments" USING btree ("record_type","record_id");--> statement-breakpoint
CREATE INDEX "attachments_blob_id_idx" ON "storage"."attachments" USING btree ("blob_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blobs_key_unique_idx" ON "storage"."blobs" USING btree ("key") WHERE (deleted_at IS NULL);