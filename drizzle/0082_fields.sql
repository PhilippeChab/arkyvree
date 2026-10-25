-- An entity's values are its fields, never its properties: a spell's target paths name them
-- (`spells.<spell>.properties.<FIELD>` → `spells.<spell>.fields.<FIELD>`), and what the activities and notifications
-- recorded of a property's change, before the generic fields replaced its rows, is renamed in place as the code reads it
-- now: its type (`createProperty` → `createField`), its table (`properties` → `entity_fields`, whose rows have no page
-- either) and its field (`propertyType` → `field`). No enum or check constraint lists an activity's or a notification's
-- type or table. A character's last change stays where it was: this is no player's change (`arkyvree.registry_sync`,
-- which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- 0080's and 0081's rows run their deferred checks now: drizzle runs the pending migrations in one transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- The target paths a customization names, and its formulas' (`[spells.….properties.…]`: a path anywhere in one)
UPDATE customization.modifiers SET target = regexp_replace(target, '^(spells\.[^.]+\.)properties\.(?=[A-Za-z_])', '\1fields.') WHERE target ~ '^spells\.[^.]+\.properties\.[A-Za-z_]';
UPDATE customization.requirements SET target = regexp_replace(target, '^(spells\.[^.]+\.)properties\.(?=[A-Za-z_])', '\1fields.') WHERE target ~ '^spells\.[^.]+\.properties\.[A-Za-z_]';
UPDATE customization.modifiers SET value = regexp_replace(value, '(^|[^A-Za-z0-9_.])(spells\.[A-Za-z0-9*]+\.)properties\.(?=[A-Za-z_])', '\1\2fields.', 'g') WHERE value ~ '(^|[^A-Za-z0-9_.])spells\.[A-Za-z0-9*]+\.properties\.[A-Za-z_]';
UPDATE customization.requirements SET value = regexp_replace(value, '(^|[^A-Za-z0-9_.])(spells\.[A-Za-z0-9*]+\.)properties\.(?=[A-Za-z_])', '\1\2fields.', 'g') WHERE value ~ '(^|[^A-Za-z0-9_.])spells\.[A-Za-z0-9*]+\.properties\.[A-Za-z_]';

-- What activities recorded: a property's change's type (`createProperty` → `createField`), its table, its field
-- (`"propertyType"` → `"field"`), and a customization's target or value naming a spell's field
UPDATE account.activities SET type = regexp_replace(type, 'Property$', 'Field') WHERE type IN ('createProperty', 'updateProperty', 'deleteProperty');
UPDATE account.activities SET target_table = 'entity_fields' WHERE target_table = 'properties';
UPDATE account.activities SET data = regexp_replace(data::text, '([{,]\s*)"propertyType"(\s*:)', '\1"field"\2', 'g')::json WHERE data::text ~ '[{,]\s*"propertyType"\s*:';
UPDATE account.activities SET data = regexp_replace(data::text, '(^|[^A-Za-z0-9_.])(spells\.[A-Za-z0-9*]+\.)properties\.(?=[A-Za-z_])', '\1\2fields.', 'g')::json WHERE data::text ~ '(^|[^A-Za-z0-9_.])spells\.[A-Za-z0-9*]+\.properties\.[A-Za-z_]';

-- What notifications recorded: the same
UPDATE account.notifications SET type = regexp_replace(type, 'Property$', 'Field') WHERE type IN ('createProperty', 'updateProperty', 'deleteProperty');
UPDATE account.notifications SET target_table = 'entity_fields' WHERE target_table = 'properties';
UPDATE account.notifications SET data = regexp_replace(data::text, '([{,]\s*)"propertyType"(\s*:)', '\1"field"\2', 'g')::json WHERE data::text ~ '[{,]\s*"propertyType"\s*:';
UPDATE account.notifications SET data = regexp_replace(data::text, '(^|[^A-Za-z0-9_.])(spells\.[A-Za-z0-9*]+\.)properties\.(?=[A-Za-z_])', '\1\2fields.', 'g')::json WHERE data::text ~ '(^|[^A-Za-z0-9_.])spells\.[A-Za-z0-9*]+\.properties\.[A-Za-z_]';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
