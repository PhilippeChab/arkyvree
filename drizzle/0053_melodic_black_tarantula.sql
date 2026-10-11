ALTER TABLE "storage"."attachments" DROP CONSTRAINT "attachments_blob_id_fkey";
--> statement-breakpoint
ALTER TABLE "storage"."attachments" ADD CONSTRAINT "attachments_blob_id_fkey" FOREIGN KEY ("blob_id") REFERENCES "storage"."blobs"("id") ON DELETE cascade ON UPDATE no action;