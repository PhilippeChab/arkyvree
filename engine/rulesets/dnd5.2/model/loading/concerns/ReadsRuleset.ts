import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { CLASS_FIELDS } from "@/engine/rulesets/dnd5.2/entities/classes/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { MulticlassSlots } from "@/vocabulary/dnd5.2/classes.ts";

/** What a character's load reads of its ruleset's view: its rows, their fields and their 5th Edition meaning. */
export function ReadsRuleset<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class ReadingRuleset extends Base {
    /**
     * Ruleset-scoped rows read from the composed cache's pre-built Maps: the character's languages, class levels and
     * classes, once each. languagesById is the view's (`RulesetData.byId`): stored pre-COW language ids auto-resolve on
     * lookup.
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

    /**
     * Each class's fields: its spellcasting ability, by the ability's name, and how its levels count toward a
     * multiclass's spell slots.
     */
    protected readClassFields(classIds: string[], rulesetData: RulesetData, abilityLookup: Map<string, string>) {
      const classSpellcastingAbilityMap = new Map<string, string>();
      const classMulticlassSlotsMap = new Map<string, MulticlassSlots>();
      for (const classId of classIds) {
        const { spellcastingAbility, multiclassSlots } = CLASS_FIELDS.read(
          rulesetData.find("classes", classId) ?? OwnerValues.NONE,
        );
        const abilityName = spellcastingAbility ? abilityLookup.get(spellcastingAbility) : undefined;
        if (abilityName) classSpellcastingAbilityMap.set(classId, abilityName);
        if (multiclassSlots) classMulticlassSlotsMap.set(classId, multiclassSlots);
      }
      return { classSpellcastingAbilityMap, classMulticlassSlotsMap };
    }
  }

  return ReadingRuleset;
}
