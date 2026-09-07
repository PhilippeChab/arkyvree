import { db } from "@/server/database/index.ts";
import { Campaigns, Characters, Rulesets } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import type { Session } from "@/shared/relations.ts";

export const DashboardMethods = {
  async getMyStats(session: Session) {
    const totalRulesets = await Rulesets.count(db, { userId: session.userId });
    const totalCharacters = await Characters.count(db, { userId: session.userId });
    const totalCampaigns = await Campaigns.count(db, { userId: session.userId });

    return {
      totalCharacters,
      totalCampaigns,
      totalRulesets,
    };
  },
} as const;

class DashboardService extends BaseService<typeof DashboardMethods> {
  static initialize() {
    return new DashboardService(DashboardMethods);
  }
}

export default DashboardService;
