-- A ruleset's content version: what every write to the ruleset bumps as it takes the ruleset's lock, so a write under
-- the lock tells the views the cache holds of it, and of its source chain, from the rows committed since
-- (`RulesetViews.getFreshData`). Its own column, so a write leaves `updated_at`, which a form's save is checked by, as it is.
ALTER TABLE "rules"."rulesets" ADD COLUMN "content_version" bigint DEFAULT 0 NOT NULL;
