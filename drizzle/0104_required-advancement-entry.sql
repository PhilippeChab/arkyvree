-- A character's advancement is an entry on a track (`character.advancements.entry_id` and `entry_type`, 3.5's class
-- level), which every write gives it: 0080 made the columns, as `track_id` and `track_type`, nullable, and 0095 renamed
-- them. The migration checks every row has its entry, or stops naming the advancements that don't, makes both columns
-- `NOT NULL`, and drops the entry index's `entry_id IS NOT NULL` predicate, which every row meets. No row changes.

-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- Each advancement has its entry, or the migration stops, naming those that don't
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(a.id::text, ', ' ORDER BY a.id) INTO finding
  FROM "character".advancements AS a
  WHERE a.entry_id IS NULL OR a.entry_type IS NULL;
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Advancements with no entry: %', finding;
  END IF;
END $$;

ALTER TABLE "character".advancements ALTER COLUMN entry_id SET NOT NULL;
ALTER TABLE "character".advancements ALTER COLUMN entry_type SET NOT NULL;

-- The entry index, every row's
DROP INDEX "character".advancements_entry_idx;
CREATE INDEX advancements_entry_idx ON "character".advancements USING btree (entry_id);

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
