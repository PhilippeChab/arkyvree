-- A character's level is an advancement now, never a row of the dropped `character.levels`: what the activities and
-- notifications recorded of a level's add, edit and removal names the advancements' table (`levels` →
-- `advancements`), as the code names it now (`getTableName(advancementsInCharacter)`), which opens the character's
-- sheet as it did. Their types (`addLevel`, `editLevel`, `removeLevel`) and their data stay. No enum or check
-- constraint lists an activity's or a notification's table. A character's last change stays where it was: this is no
-- player's change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- What activities recorded of a character's level: its table
UPDATE account.activities SET target_table = 'advancements' WHERE target_table = 'levels';

-- What notifications recorded: the same
UPDATE account.notifications SET target_table = 'advancements' WHERE target_table = 'levels';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
