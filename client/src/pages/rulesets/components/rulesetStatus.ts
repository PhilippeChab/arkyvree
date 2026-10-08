import { ArchiveIcon, DraftIcon, PublishedIcon } from "@/client/src/components/icons/index.ts";

/** A ruleset status's icon, color and explanation, for its chip on a card and in a page's header. */
export const RULESET_STATUS = {
  Draft: {
    icon: DraftIcon,
    color: "info",
    tooltip:
      "Fully editable — add, edit, and delete entities. Only you and its contributors see it until it's published.",
  },
  Published: {
    icon: PublishedIcon,
    color: "success",
    tooltip:
      "Available for others to use. You can still add, edit, and delete entities — characters that depend on a deletion will block it.",
  },
  Archived: {
    icon: ArchiveIcon,
    color: "default",
    tooltip: "Read-only. Can be un-archived later.",
  },
} as const;
