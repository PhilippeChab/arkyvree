-- A parent keeps one live child of a kind (3.5's familiar, animal companion), as 0068's index kept it before 0080
-- dropped it with the per-kind tables: two level saves that both read no child and both make one now fail the second
-- on the index too, not on the parent's lock alone. Production holds no two live children of a kind under one parent.

CREATE UNIQUE INDEX "characters_one_live_child_per_kind_idx" ON "character"."characters" USING btree ("parent_character_id","kind") WHERE ((deleted_at IS NULL) AND (parent_character_id IS NOT NULL));
