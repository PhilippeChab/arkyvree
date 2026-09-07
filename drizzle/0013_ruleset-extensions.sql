CREATE TABLE "rules"."ruleset_extensions" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"ruleset_id" uuid NOT NULL,
	"extension_id" uuid NOT NULL,
	CONSTRAINT "ruleset_extensions_pkey" PRIMARY KEY("ruleset_id","extension_id")
);
--> statement-breakpoint
ALTER TABLE "rules"."ruleset_extensions" ADD CONSTRAINT "ruleset_extensions_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules"."ruleset_extensions" ADD CONSTRAINT "ruleset_extensions_extension_id_fkey" FOREIGN KEY ("extension_id") REFERENCES "rules"."rulesets"("id") ON DELETE cascade ON UPDATE no action;