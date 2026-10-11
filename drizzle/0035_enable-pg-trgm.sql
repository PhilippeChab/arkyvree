CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "abilities_search_trgm_idx" ON "rules"."abilities" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "aptitudes_search_trgm_idx" ON "rules"."aptitudes" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "feats_search_trgm_idx" ON "rules"."feats" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "items_search_trgm_idx" ON "rules"."items" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "klasses_search_trgm_idx" ON "rules"."klasses" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "languages_search_trgm_idx" ON "rules"."languages" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "powers_search_trgm_idx" ON "rules"."powers" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "races_search_trgm_idx" ON "rules"."races" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "saves_search_trgm_idx" ON "rules"."saves" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "skills_search_trgm_idx" ON "rules"."skills" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "rulesets_search_trgm_idx" ON "rules"."rulesets" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "campaigns_search_trgm_idx" ON "campaign"."campaigns" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "characters_search_trgm_idx" ON "character"."characters" USING GIN ("name" gin_trgm_ops, "description" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "users_search_trgm_idx" ON "account"."users" USING GIN ("username" gin_trgm_ops, "email_address" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "contributors_email_trgm_idx" ON "rules"."contributors" USING GIN ("email" gin_trgm_ops);
