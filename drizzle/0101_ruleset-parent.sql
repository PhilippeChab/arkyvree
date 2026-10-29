-- A fork's parent is stored once, in `rules.rulesets.ruleset_id`, its foreign key. 0015's array,
-- `rules.rulesets.ancestor_ruleset_ids`, held a second copy of it: a fork of a fork is refused, so a fork's array is
-- its parent alone, and a base's is empty. The migration checks every row holds that, or stops naming the rulesets that
-- don't (an array of another ruleset, or of more than one), and drops the array. No row changes.

-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- Each array is its ruleset's parent alone, or empty for a base, or the migration stops, naming the rulesets that differ
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(r.id::text, ', ' ORDER BY r.id) INTO finding
  FROM rules.rulesets AS r
  WHERE r.ancestor_ruleset_ids IS DISTINCT FROM
    CASE WHEN r.ruleset_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[r.ruleset_id] END;
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Rulesets whose ancestors differ from their parent: %', finding;
  END IF;
END $$;

-- The array, which nothing reads any more
ALTER TABLE rules.rulesets DROP COLUMN ancestor_ruleset_ids;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
