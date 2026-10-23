import type { SheetSummary } from "@/engine/core/module/index.ts";
import { formatClassLevel } from "@/shared/characterClasses.ts";

/** A 3.5 character's classes, as its sheet reads them: each its class, and its levels in it, in the order it took them. */
type SheetClasses = Record<
  string,
  { klass: { id: string; name: string }; levels: { characterLevel: { id: string }; klassLevel: { level: number } }[] }
>;

/** A 3.5 sheet's summary, its header's line: its classes, each at its level ("Fighter 3"), and its levels in each. */
export default class SheetSummaries {
  /**
   * The summary of a character's classes (`classes`, those it has levels in): each a track of the class's page, its
   * label its class at its level, its popover's words, and each of its levels, its edit's word naming its class.
   */
  static describe(classes: SheetClasses): SheetSummary {
    return {
      tracks: Object.values(classes).map(({ klass, levels }) => {
        const label = formatClassLevel(klass.name, levels.length);
        return {
          id: klass.id,
          entityType: "klasses",
          name: klass.name,
          label,
          words: { open: `${label} Levels`, levels: `${klass.name} Levels`, add: `Add ${klass.name} Level` },
          advancements: levels.map(({ characterLevel, klassLevel }) => ({
            id: characterLevel.id,
            label: `Level ${klassLevel.level}`,
            edit: `Edit ${klass.name} Level ${klassLevel.level}`,
          })),
        };
      }),
    };
  }
}
