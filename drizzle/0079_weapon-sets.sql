-- An inventory entry held in a hand was in one weapon set (weapon_set, from 0), so a shield kept across two sets was two
-- entries: its weight counted twice. An entry's sets are a list of their own, weapon_sets: a hand's entry is in each set
-- it lists, and an entry outside the hands lists none.
--
-- Each entry's set becomes a list of it, and an entry without one an empty list. The column changes in place, with no
-- UPDATE, so the inventory's triggers leave its characters' last change alone.

ALTER TABLE "character"."inventory" ALTER COLUMN "weapon_set" SET DATA TYPE smallint[] USING (
  CASE WHEN "weapon_set" IS NULL THEN '{}'::smallint[] ELSE ARRAY["weapon_set"] END
);--> statement-breakpoint
ALTER TABLE "character"."inventory" RENAME COLUMN "weapon_set" TO "weapon_sets";--> statement-breakpoint
ALTER TABLE "character"."inventory" ALTER COLUMN "weapon_sets" SET DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "character"."inventory" ALTER COLUMN "weapon_sets" SET NOT NULL;
