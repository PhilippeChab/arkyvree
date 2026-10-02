-- An attachment (an avatar, a portrait) names its record by type and id, with no foreign key, so each service deleting
-- a user or a character deleted its attachments by hand, and those of the rows the delete's cascade reaches (a demo
-- account's characters, a character's bonded creatures).
--
-- Deleting a user or a character now deletes its attachments, whatever deletes the row. The blob sweep then reclaims
-- the files nothing is attached to any more.

CREATE FUNCTION storage.delete_owned_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM storage.attachments a USING deleted_rows d WHERE a.record_type = TG_ARGV[0] AND a.record_id = d.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER delete_attachments AFTER DELETE ON account.users REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION storage.delete_owned_attachments('User');
--> statement-breakpoint
CREATE TRIGGER delete_attachments AFTER DELETE ON character.characters REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION storage.delete_owned_attachments('Character');
