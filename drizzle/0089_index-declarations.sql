-- The schema declares the indexes the database has, and the database has the indexes its queries use. A database
-- migrated from scratch and production already hold the same ones (names and definitions); what changes is what
-- neither needed or what left rows out:
--
-- - A btree another index covers goes: a user's starred rulesets by user (the key, `starred_rulesets_pkey`, leads with
--   it), a ruleset's snapshots by type and by type and source (the unique `entity_snapshots_ruleset_type_source_unique`
--   is one, and leads with the other), a record's attachments (the unique `attachments_record_name_unique_idx` leads
--   with it).
-- - The indexes by a foreign key of a table that archives (a character's by its owner and its ruleset, a campaign's
--   seats by campaign and by user, an invite's by its player and its user) hold every row: an archived list, a hard
--   delete and the delete that cascades through the key read rows the archive's predicate (`deleted_at IS NULL`) left
--   out. An invite by its email, which only a live invite's reads look up, keeps it.
-- - A foreign key whose deletes no index served gets one: a ruleset's stars (its cascade, and its star counts), a
--   user's notifications as their actor and the character and ruleset invites they sent (the cascades from a deleted
--   user), a fork's parent and an extension's subscribers (the cascades from a deleted ruleset), and a source entity's
--   snapshots (a revert repoints them by it alone).
--
-- The schema loses the declarations no database had (an activity by its type and by its user, a requirement by its
-- entity and by its type, a ruleset by its owner and privacy, a seat's and an invite's indexes under other names and
-- columns), and the operator classes `drizzle-kit pull` wrote, each its column's default or another type's; it declares
-- those the database had and it didn't say: the text searches' trigram indexes, a user's activities by date, the
-- rulesets by status and a user's by status, and the archived tables' by foreign key, and those 0089 creates. Its
-- composite foreign keys take their columns in the database's order (an owned entity's by its owner, ruleset and
-- campaign; a link's by its role and kinds), which `drizzle-kit pull` had scrambled: the database's keys don't change.
-- No row changes, nor a character's last change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- What another index covers
DROP INDEX account.starred_rulesets_user_id;
DROP INDEX rules.entity_snapshots_ruleset_type_source;
DROP INDEX rules.entity_snapshots_ruleset_id_entity_type;
DROP INDEX storage.attachments_record_idx;

-- A character by its owner and by its ruleset, over every character
DROP INDEX "character".characters_user_id_idx;
CREATE INDEX characters_user_id_idx ON "character".characters (user_id);
DROP INDEX "character".characters_ruleset_id_idx;
CREATE INDEX characters_ruleset_id_idx ON "character".characters (ruleset_id);

-- A campaign's seats, and a user's, over every seat
DROP INDEX campaign.players_campaign_id_idx;
CREATE INDEX players_campaign_id_idx ON campaign.players (campaign_id);
DROP INDEX campaign.players_user_id_campaign_id_idx;
CREATE INDEX players_user_id_campaign_id_idx ON campaign.players (user_id, campaign_id);

-- A seat's invites, and a user's, over every invite
DROP INDEX campaign.invites_player_id_idx;
CREATE INDEX invites_player_id_idx ON campaign.invites (player_id);
DROP INDEX campaign.invites_user_id_status_idx;
CREATE INDEX invites_user_id_status_idx ON campaign.invites (user_id, status);

-- What a foreign key's deletes, or a read by the key alone, look up
CREATE INDEX starred_rulesets_ruleset_id_idx ON account.starred_rulesets (ruleset_id);
CREATE INDEX notifications_actor_id_idx ON account.notifications (actor_id);
CREATE INDEX character_contributors_invited_by_idx ON "character".character_contributors (invited_by);
CREATE INDEX contributors_invited_by_idx ON rules.contributors (invited_by);
CREATE INDEX rulesets_ruleset_id_idx ON rules.rulesets (ruleset_id);
CREATE INDEX ruleset_extensions_extension_id_idx ON rules.ruleset_extensions (extension_id);
CREATE INDEX entity_snapshots_source_entity_id_idx ON rules.entity_snapshots (source_entity_id);

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
