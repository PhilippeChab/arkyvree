CREATE TABLE "rules"."entity_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"ruleset_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"source_entity_id" uuid NOT NULL,
	"forked_entity_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rules"."entity_snapshots" ADD CONSTRAINT "entity_snapshots_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_snapshots_ruleset_id_entity_type" ON "rules"."entity_snapshots" USING btree ("ruleset_id","entity_type");