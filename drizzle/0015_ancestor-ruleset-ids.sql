ALTER TABLE "rules"."rulesets" ADD COLUMN "ancestor_ruleset_ids" uuid[] DEFAULT '{}' NOT NULL;
