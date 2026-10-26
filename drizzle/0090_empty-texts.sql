-- Every write of a field stores its values by one rule (`Field.writtenValues`), whoever writes it (a seed, a form's
-- save, an import, a character's edit): an empty text is none, so it stores no row, and a field every write stores
-- (`write: "always"`, an item's slot) stores its default for it. The rows written before as an empty text go the same
-- way: an entity's, a ruleset's and a character's empty text of a field that holds one value is deleted, an item's
-- empty slot takes its default (`Other`). A text a field holds many of (a list's, a progression's), which the rule
-- keeps as it's given, stays.
--
-- Each reads as it read but an inherited one and a slot: a character's deity, height and weight read none as an empty
-- text (its gender and alignment no write sent empty), and an item's type none as no type (an empty one names none its
-- readers look for: a weapon, an armor, a shield, a located type). An item's empty slot reads `Other`, as a save that
-- sends it empty stores it. An item made from a template reads a field it inherits (a weapon's damage) off its template
-- when it holds none, as it does once a save sends that field empty. No other row changes, nor a character's last
-- change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- An item's slot, which every write stores: its default
UPDATE rules.entity_fields SET text_value = 'Other' WHERE field = 'ITEM_SLOT' AND NOT multiple AND text_value = '';

-- Any other empty text of a field that holds one value: none
DELETE FROM rules.entity_fields WHERE value_kind = 'text' AND NOT multiple AND text_value = '';
DELETE FROM rules.ruleset_fields WHERE value_kind = 'text' AND NOT multiple AND text_value = '';
DELETE FROM "character".fields WHERE value_kind = 'text' AND NOT multiple AND text_value = '';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
