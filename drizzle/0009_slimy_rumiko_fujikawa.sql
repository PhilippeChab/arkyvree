ALTER TABLE "rules"."items" ADD COLUMN "source_item_id" uuid;--> statement-breakpoint
ALTER TABLE "rules"."items" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rules"."items" ADD CONSTRAINT "items_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "rules"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_source_item_id" ON "rules"."items" USING btree ("source_item_id");