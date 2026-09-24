ALTER TABLE "rules"."entity_snapshots" ADD COLUMN "generated_deletion" json;--> statement-breakpoint
ALTER TABLE "rules"."feats" ADD COLUMN "generated_from" json;
--> statement-breakpoint
-- Establish dependency identity once at the migration boundary. COW copies
-- inherit identity from their source below, including renamed copies.
WITH candidates AS (
  SELECT f.id, f.ruleset_id, split_part(f.name, ': ', 1) AS family,
    substring(f.name FROM strpos(f.name, ': ') + 2) AS label,
    ARRAY[r.id] || r.extension_ruleset_ids || r.ancestor_ruleset_ids AS chain
  FROM rules.feats f JOIN rules.rulesets r ON r.id = f.ruleset_id
  WHERE strpos(f.name, ': ') > 0 AND r.base_rules = 'Dungeons & Dragons: 3.5'
    AND NOT EXISTS (SELECT 1 FROM rules.entity_snapshots s WHERE s.entity_type = 'feats' AND s.forked_entity_id = f.id)
), identities AS (
  SELECT c.*, CASE
    WHEN family = 'Skill Focus' THEN 'skills'
    WHEN family IN ('Spell Focus', 'Greater Spell Focus') THEN 'SPELL_SCHOOL'
    ELSE 'WEAPON_TYPE' END AS kind,
    CASE WHEN family = 'Skill Focus' THEN (
      SELECT s.id::text FROM rules.skills s
      WHERE s.ruleset_id = ANY(c.chain) AND s.name = c.label AND s.deleted_at IS NULL
      ORDER BY array_position(c.chain, s.ruleset_id) LIMIT 1
    ) ELSE lower(regexp_replace(label, '[^a-zA-Z0-9]', '', 'g')) END AS source_key
  FROM candidates c WHERE family IN (
    'Skill Focus', 'Spell Focus', 'Greater Spell Focus', 'Weapon Focus', 'Greater Weapon Focus',
    'Weapon Specialization', 'Greater Weapon Specialization', 'Improved Critical',
    'Simple Weapon Proficiency', 'Martial Weapon Proficiency', 'Exotic Weapon Proficiency', 'Rapid Reload'
  )
)
UPDATE rules.feats f SET generated_from = json_build_object('kind', i.kind, 'key', i.source_key, 'label', i.label, 'family', i.family)
FROM identities i WHERE f.id = i.id AND i.source_key IS NOT NULL;
--> statement-breakpoint
WITH RECURSIVE lineage AS (
  SELECT id, generated_from, ARRAY[id] AS path FROM rules.feats WHERE generated_from IS NOT NULL
  UNION ALL
  SELECT child.id, parent.generated_from, parent.path || child.id
  FROM lineage parent
  JOIN rules.entity_snapshots snapshot ON snapshot.source_entity_id = parent.id AND snapshot.entity_type = 'feats'
  JOIN rules.feats child ON child.id = snapshot.forked_entity_id
  WHERE child.generated_from IS NULL AND NOT child.id = ANY(parent.path)
)
UPDATE rules.feats f SET generated_from = lineage.generated_from
FROM lineage WHERE f.id = lineage.id AND f.generated_from IS NULL;
