import { type ImportSource, ImportsPart, type RulesetModule } from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * What the app makes of a character file another program saved, before a ruleset is picked: the file as it says it
 * (`source`: the program and its version, the file's format, its character's rules), the base rules whose rulesets
 * import it, and why none does (`refusal`).
 */
export interface ImportFileDescription {
  baseRules: BaseRules[];
  refusal?: string;
  source?: ImportSource;
}

/** The engine asked of imports across every base rules: what a file is, and which base rules' rulesets import it. */
export default class ImportsEngine {
  constructor(private readonly modules: [BaseRules, RulesetModule][]) {}

  /**
   * What a file (`text`) is, by each base rules' importers: the base rules whose importer recognizes it and can
   * import it, the file as the first that recognizes it says it, and why none can (the first refusal, or the programs
   * the app reads when none recognizes it).
   */
  describeFile(text: string): ImportFileDescription {
    const detections = this.modules.flatMap(([baseRules, module]) => {
      const detection = module.imports.detect(text);
      return detection ? [{ ...detection, baseRules }] : [];
    });
    const importing = detections.filter((detection) => !detection.refusal);
    const source = (importing[0] ?? detections[0])?.source;
    const described = { baseRules: importing.map((detection) => detection.baseRules), ...(source && { source }) };
    if (importing.length > 0) return described;
    const programs = new Set(this.modules.flatMap(([, module]) => module.imports.describeImporters().programs));
    const refusal = detections[0]?.refusal ?? ImportsPart.describeUnrecognized([...programs]);
    return { ...described, refusal };
  }
}
