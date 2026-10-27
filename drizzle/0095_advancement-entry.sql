-- A character's advancement holds an entry on a track (3.5's class level, on its class's track), never the track
-- itself, which the level-up's plan names (3.5's class). Its columns, 0080's copy of the dropped
-- `character.levels.klass_level_id`, were `track_id` and `track_type`: they're `entry_id` and `entry_type`, and so are
-- the indexes and the foreign key that name them (`advancements_character_entry_idx`, a class level once per
-- character; `advancements_entry_idx`; `advancements_entry_id_entry_type_fkey`). Each is renamed in place: no row is
-- rewritten, and no character's last change moves (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- An advancement's entry: its columns, then the indexes and the foreign key that name them
ALTER TABLE "character".advancements RENAME COLUMN track_id TO entry_id;
ALTER TABLE "character".advancements RENAME COLUMN track_type TO entry_type;
ALTER INDEX "character".advancements_character_track_idx RENAME TO advancements_character_entry_idx;
ALTER INDEX "character".advancements_track_idx RENAME TO advancements_entry_idx;
ALTER TABLE "character".advancements
  RENAME CONSTRAINT advancements_track_id_track_type_fkey TO advancements_entry_id_entry_type_fkey;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
