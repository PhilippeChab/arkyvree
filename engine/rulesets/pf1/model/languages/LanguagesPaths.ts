import type { PathCategory } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { type Pf1Components } from "@/engine/rulesets/pf1/model/CharacterComponents.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { Language } from "@/engine/rulesets/pf1/view/rows.ts";
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
    description: "Whether the character speaks this language, picked or granted: a modifier setting it true grants it",
    type: "boolean" as const,
  },
];

/** The picks' paths, beside the languages'. */
const PICK_PATHS = [
  {
    path: "extrapicks",
    description: "Languages to pick past Intelligence and Linguistics ranks (a loremaster's 4th level)",
    type: "number" as const,
  },
];

/** The languages' target paths: whether the character speaks each of the ruleset's, and its extra picks. */
export default class LanguagesPaths implements PathCategory<Pf1Components> {
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

  /** Its paths name a language by their second segment. */
  readonly names = { entityType: "languages", fixed: ["extrapicks"] } as const;

  generate(rulesetData: RulesetData, kind: OperatorKind): TargetPath[] {
    return LanguagesPaths.generateLanguagePaths(Pf1View.of(rulesetData).languages, kind);
  }

  getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels([...LANGUAGE_PATHS, ...PICK_PATHS], { extrapicks: "Extra Picks" });
  }

  /** The ruleset's languages, labeled by their names. */
  labelNames(rulesetData: RulesetData) {
    return { names: deriveNameLabels(Pf1View.of(rulesetData).languages.map(({ name }) => name)) };
  }
}
