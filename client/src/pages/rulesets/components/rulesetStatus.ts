import type { Tag } from "@/client/src/components/common/index.ts";
import {
  ArchiveIcon,
  DraftIcon,
  ExtensionIcon,
  ForkIcon,
  PrivateIcon,
  PublicIcon,
  PublishedIcon,
} from "@/client/src/components/icons/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

interface RulesetFacts {
  status: keyof typeof RULESET_STATUS;
  private: boolean;
  kind: RulesetKind;
  userId?: string | null;
  rulesetId?: string | null;
  rulesetName?: string | null;
}

/** A ruleset status's icon, color and explanation, for the list's pills and the page's chip. */
const RULESET_STATUS = {
  Draft: {
    icon: DraftIcon,
    color: "info",
    tooltip: "Fully editable — add, edit, and delete entities. Only visible to you until published.",
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

/**
 * A ruleset's facts as tags: its status, who sees it, and the extension or fork it is. `prefetchBase`, in its page's
 * header, makes the fork's tag a link to the ruleset it forks.
 */
export function rulesetTags(ruleset: RulesetFacts, prefetchBase?: () => void): Tag[] {
  const status = RULESET_STATUS[ruleset.status];
  const visibility: Tag = ruleset.private
    ? { icon: PrivateIcon, label: "Private", color: "warning", tooltip: "Private ruleset" }
    : { icon: PublicIcon, label: "Public", color: "success", tooltip: "Public ruleset" };
  const origin: Tag[] =
    ruleset.kind === "extension"
      ? [
          {
            icon: ExtensionIcon,
            label: "Extension",
            color: "secondary",
            tooltip: ruleset.userId ? "Extension" : "Official Extension",
          },
        ]
      : ruleset.rulesetId
        ? [
            {
              icon: ForkIcon,
              label: `Forked from ${ruleset.rulesetName}`,
              color: "info",
              ...(prefetchBase && { to: `/rulesets/${ruleset.rulesetId}`, prefetch: prefetchBase }),
            },
          ]
        : [];
  return [
    { icon: status.icon, label: ruleset.status, color: status.color, tooltip: status.tooltip },
    visibility,
    ...origin,
  ];
}
