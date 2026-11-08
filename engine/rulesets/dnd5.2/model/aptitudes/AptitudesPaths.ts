import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd52Components } from "@/engine/rulesets/dnd5.2/model/CharacterComponents.ts";
import SpellLists from "@/engine/rulesets/dnd5.2/rules/SpellLists.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Aptitude } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd5.2/spells.ts";

/** The kinds whose modifiers give a pool room: a feat, a class level, a species and a background. */
const ALLOWED_ENTITY_TYPES = ["feats", "class-levels", "species", "backgrounds"];
const NAVIGATABLE_PATHS = [
  {
    path: "uses",
    description: "Uses per day (casts, charges, etc.)",
    type: "number" as const,
    allowedEntityTypes: ALLOWED_ENTITY_TYPES,
  },
  {
    path: "allowed",
    description: "Slots for known spells or feats",
    type: "number" as const,
    allowedEntityTypes: ALLOWED_ENTITY_TYPES,
  },
];
const POOL_SLOT_MODIFIERS: Pick<TargetPath, "operators" | "literalOnly" | "minValue"> = {
  operators: ["add"],
  literalOnly: true,
  minValue: 0,
};

/**
 * What a modifier on a pool's slots may do: grant more (`add` 0 or more: -1 is all known), or make a spell level's all
 * known (`set` -1). The level-up wizard and the class tables count these without a character, the sheet's way: other
 * operators, and templates, would count differently there than on the sheet. A pool's own uses per day count on the
 * sheet alone.
 */
const SPELL_LEVEL_SLOT_MODIFIERS: Record<
  string,
  Pick<TargetPath, "operators" | "setValues" | "literalOnly" | "minValue">
> = {
  allowed: {
    operators: ["add", "set"],
    setValues: [{ value: "-1", label: "All known" }],
    literalOnly: true,
    minValue: 0,
  },
  uses: { operators: ["add"], literalOnly: true, minValue: 0 },
};

/**
 * A spell list's spells joining the list of the class that gives it (`aptitudes.<list>.joinsclasslist`): a Life
 * Domain's spells join the cleric's list. A feat or a class level sets it, and the class is its own, or the one whose level gave
 * the feat.
 */
export const JOINS_CLASS_LIST = {
  path: "joinsclasslist",
  label: "Joins Class List",
  description: "Whether its spells join the class's list",
  allowedEntityTypes: ["feats", "class-levels"],
};

/**
 * A spell list's spellcasting ability (`aptitudes.<list>.ability`, an ability's name): what its spells are cast with
 * when the class they're picked at doesn't cast from the list, as Magic Initiate's pick of Intelligence, Wisdom or
 * Charisma sets it (a Sage fighter's Wizard spells). Empty until a modifier sets it: the class's own then.
 */
export const LIST_ABILITY = {
  path: "ability",
  label: "Spellcasting Ability",
  description: "The ability its spells are cast with, when no class of the character's casts from it",
};

/** The aptitudes' target paths: each aptitude's uses and slots. */
export default class AptitudesPaths implements PathCategory<Dnd52Components> {
  static generateAptitudePaths(
    aptitudes: Aptitude[],
    kind: OperatorKind,
    leveledAptitudeIds: Set<string>,
    abilityNames: readonly string[],
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const aptitude of aptitudes) {
      const normalizedAptitudeName = stripSeparators(aptitude.name);

      if (leveledAptitudeIds.has(aptitude.id)) {
        // Generate per-level paths for leveled aptitudes (0..MAX_SPELL_LEVEL)
        for (let level = 0; level <= MAX_SPELL_LEVEL; level++) {
          for (const subPath of NAVIGATABLE_PATHS) {
            paths.push({
              path: `aptitudes.${normalizedAptitudeName}.${level}.${subPath.path}`,
              category: "aptitudes",
              description: subPath.description,
              valueType: subPath.type,
              operators: getOperators(subPath.type, kind),
              ...("allowedEntityTypes" in subPath && { allowedEntityTypes: subPath.allowedEntityTypes }),
              ...(kind === "modifier" && SPELL_LEVEL_SLOT_MODIFIERS[subPath.path]),
            });
          }
        }
        paths.push({
          path: `aptitudes.${normalizedAptitudeName}.${JOINS_CLASS_LIST.path}`,
          category: "aptitudes",
          description: JOINS_CLASS_LIST.description,
          valueType: "boolean",
          operators: getOperators("boolean", kind),
          allowedEntityTypes: JOINS_CLASS_LIST.allowedEntityTypes,
        });
        paths.push({
          path: `aptitudes.${normalizedAptitudeName}.${LIST_ABILITY.path}`,
          category: "aptitudes",
          description: LIST_ABILITY.description,
          valueType: "string",
          operators: getOperators("string", kind),
          possibleValues: abilityNames.map((name) => ({ value: name, label: name })),
        });
      } else {
        // Generate flat paths for non-leveled aptitudes
        for (const subPath of NAVIGATABLE_PATHS) {
          paths.push({
            path: `aptitudes.${normalizedAptitudeName}.${subPath.path}`,
            category: "aptitudes",
            description: subPath.description,
            valueType: subPath.type,
            operators: getOperators(subPath.type, kind),
            ...("allowedEntityTypes" in subPath && { allowedEntityTypes: subPath.allowedEntityTypes }),
            ...(kind === "modifier" && subPath.path === "allowed" && POOL_SLOT_MODIFIERS),
          });
        }
      }
    }

    return paths;
  }

  /** Whether a target is an aptitude's (`aptitudes.…`). */
  static isAptitudeTarget(target: string): boolean {
    return target.startsWith("aptitudes.");
  }

  /** The start of a list's spell level's paths (`aptitudes.<list>.<level>.`): its uses and slots. */
  static spellLevelPrefix(list: string, level: number): string {
    return `aptitudes.${list}.${level}.`;
  }

  readonly component = { key: "aptitudes", getter: "getAptitudes" } as const;
  readonly description = "Uses and selection slots";
  readonly groupDescriptionTemplates = { aptitudes: "{name} uses and slots" };
  readonly label = "Aptitudes";
  readonly name = "aptitudes";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    const dnd52 = Dnd52View.of(rulesetData);
    return AptitudesPaths.generateAptitudePaths(
      dnd52.aptitudes,
      kind,
      SpellLists.of(rulesetData).leveledAptitudeIds,
      dnd52.abilities.map(({ name }) => name),
    );
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, {
      [JOINS_CLASS_LIST.path]: JOINS_CLASS_LIST.label,
      [LIST_ABILITY.path]: LIST_ABILITY.label,
    });
  }

  /** The ruleset's aptitudes, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Dnd52View.of(rulesetData).aptitudes.map(({ name }) => name)) };
  }
}
