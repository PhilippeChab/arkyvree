CREATE INDEX "entity_snapshots_ruleset_type_source" ON "rules"."entity_snapshots" USING btree ("ruleset_id","entity_type","source_entity_id");
