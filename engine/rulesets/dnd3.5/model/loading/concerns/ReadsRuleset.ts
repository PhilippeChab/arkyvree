import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { CharacterRows, StoredCharacterLink } from "@/engine/core/module/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { CLASS_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { CasterType } from "@/vocabulary/dnd3.5/classes.ts";

/**
 * What a character's load reads of its ruleset's view: its rows, its fields and the 3.5 meaning of its stored values,
 * and the character's ability scores.
 */
export function ReadsRuleset<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class ReadingRuleset extends Base {
    /** A character ability's score (`link`, its `score` link), with its ability's name. */
    protected buildAbilityScore(link: StoredCharacterLink, abilityLookup: Map<string, string>) {
      return {
        abilityId: link.entityId,
        name: abilityLookup.get(link.entityId) ?? "Unknown",
        score: link.amount!,
      };
    }

    /**
     * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
     * their saves (their `baseBonus` links), and its classes and their skills (their `classSkill` links), once each.
     * languagesById is the view's (`RulesetData.byId`): stored pre-COW language ids auto-resolve on lookup.
     */
    protected readCachedRows(rows: CharacterRows, rulesetData: RulesetData, klassLevelIds: string[]) {
      const dnd35 = Dnd35View.of(rulesetData);
      const klassLevelsRaw = klassLevelIds.flatMap((id) => dnd35.klassLevelsById.get(id) ?? []);
      const klassEntityIds = [...new Set(klassLevelsRaw.map((level) => level.ownerId))];
      return {
        languages: rows.links.speaks.flatMap((link) => dnd35.languagesById.get(link.entityId) ?? []),
        klassLevelsRaw,
        klassLevelSaves: klassLevelIds.flatMap((id) => dnd35.baseBonusesOf(id)),
        klasses: klassEntityIds.flatMap((id) => dnd35.klassesById.get(id) ?? []),
        klassSkills: klassEntityIds.flatMap((id) => dnd35.classSkillsOf(id)),
        klassEntityIds,
      };
    }

    /** Each class's fields: its bonus spell ability, by the ability's name, and its caster type. */
    protected readClassFields(klassEntityIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
      const klassBonusSpellAbilityMap = new Map<string, string>();
      const klassCasterTypeMap = new Map<string, CasterType>();
      for (const klassId of klassEntityIds) {
        const { bonusSpellAbilityId, casterType } = CLASS_FIELDS.read(rulesetData.valuesOf(klassId));
        const abilityName = bonusSpellAbilityId ? abilityLookup.get(bonusSpellAbilityId) : undefined;
        if (abilityName) klassBonusSpellAbilityMap.set(klassId, abilityName);
        if (casterType) klassCasterTypeMap.set(klassId, casterType);
      }
      return { klassBonusSpellAbilityMap, klassCasterTypeMap };
    }

    /**
     * The D&D 3.5 reading of the view's stored values: the fields of each of the ruleset's skills, and the ruleset's
     * Settings: the skill-point ability, and the feats and ability increases its levels give (`LevelRules`).
     */
    protected readRulesetValues({ ruleset, rulesetData }: RulesetView, resolveId: (id: string) => string) {
      const skillFields = new Map(
        rulesetData.rows("skills").map((skill) => [skill.id, SKILL_FIELDS.read(rulesetData.valuesOf(skill.id))]),
      );

      // Each setting is the nearest ruleset of the chain's that holds it: the fork's own once it saves one, its
      // source's until then
      const settings = RULESET_FIELDS.read(rulesetData.rulesetValuesOf(ruleset.id));
      const skillPointAbilityId = settings.skillPointAbilityId ? resolveId(settings.skillPointAbilityId) : null;
      return { levelRules: new LevelRules(settings), skillFields, skillPointAbilityId };
    }
  }

  return ReadingRuleset;
}
