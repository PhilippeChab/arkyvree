-- Where an inventory entry is held is its location (`character.inventory.location`), none for an item carried: every
-- write stores `equipped` as whether it has one (`InventoryEntries`, which keeps a location only while equipped), so the
-- column `equipped` held the same decision twice. The rows written past that rule, by the test characters' seeder,
-- take the one every reader read them by, `equipped`: a carried entry's location and weapon sets are cleared, and an
-- equipped entry with no location is worn nowhere in particular (`Other`, where an item of no slot goes), or the
-- migration stops, naming those whose item's type sets where it goes (a weapon, armor, a shield: its own type, else
-- its template's), which `Other` doesn't take. The column goes. No character's last change moves
-- (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

UPDATE "character".inventory SET location = NULL, groups = '{}'
  WHERE NOT equipped AND (location IS NOT NULL OR cardinality(groups) > 0);

-- An equipped entry with no location is an item of no set place's, or the migration stops, naming those that aren't
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(i.id::text, ', ' ORDER BY i.id) INTO finding
  FROM "character".inventory AS i
  LEFT JOIN rules.entity_fields AS own ON own.entity_id = i.item_id AND own.field = 'ITEM_TYPE'
  LEFT JOIN rules.entity_links AS made ON made.from_id = i.item_id AND made.role = 'madeFrom'
  LEFT JOIN rules.entity_fields AS template ON template.entity_id = made.to_id AND template.field = 'ITEM_TYPE'
  WHERE i.equipped AND i.location IS NULL
    AND coalesce(own.text_value, template.text_value) IN ('Weapon', 'Armor', 'Shield');
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Equipped inventory entries with no location, whose item has a set place: %', finding;
  END IF;
END $$;
UPDATE "character".inventory SET location = 'Other' WHERE equipped AND location IS NULL;

ALTER TABLE "character".inventory DROP COLUMN equipped;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
