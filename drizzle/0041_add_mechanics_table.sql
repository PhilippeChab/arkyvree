CREATE TABLE "rules"."mechanics" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"campaign_id" uuid,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
ALTER TABLE "rules"."mechanics" ADD CONSTRAINT "mechanics_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."mechanics" ADD CONSTRAINT "mechanics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mechanics_ruleset_id_campaign_id" ON "rules"."mechanics" USING btree ("ruleset_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mechanics_with_campaign_unique_idx" ON "rules"."mechanics" USING btree ("ruleset_id","campaign_id","name") WHERE (campaign_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "mechanics_without_campaign_unique_idx" ON "rules"."mechanics" USING btree ("ruleset_id","name") WHERE (campaign_id IS NULL);