import { isRecord } from "@/shared/isRecord.ts";

/** The router state a character's page is opened with. */
export interface CharacterPageState {
  /** A new character arrives with the Add Level wizard open. */
  openLevelUp?: boolean;
}

/** Reads a character page's router state; anything else in it is ignored. */
export function characterPageState(state: unknown): CharacterPageState {
  if (!isRecord(state)) return {};
  return { ...(state.openLevelUp === true && { openLevelUp: true }) };
}
