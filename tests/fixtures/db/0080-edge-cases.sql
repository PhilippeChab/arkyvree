-- Rows the seeded test data lacks, added to the tables before migration 0080, so every mapping it copies is exercised.
DO $$
DECLARE
  rs uuid; camp uuid; race uuid; klass uuid; lvl uuid; feat uuid; apt uuid; ab uuid; pw uuid; ch uuid; cl uuid; sv uuid;
BEGIN
  SELECT r.id INTO rs FROM rules.rulesets r JOIN rules.races ra ON ra.ruleset_id = r.id GROUP BY r.id ORDER BY count(*) DESC LIMIT 1;
  INSERT INTO campaign.campaigns (ruleset_id, name) VALUES (rs, 'Edge campaign') RETURNING id INTO camp;

  -- A campaign's own entities, a subrace and a subclass, a deleted entity, a mechanic
  SELECT id INTO race FROM rules.races WHERE ruleset_id = rs AND kind = 'pc' LIMIT 1;
  INSERT INTO rules.races (ruleset_id, campaign_id, name, size, base_speed, parent_id, kind)
    VALUES (rs, camp, 'Edge subrace', 'Small', 20, race, 'pc');
  SELECT id INTO klass FROM rules.klasses WHERE ruleset_id = rs AND kind = 'pc' LIMIT 1;
  INSERT INTO rules.klasses (ruleset_id, name, hd, parent_id, kind) VALUES (rs, 'Edge subclass', 6, klass, 'pc');
  INSERT INTO rules.feats (ruleset_id, campaign_id, name, stackable, selectable, generated, deleted_at)
    VALUES (rs, camp, 'Edge deleted feat', true, false, true, now());
  INSERT INTO rules.mechanics (ruleset_id, name, description) VALUES (rs, 'Edge mechanic', 'A rule');
  INSERT INTO rules.items (ruleset_id, name, weight, cost_gp, type, slot, is_template)
    VALUES (rs, 'Edge item, no weight', NULL, 0.25, NULL, 'Other', false);

  -- A class level granting a power through a pool
  SELECT id INTO lvl FROM rules.klass_levels WHERE klass_id = klass ORDER BY level LIMIT 1;
  SELECT power_id, aptitude_id INTO pw, apt FROM rules.powers_aptitudes p JOIN rules.powers w ON w.id = p.power_id
    WHERE w.ruleset_id = rs LIMIT 1;
  INSERT INTO rules.klass_level_powers (klass_level_id, power_id, aptitude_id, free) VALUES (lvl, pw, apt, true);

  -- A character with an ability increase and a stackable feat taken twice at one level, archived
  SELECT c.id, l.id INTO ch, cl FROM character.characters c JOIN character.levels l ON l.character_id = c.id
    WHERE c.ruleset_id = rs AND c.kind = 'pc' ORDER BY l.position LIMIT 1;
  SELECT id INTO ab FROM rules.abilities WHERE ruleset_id = rs LIMIT 1;
  INSERT INTO character.level_ability_increases (character_level_id, ability_id, amount) VALUES (cl, ab, 1);
  SELECT f.id, fa.aptitude_id INTO feat, apt FROM rules.feats f JOIN rules.feats_aptitudes fa ON fa.feat_id = f.id
    WHERE f.ruleset_id = rs AND f.stackable LIMIT 1;
  IF feat IS NULL THEN
    SELECT f.id, fa.aptitude_id INTO feat, apt FROM rules.feats f JOIN rules.feats_aptitudes fa ON fa.feat_id = f.id
      WHERE f.ruleset_id = rs LIMIT 1;
  END IF;
  INSERT INTO character.level_feats (character_level_id, feat_id, aptitude_id) VALUES (cl, feat, apt), (cl, feat, apt);
  UPDATE character.characters SET age = 31, deity = 'Edge deity', deleted_at = now() WHERE id = ch;
END $$;
