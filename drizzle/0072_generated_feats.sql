ALTER TABLE "rules"."feats" ADD COLUMN "generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The feats the seeds generate, one per option of a family (`Weapon Focus: Longsword`): every system ruleset's feat of
-- these families, the class features' options (`Secret: …`, `Terrain Mastery: …`) aside
UPDATE "rules"."feats" f SET "generated" = true
FROM "rules"."rulesets" r
WHERE r."id" = f."ruleset_id" AND r."system" AND split_part(f."name", ': ', 1) IN (
  'Arcane Defense', 'Deity''s Weapon Focus', 'Deity''s Weapon Specialization', 'Disemboweling Strike',
  'Exotic Weapon Proficiency', 'Favored Enemy', 'Favored Enemy Specialization', 'Greater Resiliency',
  'Greater Spell Focus', 'Greater Weapon Focus', 'Greater Weapon Specialization', 'Head Shot', 'Improved Critical',
  'Martial Weapon Proficiency', 'Power Critical', 'Rapid Reload', 'Simple Weapon Proficiency', 'Skill Focus',
  'Spell Focus', 'War Domain Weapon', 'Weapon Focus', 'Weapon Specialization'
) AND f."name" LIKE '%: _%';
--> statement-breakpoint
-- The feats the app generated in a fork: the Skill Focus of one of its skills (which goes with the skill), and a
-- school's Spell Focus and Greater Spell Focus, which outlive the school's spells: by the bonus the generator gives them
-- on the school's spells (`powers.groups.<school>.*.dc.misc`)
UPDATE "rules"."feats" f SET "generated" = true
FROM "rules"."rulesets" r
WHERE r."id" = f."ruleset_id" AND NOT r."system" AND (
  EXISTS (SELECT FROM "rules"."skills" s WHERE s."ruleset_id" = f."ruleset_id" AND f."name" = 'Skill Focus: ' || s."name")
  OR (split_part(f."name", ': ', 1) IN ('Spell Focus', 'Greater Spell Focus') AND EXISTS (
    SELECT FROM "customization"."modifiers" m
    WHERE m."source_type" = 'feats' AND m."source_id" = f."id" AND m."target" =
      'powers.groups.' || lower(regexp_replace(substr(f."name", strpos(f."name", ': ') + 2), '[^a-zA-Z0-9]', '', 'g')) || '.*.dc.misc'
  ))
);
--> statement-breakpoint
-- A fork's copy of a feat keeps whether the feat it copies, back to the first one, was generated
WITH RECURSIVE copied AS (
  SELECT s."forked_entity_id" AS copy_id, s."source_entity_id" AS source_id
  FROM "rules"."entity_snapshots" s WHERE s."entity_type" = 'feats'
  UNION ALL
  SELECT c.copy_id, s."source_entity_id"
  FROM copied c JOIN "rules"."entity_snapshots" s ON s."entity_type" = 'feats' AND s."forked_entity_id" = c.source_id
)
UPDATE "rules"."feats" f SET "generated" = original."generated"
FROM copied c JOIN "rules"."feats" original ON original."id" = c.source_id
WHERE c.copy_id = f."id"
  AND NOT EXISTS (SELECT FROM "rules"."entity_snapshots" s WHERE s."entity_type" = 'feats' AND s."forked_entity_id" = c.source_id);
