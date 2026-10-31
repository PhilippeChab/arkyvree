-- Where an inventory entry is held is its location (`character.inventory.location`), none for an item carried: every
-- write stores `equipped` as whether it has one (`InventoryEntries`, which keeps a location only while equipped), so the
-- column `equipped` held the same decision twice. The rows written past that rule, by the test characters' seeder,
-- take the one every reader read them by, `equipped`: a carried entry's location and weapon sets are cleared, and an
-- equipped entry with no location is worn nowhere in particular (`Other`, where an item of no slot goes). The column
-- goes. No character's last change moves (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

UPDATE "character".inventory SET location = NULL, groups = '{}'
  WHERE NOT equipped AND (location IS NOT NULL OR cardinality(groups) > 0);
UPDATE "character".inventory SET location = 'Other' WHERE equipped AND location IS NULL;

ALTER TABLE "character".inventory DROP COLUMN equipped;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
