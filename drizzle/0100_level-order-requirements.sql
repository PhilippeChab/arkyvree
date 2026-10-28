-- A class level's place in its class is the order rule's alone (`LevelRules.findNextClassLevel`): a class's next level
-- is its lowest the character doesn't hold, by the class's id, forced or not. A level past the first no longer stores a
-- requirement of the one before, which a new level's save and the seeders wrote, `classes.<slug>.level` above its
-- position minus one, the slug its class's name when the level was made: the rule implies it, and renaming the class
-- left it naming a class the character doesn't have. Those rows are deleted, as they were written alone: a class
-- level's only requirement, at its root (`1`), a condition, never a group, of the number type, `greater_than`, on a
-- `classes.<slug>.level` target, whatever its slug, valued its level's position minus one, on a level past the first.
-- A requirement that differs in any of these, or that its level holds beside others, a user's own, stays. No other row
-- changes, nor a character's last change (`arkyvree.registry_sync`, which the touch triggers read).

SELECT set_config('arkyvree.registry_sync', 'on', true);
-- The rows of the migrations before it run their deferred checks now: drizzle runs the pending migrations in one
-- transaction
SET CONSTRAINTS ALL IMMEDIATE;

-- A class level's requirement of its class's previous level, as its save and the seeders wrote it, alone on the level
DELETE FROM customization.requirements AS requirement
USING rules.entities AS level
WHERE requirement.entity_type = 'class-levels'
  AND level.id = requirement.entity_id
  AND level.type = 'class-levels'
  AND level.position > 1
  AND requirement.level = '1'
  AND requirement.chaining_operator IS NULL
  AND requirement.value_type = 'number'
  AND requirement.operator = 'greater_than'
  AND requirement.target ~ '^classes\.[a-z0-9]*\.level$'
  AND requirement.value = (level.position - 1)::text
  AND NOT EXISTS (
    SELECT 1 FROM customization.requirements AS other
    WHERE other.entity_id = requirement.entity_id
      AND other.entity_type = requirement.entity_type
      AND other.id <> requirement.id
  );

-- The deferred checks deferred again, for the migrations after this one in its transaction
SET CONSTRAINTS ALL DEFERRED;
