import { db } from "@/server/database/index.ts";
import { Campaigns, Characters, Rulesets } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

class DashboardService {
  /** Each card's count: the total of the list it links to, as that list opens. */
  async getStats(session: Session) {
    const totalRulesets = await Rulesets.count(db, session);
    const totalCharacters = await Characters.count(db, { userId: session.userId });
    const totalCampaigns = await Campaigns.count(db, { userId: session.userId });

    return {
      totalCharacters,
      totalCampaigns,
      totalRulesets,
    };
  }
}

export default new DashboardService();
