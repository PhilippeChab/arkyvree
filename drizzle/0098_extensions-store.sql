-- A ruleset's extensions are stored once, in `rules.ruleset_extensions`: a live row per extension it subscribes to, its
-- `ordinal` its place in the order the view composes them in (`CowSources.buildSourceChain`). 0018's array,
-- `rules.rulesets.extension_ruleset_ids`, which held that order, goes. Each row takes its extension's place in its
-- ruleset's array (from 0); an array's extension with no row, or an archived one, gets a live one; and a row whose
-- extension isn't in its ruleset's array goes, archived or not: a system base's row for each of its extensions, which
-- the seeder wrote though the base subscribes to none. Once they agree, or the migration stops naming the rulesets that
-- don't (an array that names an extension twice, or a ruleset that doesn't exist), the array is dropped. No other row
-- changes, nor a character's last change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE rules.ruleset_extensions ADD COLUMN ordinal integer;

-- A row whose extension its ruleset's array doesn't name
DELETE FROM rules.ruleset_extensions AS x
USING rules.rulesets AS r
WHERE r.id = x.ruleset_id AND NOT (x.extension_id = ANY (r.extension_ruleset_ids));

-- Each extension an array names: its row live, at its place in the array (its first, if it names it twice)
INSERT INTO rules.ruleset_extensions (ruleset_id, extension_id, ordinal)
SELECT DISTINCT ON (r.id, listed.id) r.id, listed.id, listed.place - 1
FROM rules.rulesets AS r
CROSS JOIN LATERAL unnest(r.extension_ruleset_ids) WITH ORDINALITY AS listed(id, place)
WHERE EXISTS (SELECT 1 FROM rules.rulesets AS extension WHERE extension.id = listed.id)
ORDER BY r.id, listed.id, listed.place
ON CONFLICT (ruleset_id, extension_id) DO UPDATE SET ordinal = excluded.ordinal, deleted_at = NULL;

-- The table holds what the arrays do, in their order, or the migration stops, naming the rulesets that differ
DO $$
DECLARE finding text;
BEGIN
  SELECT string_agg(r.id::text, ', ' ORDER BY r.id) INTO finding
  FROM rules.rulesets AS r
  WHERE r.extension_ruleset_ids IS DISTINCT FROM ARRAY(
    SELECT x.extension_id FROM rules.ruleset_extensions AS x
    WHERE x.ruleset_id = r.id AND x.deleted_at IS NULL ORDER BY x.ordinal
  );
  IF finding IS NOT NULL THEN
    RAISE EXCEPTION 'Rulesets whose extensions differ from their rows: %', finding;
  END IF;
END $$;

-- An extension's place: set on every row, never below 0, and once per ruleset among its live ones
ALTER TABLE rules.ruleset_extensions ALTER COLUMN ordinal SET NOT NULL;
ALTER TABLE rules.ruleset_extensions ADD CONSTRAINT ruleset_extensions_ordinal_check CHECK (ordinal >= 0);
CREATE UNIQUE INDEX ruleset_extensions_ruleset_id_ordinal_idx
  ON rules.ruleset_extensions USING btree (ruleset_id, ordinal) WHERE (deleted_at IS NULL);

-- The array, which nothing reads any more
ALTER TABLE rules.rulesets DROP COLUMN extension_ruleset_ids;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
