import CategoryPaths from "@/engine/core/paths/CategoryPaths.ts";
import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd35Components } from "@/engine/rulesets/dnd3.5/model/CharacterComponents.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { SpellWithAptitudes } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { deriveNameLabels, deriveSegmentLabels, isLeafOfKind, type TargetPath } from "@/shared/customization/target.ts";
import type { Property } from "@/shared/relations.ts";
import { capitalize, stripSeparators } from "@/shared/text.ts";
import { SPELL_DESCRIPTOR, SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

const NAVIGATABLE_SPELL_DC_PATHS = [
  { path: "dc.misc", description: "Other bonuses to spell DC", type: "number" as const },
  { path: "dc.total", description: "Final DC for this spell", type: "number" as const, requirementOnly: true },
];

/** The spells' target paths: each spell's DC, possession and properties. */
export default class SpellsPaths implements PathCategory<Dnd35Components> {
  /**
   * The DC paths of these groupings (a school or descriptor: `spells.groups.<grouping>.*.dc.misc`, each of its spells)
   * or of these spells (`wildcard` false: `spells.<spell>.dc.*.misc`, each class's DC of it).
   */
  static generateGroupingPaths(
    spellGroupings: string[],
    kind: "modifier" | "requirement",
    wildcard: boolean = true,
    groupLabel?: string,
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of spellGroupings) {
      for (const subPath of NAVIGATABLE_SPELL_DC_PATHS) {
        if (!isLeafOfKind(subPath, kind)) continue;
        const prefix = groupLabel ? `${capitalize(grouping)} ${groupLabel}` : capitalize(grouping);
        const leaf = subPath.path.slice("dc.".length);
        paths.push({
          path: wildcard ? `spells.groups.${grouping}.*.dc.${leaf}` : `spells.${grouping}.dc.*.${leaf}`,
          category: "spells",
          description: `${kind === "requirement" ? "Any" : "All"} ${prefix} — ${subPath.description}`,
          ...(groupLabel && { groupDescription: `${capitalize(grouping)} ${groupLabel} spells` }),
          valueType: subPath.type,
          operators: getOperators(subPath.type, kind),
        });
      }
    }

    return paths;
  }

  static generateSpellPaths(
    spells: (SpellWithAptitudes & { properties: Property[] })[],
    spellSlugByAptitudeId: Map<string, string>,
    featListIds: Set<string>,
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    // Property paths
    for (const spell of spells) {
      const normalizedSpellName = stripSeparators(spell.name);

      const propertyTypes = new Set(spell.properties.map((p) => p.type));
      for (const type of propertyTypes) {
        paths.push({
          path: `spells.${normalizedSpellName}.properties.${type}`,
          category: "spells",
          description: `${spell.name} ${formatPropertyType(type)} property`,
          valueType: "string",
          // A list of values: one of them is required or added, never the whole list as text
          operators: kind === "modifier" ? ["add", "subtract"] : ["contains", "not_contains"],
          readsMany: true,
        });
      }
    }

    // Spell known paths, but on the lists a feat brings (a domain's, a specialist's school): their spells come with it
    const aptitudeIdToSlug = new Map([...spellSlugByAptitudeId].filter(([aptitudeId]) => !featListIds.has(aptitudeId)));

    const seen = new Set<string>();
    for (const spell of spells) {
      const spellSlug = stripSeparators(spell.name);
      for (const pa of spell.spellsAptitudesInRules) {
        if (pa.level == null) continue;
        const aptSlug = aptitudeIdToSlug.get(pa.aptitudeId);
        if (!aptSlug) continue;

        const path = `spells.${spellSlug}.${aptSlug}.known`;
        if (seen.has(path)) continue;
        seen.add(path);

        paths.push({
          path,
          category: "spells",
          description: `Whether ${spell.name} is known`,
          valueType: "boolean",
          operators: getOperators("boolean", kind),
        });
      }
    }

    return paths;
  }

  /** A grouping's spells' DC bonus (`spells.groups.<slug>.*.dc.misc`, each of its spells), by the grouping's name. */
  static groupDcMisc(groupingName: string): string {
    return `spells.groups.${stripSeparators(groupingName)}.*.dc.misc`;
  }

  /** Whether a target is a spell's (`spells.…`): a spell's modifiers apply after the others. */
  static isSpellTarget(target: string): boolean {
    return target.startsWith("spells.");
  }

  /** The spell and list a target makes known (`spells.<spell>.<list>.known`), or undefined for another target. */
  static parseKnown(target: string): { list: string; spell: string } | undefined {
    const parts = target.split(".");
    return parts.length === 4 && parts[0] === "spells" && parts[3] === "known"
      ? { spell: parts[1], list: parts[2] }
      : undefined;
  }

  readonly component = { key: "spells", getter: "getSpells" } as const;

  readonly description = "Spell DC, possession, and properties";

  /** A modifier setting a spell known on a list true grants it there (`PossessesVirtually`) */
  readonly grants = { entity: "spell", leaf: "known" };

  readonly groupDescriptionTemplates = { spells: "{name} spell DC and properties" };

  readonly label = "Spells";

  readonly name = "spells";

  /** Each spell a list has at a level, by its slug: its own DC paths. */
  private leveledSpellNames(spells: Dnd35View["spells"]) {
    return [
      ...new Set(
        spells
          .filter((p) => p.spellsAptitudesInRules.some((pa) => pa.level != null))
          .map((p) => stripSeparators(p.name)),
      ),
    ];
  }

  generate(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[] {
    const { spells } = Dnd35View.of(rulesetData);
    const { propertiesByEntityType } = rulesetData;
    const spellLists = SpellLists.of(rulesetData);
    const spellProperties = propertiesByEntityType.get("spells") ?? [];
    const spellsWithProperties = spells.map((spell) => ({
      ...spell,
      properties: rulesetData.propertiesByEntity.get(spell.id) ?? [],
    }));
    return [
      ...SpellsPaths.generateSpellPaths(
        spellsWithProperties,
        spellLists.spellSlugByAptitudeId,
        spellLists.featListIds,
        kind,
      ),
      ...SpellsPaths.generateGroupingPaths(
        CategoryPaths.collectPropertySlugs(spellProperties, SPELL_SCHOOL),
        kind,
        true,
        "school",
      ),
      ...SpellsPaths.generateGroupingPaths(
        CategoryPaths.collectPropertySlugs(spellProperties, SPELL_DESCRIPTOR),
        kind,
        true,
        "descriptor",
      ),
      ...SpellsPaths.generateGroupingPaths(this.leveledSpellNames(spells), kind, false),
    ];
  }

  getSegmentLabels(): Record<string, string> {
    return {
      properties: "Properties",
      known: "Known",
      // D&D 3.5 surfaces spell groupings as schools in the path picker
      ...deriveSegmentLabels(NAVIGATABLE_SPELL_DC_PATHS, { dc: "DC", groups: "Schools" }),
    };
  }
  /**
   * The ruleset's spells, labeled by their names; and, where no other label names them, each list's possession slug
   * ("wizard" for Wizard Spells, which a spell's `known` path names), its spells' properties' types and values (a
   * number names a spell level, never a value).
   */
  labelNames(rulesetData: RulesetData) {
    const dnd35 = Dnd35View.of(rulesetData);
    const fallbacks: Record<string, string> = {};
    for (const { name } of dnd35.aptitudes)
      fallbacks[SpellLists.toSpellPossessionSlug(name)] ??= name.replace(/ Spells$/, "");
    for (const { type, value } of rulesetData.propertiesByEntityType.get("spells") ?? []) {
      fallbacks[type] ??= formatPropertyType(type);
      const slug = stripSeparators(value);
      if (/[a-z]/.test(slug)) fallbacks[slug] ??= value;
    }
    return { fallbacks, names: deriveNameLabels(dnd35.spells.map(({ name }) => name)) };
  }
}
