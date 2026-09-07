DROP INDEX "storage"."attachments_record_name_unique_idx";--> statement-breakpoint
DROP INDEX "storage"."blobs_key_unique_idx";--> statement-breakpoint
DROP INDEX "storage"."blobs_pending_idx";--> statement-breakpoint
CREATE INDEX "blobs_attached_idx" ON "storage"."blobs" USING btree ("created_at") WHERE (attached_at IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_record_name_unique_idx" ON "storage"."attachments" USING btree ("record_type","record_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "blobs_key_unique_idx" ON "storage"."blobs" USING btree ("key");--> statement-breakpoint
CREATE INDEX "blobs_pending_idx" ON "storage"."blobs" USING btree ("created_at") WHERE (attached_at IS NULL);--> statement-breakpoint
ALTER TABLE "storage"."attachments" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "storage"."blobs" DROP COLUMN "deleted_at";