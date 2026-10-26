-- An advancement's pick is its step's entity, through a pool if its step takes one, with an amount if it holds one, and
-- its ordinal (`StoredPick`, `PickPlan`). 0080 gave it a tier and a parent pick (`tier`, `parent_pick_id`, with the
-- parent's foreign key and its partial index), which nothing writes or reads: they go. A pick that holds either refuses
-- the migration, naming the columns. No other row changes, nor a character's last change (`arkyvree.registry_sync`,
-- which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- No pick holds a tier or a parent pick, or the migration stops, naming the columns
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(c, ', ') INTO finding FROM (
    SELECT 'tier' AS c WHERE EXISTS (SELECT 1 FROM "character".advancement_picks WHERE tier IS NOT NULL)
    UNION ALL SELECT 'parent_pick_id'
     WHERE EXISTS (SELECT 1 FROM "character".advancement_picks WHERE parent_pick_id IS NOT NULL)) x;
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Picks hold columns nothing reads: %', finding;
  END IF;
END $$;

-- A pick's parent: its foreign key and its index, then its column; then its tier
ALTER TABLE "character".advancement_picks DROP CONSTRAINT advancement_picks_parent_pick_id_fkey;
DROP INDEX "character".advancement_picks_parent_idx;
ALTER TABLE "character".advancement_picks DROP COLUMN parent_pick_id;
ALTER TABLE "character".advancement_picks DROP COLUMN tier;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
