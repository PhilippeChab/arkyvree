DROP INDEX "rules"."klasses_with_campaign_unique_idx";--> statement-breakpoint
DROP INDEX "rules"."klasses_without_campaign_unique_idx";--> statement-breakpoint
DROP INDEX "rules"."races_with_campaign_unique_idx";--> statement-breakpoint
DROP INDEX "rules"."races_without_campaign_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "klasses_with_campaign_unique_idx" ON "rules"."klasses" USING btree ("ruleset_id","campaign_id","name","kind") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "klasses_without_campaign_unique_idx" ON "rules"."klasses" USING btree ("ruleset_id","name","kind") WHERE (campaign_id IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "races_with_campaign_unique_idx" ON "rules"."races" USING btree ("ruleset_id","campaign_id","name","kind") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "races_without_campaign_unique_idx" ON "rules"."races" USING btree ("ruleset_id","name","kind") WHERE (campaign_id IS NULL);