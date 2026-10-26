-- A character's kind is its module's to say: a new character takes its module's player character's kind
-- (`StoredCharacter.playerKind`, which a create's and an import's plan carry), a bonded creature its own, so
-- `character.characters.kind` defaults to no game's kind any more (it defaulted to 3.5's `pc`). No row changes: every
-- character keeps its kind, and its last change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- A character's kind: written by every create, never defaulted
ALTER TABLE character.characters ALTER COLUMN kind DROP DEFAULT;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
