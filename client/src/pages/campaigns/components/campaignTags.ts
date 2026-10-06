import type { Tag } from "@/client/src/components/common/index.ts";
import { PlayersIcon, RulesetsIcon } from "@/client/src/components/icons/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";

interface CampaignFacts {
  currentPlayers: number;
  rulesetName: string;
}

/** A campaign's facts as tags: its players, its ruleset. */
export function campaignTags({ currentPlayers, rulesetName }: CampaignFacts): Tag[] {
  const players = formatCount(currentPlayers, "player");
  return [
    { icon: PlayersIcon, label: players, color: "info", tooltip: `${players} in this campaign` },
    { icon: RulesetsIcon, label: rulesetName, color: "secondary", tooltip: rulesetName },
  ];
}
