-- An advancement's entry key (`advancements_entry_id_entry_type_fkey`) was written `MATCH FULL` by 0080, when its
-- columns, then `track_id` and `track_type`, were nullable: an id without its type was refused. 0104 made both columns
-- `NOT NULL`, which leaves `MATCH FULL` nothing to match. The key is written again as every required reference that
-- doesn't own its row is (a character's link's, an inventory entry's item), `DEFERRABLE INITIALLY DEFERRED` without
-- it. No row changes.

-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE "character".advancements DROP CONSTRAINT advancements_entry_id_entry_type_fkey;
ALTER TABLE "character".advancements ADD CONSTRAINT advancements_entry_id_entry_type_fkey
  FOREIGN KEY (entry_id, entry_type) REFERENCES rules.entities(id, type) DEFERRABLE INITIALLY DEFERRED;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
