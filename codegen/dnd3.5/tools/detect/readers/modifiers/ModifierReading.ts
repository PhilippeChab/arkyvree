import TargetPaths from "@/codegen/dnd3.5/tools/detect/readers/TargetPaths.ts";
import type { ModifierEffect, ModifierSeed } from "@/content/dnd3.5/builders/customization/types.ts";

/**
 * A text read for the modifiers it gives: the modifiers (a feat's `ModifierSeed`, a race's, a domain's or an item's
 * `Modifier`), the bonuses it names that no modifier can hold (`unresolved`), and the paths no character has
 * (`errors`), whose modifiers are left out.
 */
export class ModifierReading<M extends ModifierEffect = ModifierSeed> {
  readonly errors: string[] = [];
  readonly modifiers: M[] = [];
  readonly unresolved: string[] = [];

  /** Leaves out the modifiers read whose path isn't valid, each in `errors`. */
  protected keepValidModifiers() {
    const read = this.modifiers.splice(0);
    for (const modifier of read) {
      if (TargetPaths.isModifierPath(modifier.target)) this.modifiers.push(modifier);
      else this.errors.push(`Invalid modifier path "${modifier.target}": ${modifier.operator} ${modifier.value}`);
    }
  }
}
