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
-- A fork's Skill Focus of one of its skills, and Spell Focus of a school of its spells, which the app generated
UPDATE "rules"."feats" f SET "generated" = true
FROM "rules"."rulesets" r
WHERE r."id" = f."ruleset_id" AND NOT r."system" AND (
  EXISTS (SELECT FROM "rules"."skills" s WHERE s."ruleset_id" = f."ruleset_id" AND f."name" = 'Skill Focus: ' || s."name")
  OR EXISTS (
    SELECT FROM "customization"."properties" p JOIN "rules"."powers" pw ON pw."id" = p."entity_id"
    WHERE p."entity_type" = 'powers' AND p."type" = 'SPELL_SCHOOL' AND pw."ruleset_id" = f."ruleset_id"
      AND f."name" IN ('Spell Focus: ' || p."value", 'Greater Spell Focus: ' || p."value")
  )
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
