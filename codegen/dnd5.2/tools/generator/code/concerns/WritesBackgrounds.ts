import type { BaseCodeFile } from "@/codegen/dnd5.2/tools/generator/code/BaseCodeFile.ts";
import type { BackgroundSeed } from "@/content/dnd5.2/builders/backgrounds/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Writing a background. */
export function WritesBackgrounds<B extends Constructor<BaseCodeFile>>(Base: B) {
  abstract class WritingBackgrounds extends Base {
    /** A background written as code, a list's item: its name, its description, then its modifiers. */
    background(background: BackgroundSeed): string[] {
      return [
        `  {`,
        `    name: ${this.quote(background.name)},`,
        `    description: ${this.quote(background.description)},`,
        ...this.listField(
          "modifiers",
          background.modifiers.map((modifier) => this.plainModifier(modifier)),
          "    ",
        ),
        `  },`,
      ];
    }
  }
  return WritingBackgrounds;
}
