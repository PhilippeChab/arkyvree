-- A level's and an inventory item's activities and notifications target their character, as `characters`: their target
-- types, `advancements` and `inventory`, were the table a write touched (0092's `target_table`, renamed), paired with
-- the character's id, never a row of that table, and opened its page as `characters` does. No other row changes, nor a
-- character's last change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

UPDATE account.activities SET target_type = 'characters' WHERE target_type IN ('advancements', 'inventory');
UPDATE account.notifications SET target_type = 'characters' WHERE target_type IN ('advancements', 'inventory');

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
