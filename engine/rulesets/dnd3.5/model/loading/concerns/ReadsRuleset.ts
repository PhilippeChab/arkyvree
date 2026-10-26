import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { CLASS_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { CasterType } from "@/vocabulary/dnd3.5/classes.ts";

/** What a character's load reads of its ruleset's view: its rows, their fields and their 3.5 meaning. */
export function ReadsRuleset<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class ReadingRuleset extends Base {
    /**
     * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
     * their saves (their `baseBonus` links), and its classes and their skills (their `classSkill` links), once each.
     * languagesById is the view's (`RulesetData.byId`): stored pre-COW language ids auto-resolve on lookup.
     */
    protected readCachedRows(rows: CharacterRows, rulesetData: RulesetData, classLevelIds: string[]) {
      const dnd35 = Dnd35View.of(rulesetData);
      const classLevelsRaw = classLevelIds.flatMap((id) => dnd35.classLevelsById.get(id) ?? []);
      const classIds = [...new Set(classLevelsRaw.map((level) => level.ownerId))];
      return {
        languages: rows.links.speaks.flatMap((link) => dnd35.languagesById.get(link.entityId) ?? []),
        classLevelsRaw,
        baseBonusLinks: classLevelIds.flatMap((id) => dnd35.baseBonusesOf(id)),
        classes: classIds.flatMap((id) => dnd35.classesById.get(id) ?? []),
        classSkillLinks: classIds.flatMap((id) => dnd35.classSkillsOf(id)),
        classIds,
      };
    }

    /** Each class's fields: its bonus spell ability, by the ability's name, and its caster type. */
    protected readClassFields(classIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
      const classBonusSpellAbilityMap = new Map<string, string>();
      const classCasterTypeMap = new Map<string, CasterType>();
      for (const classId of classIds) {
        const { bonusSpellAbilityId, casterType } = CLASS_FIELDS.read(
          rulesetData.find("classes", classId) ?? OwnerValues.NONE,
        );
        const abilityName = bonusSpellAbilityId ? abilityLookup.get(bonusSpellAbilityId) : undefined;
        if (abilityName) classBonusSpellAbilityMap.set(classId, abilityName);
        if (casterType) classCasterTypeMap.set(classId, casterType);
      }
      return { classBonusSpellAbilityMap, classCasterTypeMap };
    }

    /**
     * The D&D 3.5 reading of the view's values: the fields of each of the ruleset's skills, and the ruleset's Settings:
     * the skill-point ability, and the feats and ability increases its levels give (`LevelRules`).
     */
    protected readRulesetValues({ ruleset, rulesetData }: RulesetView, resolveId: (id: string) => string) {
      const skillFields = new Map(rulesetData.rows("skills").map((skill) => [skill.id, SKILL_FIELDS.read(skill)]));

      // Each setting is the nearest ruleset of the chain's that holds it: the fork's own once it saves one, its
      // source's until then
      const settings = RULESET_FIELDS.read(rulesetData.rulesetValuesOf(ruleset.id));
      const skillPointAbilityId = settings.skillPointAbilityId ? resolveId(settings.skillPointAbilityId) : null;
      return { levelRules: new LevelRules(settings), skillFields, skillPointAbilityId };
    }
  }

  return ReadingRuleset;
}
