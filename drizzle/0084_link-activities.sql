-- A class's skill is a link of its role now, never a join's row: what the activities and notifications recorded of its
-- adds and removals names the role (`class_skills` → `classSkill`, whose links a class's page edits on a tab of their
-- own, which the activity opens), as the code names a link it records now. Their types are the role's already
-- (`addClassSkill`, `removeClassSkill`), and their data stays. No enum or check constraint lists an activity's or a
-- notification's table. A character's last change stays where it was: this is no player's change
-- (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- What activities recorded of a class's skill: its table
UPDATE account.activities SET target_table = 'classSkill' WHERE target_table = 'class_skills';

-- What notifications recorded: the same
UPDATE account.notifications SET target_table = 'classSkill' WHERE target_table = 'class_skills';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
