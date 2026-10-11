-- Prevent concurrent reconciles from inserting duplicate bonded rows.
-- Two overlapping finalizeLevelUp / updateLevel transactions can both
-- observe "no existing bonded for this (master, kind)" and both INSERT
-- before either commits — leaving the master with two bonded rows of the
-- same kind, one of which becomes orphaned (archive endpoints reject
-- bonded ids by design, so it's permanent).
--
-- The partial unique index makes the second insert fail with 23505;
-- bondedReconcile catches that and re-fetches.

CREATE UNIQUE INDEX "characters_one_bonded_per_kind_per_master_idx"
  ON "character"."characters" ("parent_character_id", "kind")
  WHERE deleted_at IS NULL AND parent_character_id IS NOT NULL;
