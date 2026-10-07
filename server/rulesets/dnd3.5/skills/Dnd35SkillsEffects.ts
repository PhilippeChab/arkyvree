import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { hasCharacterPicks, RulesetEdit } from "@/server/cow/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, FeatsAptitudes, Modifiers, Properties } from "@/server/repositories/index.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import type { SkillFields, SkillsEffects } from "@/server/rulesets/engine/module/index.ts";

import { normalizeSkillFields, SKILL_FIELD_PROPERTY_TYPES, toSkillProperties } from "./skillFields.ts";
import SkillsPaths from "./SkillsPaths.ts";

export class Dnd35SkillsEffects implements SkillsEffects {
  async deleteFeats(tx: Db, scope: RulesetScope, skillName: string): Promise<void> {
    const { ruleset, rulesetData } = scope;
    const feat = rulesetData.feats.find((f) => f.name === `Skill Focus: ${skillName}`);
    if (!feat) return;
    if (await hasCharacterPicks(tx, "feats", feat.id, ruleset.id))
      throw new ConflictError("Cannot remove a Skill Focus feat in use by a character in this ruleset");

    // Deleting the local COW copy leaves a tombstone snapshot: the obsolete
    // inherited feat disappears from this fork while its ancestor stays intact.
    const targetId = await new RulesetEdit(ruleset, rulesetData.cow).cowOwner(tx, "feats", feat.id);
    // Hard-delete: FK CASCADE on feats_aptitudes wipes the aptitude link, and
    // the database deletes the feat's customizations.
    // Soft-archive would block a future generateFeats with the same name
    // (the unique index on feats doesn't filter deleted_at).
    await Feats.delete(tx, { id: targetId });
  }

  async generateFeats(tx: Db, scope: RulesetScope, skillName: string): Promise<void> {
    const rulesetId = scope.ruleset.id;
    const generalAptitudeId = scope.rulesetData.aptitudeIdBySlug.get(Dnd35LevelsRules.GENERAL_FEATS_APTITUDE_SLUG);
    if (!generalAptitudeId) return;

    const rows = await Feats.create(tx, {
      name: `Skill Focus: ${skillName}`,
      description: `You get a +3 bonus on all ${skillName} checks.`,
      generated: true,
      rulesetId,
    });
    const feat = rows[0];

    await FeatsAptitudes.create(tx, { featId: feat.id, aptitudeId: generalAptitudeId });

    await Modifiers.createMany(tx, [
      {
        sourceId: feat.id,
        sourceType: "feats",
        target: SkillsPaths.misc(skillName),
        operator: "add",
        value: "3",
        valueType: "number",
      },
    ]);
  }

  async syncProperties(tx: Db, skillId: string, fields: SkillFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [skillId], entityType: "skills", types: SKILL_FIELD_PROPERTY_TYPES });

    const records = toSkillProperties(skillId, normalizeSkillFields(fields));
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
