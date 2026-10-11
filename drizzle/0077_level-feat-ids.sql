-- A level's feat picks were keyed by the level and the feat (level_feats_pkey: character_level_id, feat_id), so a level
-- held a feat once. A stackable feat can be taken more than once at one level (a human fighter 1 takes Toughness in
-- both its General slots), and a pick is a row: each row is keyed by its own id. The indexes on character_level_id and
-- feat_id stay, which the level's reads and the in-use checks go by.
--
-- The key goes, and every row takes a fresh id; no row changes otherwise.

ALTER TABLE "character"."level_feats" DROP CONSTRAINT "level_feats_pkey";--> statement-breakpoint
ALTER TABLE "character"."level_feats" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT public.gen_random_uuid() NOT NULL;