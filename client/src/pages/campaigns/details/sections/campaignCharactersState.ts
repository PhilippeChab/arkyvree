import { isRecord } from "@/shared/isRecord.ts";

/** The router state a campaign's Characters tab is opened with. */
export interface CampaignCharactersState {
  /** Its Party View was opened from the tab, whose entry Back returns to: closing it goes back there. */
  partyView?: boolean;
}

/** Reads a campaign's Characters tab's router state; anything else in it is ignored. */
export function campaignCharactersState(state: unknown): CampaignCharactersState {
  if (!isRecord(state)) return {};
  return { ...(state.partyView === true && { partyView: true }) };
}
