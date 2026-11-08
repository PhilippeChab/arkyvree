import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Dnd5Components } from "@/engine/rulesets/dnd5/model/CharacterComponents.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Language } from "@/engine/rulesets/dnd5/view/rows.ts";
import { getOperators } from "@/shared/customization/operators.ts";
import {
  deriveNameLabels,
  deriveSegmentLabels,
  type OperatorKind,
  type TargetPath,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A language's paths, under its slug. */
const LANGUAGE_PATHS = [
  {
    path: "known",
    description: "Whether the character speaks this language",
    type: "boolean" as const,
  },
];

/** The picks' paths, beside the languages'. */
const PICK_PATHS = [
  {
    path: "extrapicks",
    description: "Extra languages to pick",
    type: "number" as const,
  },
];

/** The languages' target paths: whether the character speaks each of the ruleset's, and its extra picks. */
export default class LanguagesPaths implements PathCategory<Dnd5Components> {
  /** Each language's paths (`languages.<slug>.known`), and the extra picks' (`languages.extrapicks`). */
  static generateLanguagePaths(languages: Pick<Language, "name">[], kind: OperatorKind): TargetPath[] {
    const entries = [
      ...languages.flatMap(({ name }) =>
        LANGUAGE_PATHS.map((leaf) => ({ ...leaf, path: `languages.${stripSeparators(name)}.${leaf.path}` })),
      ),
      ...PICK_PATHS.map((leaf) => ({ ...leaf, path: `languages.${leaf.path}` })),
    ];
    return entries.map(({ path, description, type }) => ({
      path,
      category: "languages",
      description,
      valueType: type,
      operators: getOperators(type, kind),
    }));
  }

  /** The language whose knowledge a target names (`languages.<slug>.known`), or undefined for another target. */
  static parseKnown(target: string): string | undefined {
    const parts = target.split(".");
    return parts.length === 3 && parts[0] === "languages" && parts[2] === "known" ? parts[1] : undefined;
  }

  readonly component = { key: "languages", getter: "getLanguages" } as const;
  readonly description = "Languages spoken, and the extra ones to pick";
  /** A modifier setting a language known true grants it (`PossessesVirtually`) */
  readonly grants = { entity: "language", leaf: "known" };
  readonly groupDescriptionTemplates = { languages: "{name} language" };
  readonly label = "Languages";
  readonly name = "languages";

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return LanguagesPaths.generateLanguagePaths(Dnd5View.of(rulesetData).languages, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels([...LANGUAGE_PATHS, ...PICK_PATHS], { extrapicks: "Extra Picks" });
  }

  /** The ruleset's languages, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Dnd5View.of(rulesetData).languages.map(({ name }) => name)) };
  }
}
