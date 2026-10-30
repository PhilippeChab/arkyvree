-- The activities and notifications of a ruleset entity's custom field (`createField`, `updateField`, `deleteField`,
-- targeting `entity-fields`) go. Before 0080 those fields were `customization.properties`' rows, whose activities 0082
-- renamed in place and 0092 targeted at `entity-fields`; nothing writes them since 0080, the client no longer words
-- them, and no page opens their target. No other row changes, nor a character's last change
-- (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

DELETE FROM account.notifications WHERE target_type = 'entity-fields';
DELETE FROM account.activities WHERE target_type = 'entity-fields';

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
