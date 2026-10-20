-- An export is stored as it's queued, pending, so its id answers whether it's ready: the job fills its file in (ready),
-- or marks it failed. Its file (data) is none until then. An export stored before is a file, ready.

CREATE TYPE "public"."export_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "account"."exports" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account"."exports" ADD COLUMN "status" "export_status" DEFAULT 'ready' NOT NULL;