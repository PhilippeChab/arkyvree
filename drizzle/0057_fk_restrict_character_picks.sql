ALTER TABLE "character"."characters" DROP CONSTRAINT "characters_race_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."inventory" DROP CONSTRAINT "inventory_item_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."languages" DROP CONSTRAINT "languages_language_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_feats" DROP CONSTRAINT "level_feats_feat_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_feats" DROP CONSTRAINT "level_feats_aptitude_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_powers" DROP CONSTRAINT "level_powers_power_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_powers" DROP CONSTRAINT "level_powers_aptitude_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."level_skills" DROP CONSTRAINT "level_skills_skill_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."levels" DROP CONSTRAINT "levels_klass_level_id_fkey";
--> statement-breakpoint
ALTER TABLE "character"."characters" ADD CONSTRAINT "characters_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "rules"."races"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."inventory" ADD CONSTRAINT "inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "rules"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."languages" ADD CONSTRAINT "languages_language_id_fkey" FOREIGN KEY ("language_id") REFERENCES "rules"."languages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD CONSTRAINT "level_feats_feat_id_fkey" FOREIGN KEY ("feat_id") REFERENCES "rules"."feats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD CONSTRAINT "level_feats_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_powers" ADD CONSTRAINT "level_powers_power_id_fkey" FOREIGN KEY ("power_id") REFERENCES "rules"."powers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_powers" ADD CONSTRAINT "level_powers_aptitude_id_fkey" FOREIGN KEY ("aptitude_id") REFERENCES "rules"."aptitudes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."level_skills" ADD CONSTRAINT "level_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "rules"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character"."levels" ADD CONSTRAINT "levels_klass_level_id_fkey" FOREIGN KEY ("klass_level_id") REFERENCES "rules"."klass_levels"("id") ON DELETE restrict ON UPDATE no action;