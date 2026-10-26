-- The registries hold what the generic tables' rows are checked against (their foreign keys, the delete rules'
-- trigger). How sibling copies merge a field or a link (`merge`) and the role an entity reads a field off another
-- through (`inherits_via`, an item's template) are how the engine composes a ruleset's view: no row, key or trigger
-- reads them, and the engine reads them from its modules' declarations (`DeclaredFields`, `StorageEngine.viewSchema`),
-- and refuses what these columns' checks and key refused (`StorageEngine`). So the registries drop them: `field_defs`'
-- `merge`, `inherits_via` and the `inherits_single` it generated, with their checks and key, and `link_roles`' `merge`
-- with its checks. Only the registry tables change; no row of anyone's data does, nor a character's last change
-- (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- A field's merge and inheritance: their checks, the key to the role it inherits through, then the columns
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_check1;
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_check2;
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_merge_check;
ALTER TABLE rules.field_defs DROP CONSTRAINT field_defs_inherits_via_entity_type_entity_type_inherits_s_fkey;
ALTER TABLE rules.field_defs DROP COLUMN inherits_single;
ALTER TABLE rules.field_defs DROP COLUMN inherits_via;
ALTER TABLE rules.field_defs DROP COLUMN merge;

-- A link role's merge: its checks, then the column
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_check;
ALTER TABLE rules.link_roles DROP CONSTRAINT link_roles_merge_check;
ALTER TABLE rules.link_roles DROP COLUMN merge;

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
