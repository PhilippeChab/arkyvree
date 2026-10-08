import { Tooltip } from "@mui/material";

import { StatusChip, ValueChip } from "@/client/src/components/common/index.ts";
import { ExtensionIcon, ForkIcon, PrivateIcon, PublicIcon } from "@/client/src/components/icons/index.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";

import { RULESET_STATUS } from "./rulesetStatus.ts";

interface RulesetFactChipsProps {
  /** Warms the page of the ruleset it was forked from, as its chip is pointed at or focused. */
  onPrefetchParent?: () => void;
  ruleset: Pick<RulesetListItem, "kind" | "private" | "rulesetId" | "rulesetName" | "status">;
}

/**
 * A ruleset's facts, the same on its card and in its page's header: its status and its privacy (filled), an extension
 * and the ruleset it was forked from (outlined, the fork a link to it).
 */
export function RulesetFactChips({ onPrefetchParent, ruleset }: RulesetFactChipsProps) {
  const { icon: StatusIcon, color, tooltip } = RULESET_STATUS[ruleset.status];
  return (
    <>
      <Tooltip describeChild title={tooltip}>
        <StatusChip icon={<StatusIcon />} label={ruleset.status} color={color} />
      </Tooltip>
      <StatusChip
        icon={ruleset.private ? <PrivateIcon /> : <PublicIcon />}
        label={ruleset.private ? "Private" : "Public"}
        color={ruleset.private ? "warning" : "success"}
      />
      {ruleset.kind === "extension" && <ValueChip icon={<ExtensionIcon />} label="Extension" color="secondary" />}
      {ruleset.rulesetId && ruleset.rulesetName && (
        <ValueChip
          icon={<ForkIcon />}
          label={`Forked from ${ruleset.rulesetName}`}
          color="info"
          to={`/rulesets/${ruleset.rulesetId}`}
          onPrefetch={onPrefetchParent}
        />
      )}
    </>
  );
}
