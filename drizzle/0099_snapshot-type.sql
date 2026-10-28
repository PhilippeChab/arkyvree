-- A snapshot is keyed by its ruleset and its source entity alone. An entity's id is global since 0080, so a snapshot's
-- type (`entity_type`), which the per-kind tables' ids needed in its key (`entity_snapshots_ruleset_type_source_unique`),
-- copies its entities' (its copy's, or its source's once a tombstone's copy is deleted), and nothing ties it to them.
-- The type goes, with that key, and a ruleset copies a source once (`entity_snapshots_ruleset_id_source_entity_id_key`).
-- A snapshot whose type differs from its copy's or its source's refuses the migration: two of a source in one ruleset
-- differ in type, so one of them does. No row changes, nor a character's last change (`arkyvree.registry_sync`, which
-- the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- Every snapshot's type is its copy's and its source's, or the migration stops
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM rules.entity_snapshots AS s
    JOIN rules.entities AS e ON e.id IN (s.forked_entity_id, s.source_entity_id)
    WHERE e.type <> s.entity_type
  ) THEN
    RAISE EXCEPTION 'Snapshots differ from their entities'' type';
  END IF;
END $$;

-- The key by the ruleset and the source, then the type's, then the type
ALTER TABLE rules.entity_snapshots ADD CONSTRAINT entity_snapshots_ruleset_id_source_entity_id_key
  UNIQUE (ruleset_id, source_entity_id);
ALTER TABLE rules.entity_snapshots DROP CONSTRAINT entity_snapshots_ruleset_type_source_unique;
ALTER TABLE rules.entity_snapshots DROP COLUMN entity_type;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
