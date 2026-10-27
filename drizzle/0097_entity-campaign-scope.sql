-- An entity is its ruleset's, never a campaign's: 0080 copied the old per-kind tables' campaign (`campaign_id`, with
-- its key `campaign_key`, its foreign key and its index), which nothing writes or reads. It goes, with the name keys and
-- the index that named it: a name is unique in its ruleset, its type and its partition (`entities_name_unique_idx`),
-- and a ruleset's entities of a type are indexed by them (`entities_ruleset_type_idx`). An owned entity is in its
-- owner's ruleset (`entities_owner_id_ruleset_id_fkey`, keyed by `entities_id_ruleset_id_key`). An entity that holds a
-- campaign refuses the migration. No row changes, nor a character's last change (`arkyvree.registry_sync`, which the
-- touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- No entity holds a campaign, or the migration stops
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rules.entities WHERE campaign_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Entities hold a campaign, which nothing reads';
  END IF;
END $$;

-- An owned entity's ruleset, by its owner's without the campaign
ALTER TABLE rules.entities DROP CONSTRAINT entities_owner_id_ruleset_id_campaign_key_fkey;
ALTER TABLE rules.entities DROP CONSTRAINT entities_id_ruleset_id_campaign_key_key;
ALTER TABLE rules.entities ADD CONSTRAINT entities_id_ruleset_id_key UNIQUE (id, ruleset_id);
ALTER TABLE rules.entities ADD CONSTRAINT entities_owner_id_ruleset_id_fkey FOREIGN KEY (owner_id, ruleset_id)
  REFERENCES rules.entities(id, ruleset_id) ON DELETE CASCADE;

-- A name's key and a ruleset's index without the campaign
DROP INDEX rules.entities_with_campaign_unique_idx;
DROP INDEX rules.entities_without_campaign_unique_idx;
CREATE UNIQUE INDEX entities_name_unique_idx ON rules.entities (ruleset_id, type, partition, name)
  WHERE name IS NOT NULL;
DROP INDEX rules.entities_ruleset_type_campaign_idx;
CREATE INDEX entities_ruleset_type_idx ON rules.entities (ruleset_id, type);

-- The campaign: its foreign key and its index, then its key and its column
ALTER TABLE rules.entities DROP CONSTRAINT entities_campaign_id_fkey;
DROP INDEX rules.entities_campaign_idx;
ALTER TABLE rules.entities DROP COLUMN campaign_key;
ALTER TABLE rules.entities DROP COLUMN campaign_id;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
