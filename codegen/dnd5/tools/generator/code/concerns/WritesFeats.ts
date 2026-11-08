import type { BaseCodeFile } from "@/codegen/dnd5/tools/generator/code/BaseCodeFile.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a feat: its name and text, its pools, its requirements, its modifiers and its fields. */
export function WritesFeats<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingFeats extends Base {
    /** A feat written as code, a list's item. */
    feat(feat: FeatSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(feat.name)},`,
        `    description: ${this.quote(feat.description)},`,
        `    aptitudes: [${feat.aptitudes.map((name) => this.quote(name)).join(", ")}],`,
        ...this.listField(
          "requirements",
          (feat.requirements ?? []).map((requirement) => this.requirement(requirement, 3)),
          "    ",
        ),
        ...this.listField(
          "modifiers",
          (feat.modifiers ?? []).map((modifier) => this.modifier(modifier)),
          "    ",
        ),
        ...(feat.fields ? [`    fields: ${this.seedFields(feat.fields)},`] : []),
        `  },`,
      ];
    }
  }
  return WritingFeats;
}
