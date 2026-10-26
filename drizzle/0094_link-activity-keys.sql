-- A link's activity records its target as every link does, by `toId` and `toName`: what a class skill's add and remove
-- (`addClassSkill`, `removeClassSkill`) and their notifications recorded under the dropped `klass_skills` table's keys,
-- `skillId` and `skillName`, is named so: the data's own keys alone, never a key nested in one of its values. Each key
-- keeps its place and its value's text, its object written as the app writes one (no space between its keys and
-- values): only a link's activity (`add…`, `remove…`) that holds neither new key already. jsonb would sort the keys, so
-- the object is rebuilt from its keys in their order (`json_each`). A character's last
-- change stays where it was: this is no player's change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- What activities recorded of a link's target: its keys
UPDATE account.activities AS recorded
SET data = (
  SELECT ('{' || string_agg(
    to_json(CASE entry.key WHEN 'skillId' THEN 'toId' WHEN 'skillName' THEN 'toName' ELSE entry.key END)::text
      || ':' || entry.value::text,
    ',' ORDER BY entry.n
  ) || '}')::json
  FROM json_each(recorded.data) WITH ORDINALITY AS entry(key, value, n)
)
WHERE recorded.type ~ '^(add|remove)[A-Z]' AND json_typeof(recorded.data) = 'object'
  AND (recorded.data::jsonb ? 'skillId' OR recorded.data::jsonb ? 'skillName')
  AND NOT (recorded.data::jsonb ? 'toId' OR recorded.data::jsonb ? 'toName');

-- What notifications recorded: the same
UPDATE account.notifications AS recorded
SET data = (
  SELECT ('{' || string_agg(
    to_json(CASE entry.key WHEN 'skillId' THEN 'toId' WHEN 'skillName' THEN 'toName' ELSE entry.key END)::text
      || ':' || entry.value::text,
    ',' ORDER BY entry.n
  ) || '}')::json
  FROM json_each(recorded.data) WITH ORDINALITY AS entry(key, value, n)
)
WHERE recorded.type ~ '^(add|remove)[A-Z]' AND json_typeof(recorded.data) = 'object'
  AND (recorded.data::jsonb ? 'skillId' OR recorded.data::jsonb ? 'skillName')
  AND NOT (recorded.data::jsonb ? 'toId' OR recorded.data::jsonb ? 'toName');

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
