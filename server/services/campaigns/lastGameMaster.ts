/**
 * Whether a seat is its campaign's last Game Master, whom the campaign keeps: its policy neither removes nor demotes
 * them (`CampaignsPolicy.canRemovePlayer`, `canUpdatePlayer`), and the players list and the campaign's `canLeave` ask
 * it as the writes do.
 */

import type { Db } from "@/drizzle/database.ts";
import { Players } from "@/server/repositories/index.ts";
import type { Player } from "@/shared/relations.ts";

/**
 * Whether `player` is its campaign's last seated Game Master (`masters`, the campaign's count of them), whom the
 * server neither removes nor demotes: an empty slot, which runs nothing, never is, nor an archived seat (its user's
 * account deleted).
 */
export function isLastGameMaster(player: Pick<Player, "deletedAt" | "role" | "userId">, masters: number) {
  return player.role === "Game Master" && !!player.userId && !player.deletedAt && masters <= 1;
}

/** How many Game Masters the campaign `campaignId` seats, which `isLastGameMaster` reads. */
export async function countGameMasters(db: Db, campaignId: string) {
  return await Players.count(db, { campaignId, role: "Game Master" });
}

/** Whether `player` is its campaign's last seated Game Master, which its policy keeps from being removed or demoted. */
export async function isLastGameMasterOf(db: Db, player: Player) {
  if (player.role !== "Game Master") return false;
  return isLastGameMaster(player, await countGameMasters(db, player.campaignId));
}
