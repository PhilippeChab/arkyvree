import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellLists.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { deriveNameLabels, deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";
import type { Aptitude } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

const ALLOWED_ENTITY_TYPES = ["feats", "klass_levels", "races"];
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
 * A spell list's spells joining the list of the class that gives it (`aptitudes.<list>.joinsclasslist`): a cleric's
 * domain joins the cleric's list. A feat or a class level sets it, and the class is its own, or the one whose level gave
 * the feat.
 */
export const JOINS_CLASS_LIST = {
  path: "joinsclasslist",
  label: "Joins Class List",
  description: "Whether its spells join the list of the class whose level gave it",
  allowedEntityTypes: ["feats", "klass_levels"],
};

/** The aptitudes' target paths: each aptitude's uses and slots. */
export default class AptitudesPaths implements PathCategory<Dnd35Components> {
  static generateAptitudePaths(
    aptitudes: Aptitude[],
    kind: "modifier" | "requirement",
    leveledAptitudeIds: Set<string>,
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

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return AptitudesPaths.generateAptitudePaths(
      rulesetData.aptitudes,
      kind,
      SpellLists.of(rulesetData).leveledAptitudeIds,
    );
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, { [JOINS_CLASS_LIST.path]: JOINS_CLASS_LIST.label });
  }

  /** The ruleset's aptitudes, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(rulesetData.aptitudes.map(({ name }) => name)) };
  }
}
