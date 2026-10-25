import type { SheetSummary } from "@/engine/core/module/index.ts";
import ClassLevels from "@/engine/rulesets/dnd3.5/characters/ClassLevels.ts";

/** A 3.5 character's classes, as its sheet reads them: each its class, and its levels in it, in the order it took them. */
type SheetClasses = Record<
  string,
  {
    klass: { id: string; name: string };
    levels: { characterLevel: { id: string }; klassLevel: { position: number } }[];
  }
>;

/**
 * A 3.5 sheet's summary, its header's line: its classes, each at its level ("Fighter 3"), and its levels in each; and
 * the words of its page's level actions.
 */
export default class SheetSummaries {
  /**
   * The summary of a character's classes (`classes`, those it has levels in): each a track of the class's page, its
   * label its class at its level, its popover's words, and each of its levels, its edit's word naming its class. A
   * partly seen character's has none (`{}`).
   */
  static describe(classes: SheetClasses): SheetSummary {
    return {
      separator: ClassLevels.SEPARATOR,
      words: {
        add: "Add Level",
        removeLast: "Remove Last Level",
        removeLastMessage: "Are you sure you want to remove the last level? This action cannot be undone.",
        deleteMessage:
          "Are you sure you want to permanently delete this character? Its levels, abilities, inventory, attachments " +
          "and customizations go with it. This action cannot be undone.",
        removed: "Level removed",
        removeFailed: "Failed to remove level",
      },
      tracks: Object.values(classes).map(({ klass, levels }) => {
        const label = ClassLevels.format(klass.name, levels.length);
        return {
          id: klass.id,
          entityType: "classes",
          name: klass.name,
          label,
          words: { open: `${label} Levels`, levels: `${klass.name} Levels`, add: `Add ${klass.name} Level` },
          advancements: levels.map(({ characterLevel, klassLevel }) => ({
            id: characterLevel.id,
            label: `Level ${klassLevel.position}`,
            edit: `Edit ${klass.name} Level ${klassLevel.position}`,
          })),
        };
      }),
    };
  }
}
