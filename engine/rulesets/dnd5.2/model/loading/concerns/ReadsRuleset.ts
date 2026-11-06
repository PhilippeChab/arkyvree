import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_FIELDS } from "@/engine/rulesets/dnd5.2/entities/classes/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { CasterType } from "@/vocabulary/dnd5.2/classes.ts";

/** What a character's load reads of its ruleset's view: its rows, their fields and their Pathfinder meaning. */
export function ReadsRuleset<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class ReadingRuleset extends Base {
    /**
     * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
     * their saves (their `baseBonus` links), and its classes and their skills (their `classSkill` links), once each.
     * languagesById is the view's (`RulesetData.byId`): stored pre-COW language ids auto-resolve on lookup.
     */
    protected readCachedRows(rows: CharacterRows, rulesetData: RulesetData, classLevelIds: string[]) {
      const dnd52 = Dnd52View.of(rulesetData);
      const classLevelsRaw = classLevelIds.flatMap((id) => dnd52.classLevelsById.get(id) ?? []);
      const classIds = [...new Set(classLevelsRaw.map((level) => level.ownerId))];
      return {
        languages: rows.links.speaks.flatMap((link) => dnd52.languagesById.get(link.entityId) ?? []),
        classLevelsRaw,
        classes: classIds.flatMap((id) => dnd52.classesById.get(id) ?? []),
        classIds,
      };
    }

    /** Each class's fields: its bonus spell ability, by the ability's name, and its caster type. */
    protected readClassFields(classIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
      const classSpellcastingAbilityMap = new Map<string, string>();
      const classCasterTypeMap = new Map<string, CasterType>();
      for (const classId of classIds) {
        const { spellcastingAbility, casterType } = CLASS_FIELDS.read(
          rulesetData.find("classes", classId) ?? OwnerValues.NONE,
        );
        const abilityName = spellcastingAbility ? abilityLookup.get(spellcastingAbility) : undefined;
        if (abilityName) classSpellcastingAbilityMap.set(classId, abilityName);
        if (casterType) classCasterTypeMap.set(classId, casterType);
      }
      return { classSpellcastingAbilityMap, classCasterTypeMap };
    }

  }

  return ReadingRuleset;
}
