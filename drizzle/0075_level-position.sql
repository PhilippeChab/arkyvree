-- A character's levels ran in the order they were made (created_at), which ties: every row a transaction inserts has
-- its start time, so levels saved together had no order but the one a stagger in the level-up gave them, and a
-- companion's levels, or a test's, none at all. A level's position is its place among its character's levels.
--
-- The levels a character has number 1 to n, by when they were made, a tie broken by the class level (a companion's
-- levels are one class's), then by id. An archived level is numbered after them, and the unique index leaves it out.

ALTER TABLE "character"."levels" ADD COLUMN "position" integer;--> statement-breakpoint
UPDATE "character"."levels" AS l SET "position" = ordered.position
FROM (
  SELECT cl.id, row_number() OVER (
    PARTITION BY cl.character_id
    ORDER BY cl.deleted_at IS NOT NULL, cl.created_at, kl.level, cl.id
  ) AS position
  FROM "character"."levels" cl
  JOIN "rules"."klass_levels" kl ON kl.id = cl.klass_level_id
) AS ordered
WHERE ordered.id = l.id;--> statement-breakpoint
ALTER TABLE "character"."levels" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "character_levels_character_id_position" ON "character"."levels" USING btree ("character_id","position") WHERE (deleted_at IS NULL);--> statement-breakpoint
ALTER TABLE "character"."levels" ADD CONSTRAINT "levels_position_check" CHECK ("position" > 0);
