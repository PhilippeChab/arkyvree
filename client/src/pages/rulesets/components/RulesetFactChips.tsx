import { Tooltip } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";

import { StatusChip, ValueChip } from "@/client/src/components/common/index.ts";
import { ExtensionIcon, ForkIcon, PrivateIcon, PublicIcon } from "@/client/src/components/icons/index.ts";
import { rulesetDetailQuery, type RulesetListItem } from "@/client/src/lib/queries.ts";

import { RULESET_STATUS } from "./rulesetStatus.ts";

interface RulesetFactChipsProps {
  ruleset: Pick<RulesetListItem, "kind" | "private" | "rulesetId" | "rulesetName" | "status">;
}

/**
 * A ruleset's facts, the same on its card and in its page's header: its status and its privacy (filled), an extension
 * and the ruleset it was forked from (outlined, the fork a link to it, which warms that ruleset's page as it's pointed
 * at or focused).
 */
export function RulesetFactChips({ ruleset }: RulesetFactChipsProps) {
  const queryClient = useQueryClient();
  const { icon: StatusIcon, color, tooltip } = RULESET_STATUS[ruleset.status];
  const parentId = ruleset.rulesetId;
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
      {parentId && ruleset.rulesetName && (
        <ValueChip
          icon={<ForkIcon />}
          label={`Forked from ${ruleset.rulesetName}`}
          color="info"
          to={`/rulesets/${parentId}`}
          onPrefetch={() => void queryClient.prefetchQuery(rulesetDetailQuery(parentId))}
        />
      )}
    </>
  );
}
