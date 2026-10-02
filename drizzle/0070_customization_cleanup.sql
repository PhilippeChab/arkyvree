-- A customization (modifier, requirement, property) names what it belongs to by type and id, with no foreign key.
-- A service deleting an entity deleted its customizations, but a foreign key's cascade didn't: purging a demo account
-- deletes its rulesets, their entities and its characters, and left their customizations behind.
--
-- Deleting a row a customization can belong to now deletes its customizations, whatever deletes the row. A modifier's
-- requirements go with it through the modifiers' own trigger.

CREATE FUNCTION customization.delete_owned_customizations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A statement trigger fires on a delete of no row too: the modifiers' would set off its own delete forever
  IF NOT EXISTS (SELECT FROM deleted_rows) THEN
    RETURN NULL;
  END IF;
  DELETE FROM customization.modifiers m USING deleted_rows d WHERE m.source_type = TG_ARGV[0] AND m.source_id = d.id;
  DELETE FROM customization.requirements r USING deleted_rows d WHERE r.entity_type = TG_ARGV[0] AND r.entity_id = d.id;
  DELETE FROM customization.properties p USING deleted_rows d WHERE p.entity_type = TG_ARGV[0] AND p.entity_id = d.id;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.aptitudes REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('aptitudes');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.feats REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('feats');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.items REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('items');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.klasses REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('klasses');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.klass_levels REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('klass_levels');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.languages REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('languages');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.powers REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('powers');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.races REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('races');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.rulesets REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('rulesets');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.saves REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('saves');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON rules.skills REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('skills');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON character.characters REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('characters');
--> statement-breakpoint
CREATE TRIGGER delete_customizations AFTER DELETE ON customization.modifiers REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION customization.delete_owned_customizations('modifiers');
