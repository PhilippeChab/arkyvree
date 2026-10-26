-- An entity's form names its columns by the stored field or the role that keeps each, as its fields are named (`ITEM_TYPE`,
-- `madeFrom`), never by keys of its own (`type`, `sourceItemId`): what an update's activity and notification recorded of
-- the columns it changed (`changedFields[*].field`) names them so, by entity type (an item's `costGp` → `ITEM_COST_GP`,
-- a skill's `primaryAbilityId` and a save's `abilityId` → `keyAbility`, a spell's `saveId` → `resistedBy`…), and lists
-- them in the order an update records them now: its name, its description, then its columns in the order its form
-- describes them (an item's cost, weight, type, slot and template). Each change's text is kept as it was recorded, its
-- field's name aside, and the rest of the data with it. No other activity records changed fields. A character's last
-- change stays where it was: this is no player's change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- What activities recorded of an update's columns: their names, in their order
UPDATE account.activities AS recorded
SET data = overlay(recorded.data::text PLACING changed.fields FROM strpos(recorded.data::text, changed.was) FOR length(changed.was))::json
FROM (
  SELECT entry.id, (entry.data -> 'changedFields')::text AS was,
    '[' || string_agg(
      CASE WHEN renamed.name IS NULL THEN change.value::text
        ELSE regexp_replace(change.value::text, '^(\{\s*"field"\s*:\s*")[^"]*"', '\1' || renamed.name || '"') END,
      ',' ORDER BY CASE change.value ->> 'field' WHEN 'name' THEN 0 WHEN 'description' THEN 1 ELSE coalesce(renamed.rank, 100) END, change.n
    ) || ']' AS fields
  FROM account.activities AS entry
  CROSS JOIN LATERAL json_array_elements(entry.data -> 'changedFields') WITH ORDINALITY AS change(value, n)
  CROSS JOIN LATERAL (SELECT
    CASE entry.target_table
      WHEN 'items' THEN CASE change.value ->> 'field' WHEN 'costGp' THEN 'ITEM_COST_GP' WHEN 'weight' THEN 'ITEM_WEIGHT' WHEN 'type' THEN 'ITEM_TYPE' WHEN 'slot' THEN 'ITEM_SLOT' WHEN 'sourceItemId' THEN 'madeFrom' WHEN 'isTemplate' THEN 'ITEM_IS_TEMPLATE' END
      WHEN 'classes' THEN CASE change.value ->> 'field' WHEN 'hd' THEN 'CLASS_HD' END
      WHEN 'races' THEN CASE change.value ->> 'field' WHEN 'size' THEN 'RACE_SIZE' WHEN 'baseSpeed' THEN 'RACE_BASE_SPEED' END
      WHEN 'languages' THEN CASE change.value ->> 'field' WHEN 'type' THEN 'LANGUAGE_TYPE' END
      WHEN 'skills' THEN CASE change.value ->> 'field' WHEN 'primaryAbilityId' THEN 'keyAbility' END
      WHEN 'saves' THEN CASE change.value ->> 'field' WHEN 'abilityId' THEN 'keyAbility' END
      WHEN 'spells' THEN CASE change.value ->> 'field' WHEN 'saveId' THEN 'resistedBy' WHEN 'saveEffect' THEN 'SPELL_SAVE_EFFECT' END
    END AS name,
    CASE entry.target_table
      WHEN 'items' THEN CASE change.value ->> 'field' WHEN 'costGp' THEN 2 WHEN 'weight' THEN 3 WHEN 'type' THEN 4 WHEN 'slot' THEN 5 WHEN 'sourceItemId' THEN 6 WHEN 'isTemplate' THEN 7 END
      WHEN 'classes' THEN CASE change.value ->> 'field' WHEN 'hd' THEN 2 END
      WHEN 'races' THEN CASE change.value ->> 'field' WHEN 'size' THEN 2 WHEN 'baseSpeed' THEN 3 END
      WHEN 'languages' THEN CASE change.value ->> 'field' WHEN 'type' THEN 2 END
      WHEN 'skills' THEN CASE change.value ->> 'field' WHEN 'primaryAbilityId' THEN 2 END
      WHEN 'saves' THEN CASE change.value ->> 'field' WHEN 'abilityId' THEN 2 END
      WHEN 'spells' THEN CASE change.value ->> 'field' WHEN 'saveId' THEN 2 WHEN 'saveEffect' THEN 3 END
    END AS rank
  ) AS renamed
  WHERE entry.target_table IN ('abilities', 'aptitudes', 'classes', 'feats', 'items', 'languages', 'mechanics', 'races', 'saves', 'skills', 'spells') AND entry.type LIKE 'update%'
    AND json_typeof(entry.data -> 'changedFields') = 'array'
  GROUP BY entry.id
) AS changed
WHERE recorded.id = changed.id AND changed.fields <> changed.was;

-- What notifications recorded: the same
UPDATE account.notifications AS recorded
SET data = overlay(recorded.data::text PLACING changed.fields FROM strpos(recorded.data::text, changed.was) FOR length(changed.was))::json
FROM (
  SELECT entry.id, (entry.data -> 'changedFields')::text AS was,
    '[' || string_agg(
      CASE WHEN renamed.name IS NULL THEN change.value::text
        ELSE regexp_replace(change.value::text, '^(\{\s*"field"\s*:\s*")[^"]*"', '\1' || renamed.name || '"') END,
      ',' ORDER BY CASE change.value ->> 'field' WHEN 'name' THEN 0 WHEN 'description' THEN 1 ELSE coalesce(renamed.rank, 100) END, change.n
    ) || ']' AS fields
  FROM account.notifications AS entry
  CROSS JOIN LATERAL json_array_elements(entry.data -> 'changedFields') WITH ORDINALITY AS change(value, n)
  CROSS JOIN LATERAL (SELECT
    CASE entry.target_table
      WHEN 'items' THEN CASE change.value ->> 'field' WHEN 'costGp' THEN 'ITEM_COST_GP' WHEN 'weight' THEN 'ITEM_WEIGHT' WHEN 'type' THEN 'ITEM_TYPE' WHEN 'slot' THEN 'ITEM_SLOT' WHEN 'sourceItemId' THEN 'madeFrom' WHEN 'isTemplate' THEN 'ITEM_IS_TEMPLATE' END
      WHEN 'classes' THEN CASE change.value ->> 'field' WHEN 'hd' THEN 'CLASS_HD' END
      WHEN 'races' THEN CASE change.value ->> 'field' WHEN 'size' THEN 'RACE_SIZE' WHEN 'baseSpeed' THEN 'RACE_BASE_SPEED' END
      WHEN 'languages' THEN CASE change.value ->> 'field' WHEN 'type' THEN 'LANGUAGE_TYPE' END
      WHEN 'skills' THEN CASE change.value ->> 'field' WHEN 'primaryAbilityId' THEN 'keyAbility' END
      WHEN 'saves' THEN CASE change.value ->> 'field' WHEN 'abilityId' THEN 'keyAbility' END
      WHEN 'spells' THEN CASE change.value ->> 'field' WHEN 'saveId' THEN 'resistedBy' WHEN 'saveEffect' THEN 'SPELL_SAVE_EFFECT' END
    END AS name,
    CASE entry.target_table
      WHEN 'items' THEN CASE change.value ->> 'field' WHEN 'costGp' THEN 2 WHEN 'weight' THEN 3 WHEN 'type' THEN 4 WHEN 'slot' THEN 5 WHEN 'sourceItemId' THEN 6 WHEN 'isTemplate' THEN 7 END
      WHEN 'classes' THEN CASE change.value ->> 'field' WHEN 'hd' THEN 2 END
      WHEN 'races' THEN CASE change.value ->> 'field' WHEN 'size' THEN 2 WHEN 'baseSpeed' THEN 3 END
      WHEN 'languages' THEN CASE change.value ->> 'field' WHEN 'type' THEN 2 END
      WHEN 'skills' THEN CASE change.value ->> 'field' WHEN 'primaryAbilityId' THEN 2 END
      WHEN 'saves' THEN CASE change.value ->> 'field' WHEN 'abilityId' THEN 2 END
      WHEN 'spells' THEN CASE change.value ->> 'field' WHEN 'saveId' THEN 2 WHEN 'saveEffect' THEN 3 END
    END AS rank
  ) AS renamed
  WHERE entry.target_table IN ('abilities', 'aptitudes', 'classes', 'feats', 'items', 'languages', 'mechanics', 'races', 'saves', 'skills', 'spells') AND entry.type LIKE 'update%'
    AND json_typeof(entry.data -> 'changedFields') = 'array'
  GROUP BY entry.id
) AS changed
WHERE recorded.id = changed.id AND changed.fields <> changed.was;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
