import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import { Dnd35LevelsHooks } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsHooks.ts";
import { collectClassListIds } from "@/server/rulesets/dnd3.5/spellcasting/spellLists.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
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
  /** Whether a target is an aptitude's (`aptitudes.…`). */
  static isAptitudeTarget(target: string): boolean {
    return target.startsWith("aptitudes.");
  }

  /** The start of a list's spell level's paths (`aptitudes.<list>.<level>.`): its uses and slots. */
  static spellLevelPrefix(list: string, level: number): string {
    return `aptitudes.${list}.${level}.`;
  }

  static generateTargetPaths(
    aptitudes: Aptitude[],
    kind: "modifier" | "requirement",
    leveledAptitudeIds: Set<string>,
    maxSpellLevel: number,
  ): TargetPath[] {
    const paths: TargetPath[] = [];
    const operators = getNumericOperators(kind);

    for (const aptitude of aptitudes) {
      const normalizedAptitudeName = stripSeparators(aptitude.name);

      if (leveledAptitudeIds.has(aptitude.id)) {
        // Generate per-level paths for leveled aptitudes (0..maxSpellLevel)
        for (let level = 0; level <= maxSpellLevel; level++) {
          for (const subPath of NAVIGATABLE_PATHS) {
            paths.push({
              path: `aptitudes.${normalizedAptitudeName}.${level}.${subPath.path}`,
              category: "aptitudes",
              description: subPath.description,
              valueType: subPath.type,
              operators,
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
          operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
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
            operators,
            ...("allowedEntityTypes" in subPath && { allowedEntityTypes: subPath.allowedEntityTypes }),
            ...(kind === "modifier" && subPath.path === "allowed" && POOL_SLOT_MODIFIERS),
          });
        }
      }
    }

    return paths;
  }

  readonly name = "aptitudes";
  readonly label = "Aptitudes";
  readonly description = "Uses and selection slots";
  readonly component = { key: "aptitudes", getter: "getAptitudes" } as const;
  readonly groupDescriptionTemplates = { aptitudes: "{name} uses and slots" };

  /** The leveled aptitudes: those with spells at a level, and those a class gives slots in before they have any. */
  private leveledAptitudeIds(rulesetData: RulesetData) {
    const leveledAptitudeIds = collectClassListIds(rulesetData);
    for (const power of rulesetData.powers) {
      for (const pa of power.powersAptitudesInRules) {
        if (pa.level != null) leveledAptitudeIds.add(pa.aptitudeId);
      }
    }
    return leveledAptitudeIds;
  }

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    return AptitudesPaths.generateTargetPaths(
      rulesetData.aptitudes,
      kind,
      this.leveledAptitudeIds(rulesetData),
      Dnd35LevelsHooks.MAX_SPELL_LEVEL,
    );
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_PATHS, { [JOINS_CLASS_LIST.path]: JOINS_CLASS_LIST.label });
  }
}
