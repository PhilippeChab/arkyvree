CREATE TABLE "customization"."name_bindings" (
	"id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL,
	"modifier_id" uuid,
	"requirement_id" uuid,
	"field" text NOT NULL,
	"path" integer NOT NULL,
	"segment" integer NOT NULL,
	"kind" text NOT NULL,
	"entity_id" uuid,
	"entity_type" text NOT NULL,
	"ruleset_id" uuid,
	"name" text NOT NULL,
	CONSTRAINT "name_bindings_owner_check" CHECK ((modifier_id IS NULL) <> (requirement_id IS NULL)),
	CONSTRAINT "name_bindings_field_check" CHECK (field = ANY (ARRAY['target'::text, 'value'::text])),
	CONSTRAINT "name_bindings_kind_check" CHECK (kind = ANY (ARRAY['entity'::text, 'group'::text])),
	CONSTRAINT "name_bindings_entity_check" CHECK ((kind = 'entity'::text) = (entity_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "customization"."name_bindings" ADD CONSTRAINT "name_bindings_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "customization"."modifiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customization"."name_bindings" ADD CONSTRAINT "name_bindings_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "customization"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "name_bindings_modifier_place_idx" ON "customization"."name_bindings" USING btree ("modifier_id","field","path","segment") WHERE (modifier_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "name_bindings_requirement_place_idx" ON "customization"."name_bindings" USING btree ("requirement_id","field","path","segment") WHERE (requirement_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "name_bindings_entity_id_idx" ON "customization"."name_bindings" USING btree ("entity_id");