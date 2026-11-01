-- A fork's Settings are read through its chain (`rulesetValuesOf`: the fork's own rows, then its extensions', then its
-- parent's), as everything else it inherits is, until it saves its own. A fork copied its parent's Settings rows when
-- it was made, which always won over the chain: a fork never read an extension's Settings, nor its parent's later ones.
-- Forks no longer copy them. The copies go: a fork's rows of a field or a role, when the whole of them is what its
-- parent holds of it now, none saved since it was copied (none newer than the fork, which a save would be, nor changed
-- since). The fork reads its parent's same rows in their place, unless an extension of its holds its own. Rows a fork
-- saved stay.

-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

WITH own AS (
  SELECT link.ruleset_id, link.role, link.to_id, link.to_type, fork.ruleset_id AS parent_id,
    link.updated_at = link.created_at AND link.created_at <= fork.created_at AS copied
  FROM rules.ruleset_links AS link
  JOIN rules.rulesets AS fork ON fork.id = link.ruleset_id
  WHERE fork.ruleset_id IS NOT NULL
), copied AS (
  SELECT own.ruleset_id, own.role FROM own
  GROUP BY own.ruleset_id, own.role, own.parent_id
  HAVING bool_and(own.copied)
    AND array_agg(own.to_id::text || ' ' || own.to_type ORDER BY own.to_id::text || ' ' || own.to_type) = (
      SELECT array_agg(parent.to_id::text || ' ' || parent.to_type ORDER BY parent.to_id::text || ' ' || parent.to_type)
      FROM rules.ruleset_links AS parent WHERE parent.ruleset_id = own.parent_id AND parent.role = own.role
    )
)
DELETE FROM rules.ruleset_links AS link USING copied
  WHERE link.ruleset_id = copied.ruleset_id AND link.role = copied.role;

WITH own AS (
  SELECT field.ruleset_id, field.owner_type, field.field, fork.ruleset_id AS parent_id,
    (field.ordinal, field.value_kind, field.multiple, field.text_value, field.number_value, field.flag_value)::text AS value,
    field.updated_at = field.created_at AND field.created_at <= fork.created_at AS copied
  FROM rules.ruleset_fields AS field
  JOIN rules.rulesets AS fork ON fork.id = field.ruleset_id
  WHERE fork.ruleset_id IS NOT NULL
), copied AS (
  SELECT own.ruleset_id, own.owner_type, own.field FROM own
  GROUP BY own.ruleset_id, own.owner_type, own.field, own.parent_id
  HAVING bool_and(own.copied)
    AND array_agg(own.value ORDER BY own.value) = (
      SELECT array_agg(
        (parent.ordinal, parent.value_kind, parent.multiple, parent.text_value, parent.number_value, parent.flag_value)::text
        ORDER BY (parent.ordinal, parent.value_kind, parent.multiple, parent.text_value, parent.number_value, parent.flag_value)::text
      )
      FROM rules.ruleset_fields AS parent
      WHERE parent.ruleset_id = own.parent_id AND parent.owner_type = own.owner_type AND parent.field = own.field
    )
)
DELETE FROM rules.ruleset_fields AS field USING copied
  WHERE field.ruleset_id = copied.ruleset_id AND field.owner_type = copied.owner_type AND field.field = copied.field;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
