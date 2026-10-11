CREATE INDEX "aptitudes_ruleset_id_name_idx" ON "rules"."aptitudes" USING btree ("ruleset_id","name") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "character_abilities_character_id_alive_idx" ON "character"."character_abilities" USING btree ("character_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "feats_ruleset_id_deleted_at_idx" ON "rules"."feats" USING btree ("ruleset_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "items_ruleset_id_is_template_idx" ON "rules"."items" USING btree ("ruleset_id","is_template") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "klasses_ruleset_id_deleted_at_idx" ON "rules"."klasses" USING btree ("ruleset_id") WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "character_level_skills_level_id_alive_idx" ON "character"."level_skills" USING btree ("character_level_id") WHERE (deleted_at IS NULL);