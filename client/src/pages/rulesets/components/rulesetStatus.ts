import { ArchiveIcon, DraftIcon, PublishedIcon } from "@/client/src/components/icons/index.ts";

/**
 * A ruleset status's icon, color and explanation, for its chip on a card and in a page's header: true for whoever reads
 * it, its owner, an Admin or a player, whether the ruleset is public or private.
 */
export const RULESET_STATUS = {
  Draft: {
    icon: DraftIcon,
    color: "info",
    tooltip:
      "Fully editable: its entities can be added, edited, and deleted. Only its owner, its contributors, and the members of the campaigns that play it see it until it's published.",
  },
  Published: {
    icon: PublishedIcon,
    color: "success",
    tooltip:
      "Playable by anyone while it's public, and by its contributors and the members of its campaigns while it's private. Its entities can still be added, edited, and deleted — characters that depend on a deletion block it.",
  },
  Archived: {
    icon: ArchiveIcon,
    color: "default",
    tooltip: "Read-only. Its owner can unarchive it.",
  },
} as const;
