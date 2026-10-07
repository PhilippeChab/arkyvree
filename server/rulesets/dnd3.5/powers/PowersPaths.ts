import type { RulesetData } from "@/engine/core/view/index.ts";
import type { Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import { collectFeatListIds } from "@/server/rulesets/dnd3.5/spellcasting/spellLists.ts";
import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";
import { collectPropertySlugs } from "@/server/rulesets/engine/paths/propertySlugs.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { Aptitude, PowerWithAptitudes, Property } from "@/shared/relations.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";

const NAVIGATABLE_POWER_DC_PATHS = [
  { path: "dc.misc", description: "Other bonuses to spell DC", type: "number" as const },
  { path: "dc.total", description: "Final DC for this spell", type: "number" as const, requirementOnly: true },
];

/** The spells' target paths: each spell's DC, possession and properties. */
export default class PowersPaths implements PathCategory<Dnd35Components> {
  /**
   * The DC paths of these groupings (a school or descriptor: `powers.groups.<grouping>.*.dc.misc`, each of its spells)
   * or of these spells (`wildcard` false: `powers.<spell>.dc.*.misc`, each class's DC of it).
   */
  static generateGroupingPaths(
    powerGroupings: string[],
    kind: "modifier" | "requirement",
    wildcard: boolean = true,
    groupLabel?: string,
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of powerGroupings) {
      for (const subPath of NAVIGATABLE_POWER_DC_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        const prefix = groupLabel ? `${capitalize(grouping)} ${groupLabel}` : capitalize(grouping);
        const leaf = subPath.path.slice("dc.".length);
        paths.push({
          path: wildcard ? `powers.groups.${grouping}.*.dc.${leaf}` : `powers.${grouping}.dc.*.${leaf}`,
          category: "powers",
          description: `${kind === "requirement" ? "Any" : "All"} ${prefix} — ${subPath.description}`,
          ...(groupLabel && { groupDescription: `${capitalize(grouping)} ${groupLabel} spells` }),
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    return paths;
  }

  static generatePowerPaths(
    powers: (PowerWithAptitudes & { properties: Property[] })[],
    aptitudes: Aptitude[],
    featListIds: Set<string>,
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    // Property paths
    for (const power of powers) {
      const normalizedPowerName = stripSeparators(power.name);

      const propertyTypes = new Set(power.properties.map((p) => p.type));
      for (const type of propertyTypes) {
        paths.push({
          path: `powers.${normalizedPowerName}.properties.${type}`,
          category: "powers",
          description: `${power.name} ${formatPropertyType(type)} property`,
          valueType: "string",
          // A list of values: one of them is required or added, never the whole list as text
          operators: kind === "modifier" ? ["add", "subtract"] : ["contains", "not_contains"],
          readsMany: true,
        });
      }
    }

    // Spell known paths, but on the lists a feat brings (a domain's, a specialist's school): their spells come with it
    const aptitudeIdToSlug = new Map<string, string>();
    for (const apt of aptitudes) {
      if (featListIds.has(apt.id)) continue;
      aptitudeIdToSlug.set(apt.id, toSpellPossessionSlug(apt.name));
    }

    const seen = new Set<string>();
    for (const power of powers) {
      const spellSlug = stripSeparators(power.name);
      for (const pa of power.powersAptitudesInRules) {
        if (pa.level == null) continue;
        const aptSlug = aptitudeIdToSlug.get(pa.aptitudeId);
        if (!aptSlug) continue;

        const path = `powers.${spellSlug}.${aptSlug}.known`;
        if (seen.has(path)) continue;
        seen.add(path);

        paths.push({
          path,
          category: "powers",
          description: `Whether ${power.name} is known`,
          valueType: "boolean",
          operators: kind === "modifier" ? ["set"] : ["equal", "not_equal"],
        });
      }
    }

    return paths;
  }

  /** Whether a target is a spell's (`powers.…`): a spell's modifiers apply after the others. */
  static isPowerTarget(target: string): boolean {
    return target.startsWith("powers.");
  }

  /** The spell and list a target makes known (`powers.<spell>.<list>.known`), or undefined for another target. */
  static parseKnown(target: string): { list: string; spell: string } | undefined {
    const parts = target.split(".");
    return parts.length === 4 && parts[0] === "powers" && parts[3] === "known"
      ? { spell: parts[1], list: parts[2] }
      : undefined;
  }

  readonly component = { key: "powers", getter: "getPowers" } as const;

  readonly description = "Spell DC, possession, and properties";

  readonly groupDescriptionTemplates = { powers: "{name} spell DC and properties" };

  readonly label = "Spells";

  readonly name = "powers";

  /** Each spell a list has at a level, by its slug: its own DC paths. */
  private leveledPowerNames(powers: RulesetData["powers"]) {
    return [
      ...new Set(
        powers
          .filter((p) => p.powersAptitudesInRules.some((pa) => pa.level != null))
          .map((p) => stripSeparators(p.name)),
      ),
    ];
  }

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    const { powers, aptitudes, propertiesByEntityType } = rulesetData;
    const powerProperties = propertiesByEntityType.get("powers") ?? [];
    const powersWithProperties = powers.map((power) => ({
      ...power,
      properties: rulesetData.propertiesByEntity.get(power.id) ?? [],
    }));
    return [
      ...PowersPaths.generatePowerPaths(powersWithProperties, aptitudes, collectFeatListIds(rulesetData), kind),
      ...PowersPaths.generateGroupingPaths(collectPropertySlugs(powerProperties, SPELL_SCHOOL), kind, true, "school"),
      ...PowersPaths.generateGroupingPaths(
        collectPropertySlugs(powerProperties, SPELL_DESCRIPTOR),
        kind,
        true,
        "descriptor",
      ),
      ...PowersPaths.generateGroupingPaths(this.leveledPowerNames(powers), kind, false),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      properties: "Properties",
      known: "Known",
      ...deriveSegmentLabels(NAVIGATABLE_POWER_DC_PATHS, { dc: "DC", groups: "Groups" }),
      // D&D 3.5 surfaces power groupings as schools in the path picker.
      groups: "Schools",
    };
  }
}
