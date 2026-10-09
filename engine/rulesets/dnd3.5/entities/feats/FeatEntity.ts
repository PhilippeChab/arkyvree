/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its save. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

/** A feat's save, as its form sends it: its name and description, and the pools it's picked in. */
interface FeatBody {
  aptitudeIds?: string[];
  description?: string | null;
  name: string;
}

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity {
  /** Refuses a feat linked to a pool the view's spells use: the ruleset's own and its chain's, no other ruleset's. */
  private static checkPools(view: RulesetView, aptitudeIds: string[]) {
    const { rulesetData } = view;
    if (aptitudeIds.some((id) => rulesetData.aptitudeIdsByHavingPowers.has(rulesetData.canonicalize(id))))
      throw new RulesError("conflict", "Cannot link feat to aptitude(s) already used for spells");
  }

  /**
   * A page of the ruleset's feats, as its form asks for it: what it's read with (`filters`: a pool's feats, a family's;
   * `groupFilters`: grouped by family), and its rows described (`describe`), each inherited feat with its pools as the
   * ruleset composes them, its siblings' links merged in, unless the page lists the ruleset's own feats only.
   */
  static openList(view: RulesetView, where: { aptitudeId?: string; childOnly?: boolean; family?: string }) {
    const { rulesetData } = view;
    const ids = where.aptitudeId === undefined ? undefined : rulesetData.listFeatIds(where.aptitudeId);
    const composesLinks = rulesetData.cow.sourceChain.length > 0 && !where.childOnly;
    return {
      describe<T extends { featsAptitudesInRules: unknown; id: string }>(rows: T[]) {
        if (!composesLinks) return rows;
        return rows.map((feat) => {
          const merged = rulesetData.featsById.get(feat.id);
          return merged ? { ...feat, featsAptitudesInRules: merged.featsAptitudesInRules } : feat;
        });
      },
      filters: { ids, ...(where.family && { family: { type: FEAT_FAMILY, value: where.family } }) },
      groupFilters: { familyType: FEAT_FAMILY, ids },
    };
  }

  /**
   * A new feat's row, from its form: refused without a pool, or with a pool a spell uses. One named as an ancestor its
   * ruleset deleted stands in for it, and is generated when the ancestor was (`tombstoneGenerated`).
   */
  static planCreate(view: RulesetView, body: FeatBody, reads: { tombstoneGenerated: boolean }) {
    if (!body.aptitudeIds || body.aptitudeIds.length === 0)
      throw new RulesError("invalid", "At least one aptitude must be selected for the feat");
    FeatEntity.checkPools(view, body.aptitudeIds);
    return {
      aptitudeIds: body.aptitudeIds,
      columns: { description: body.description, generated: reads.tombstoneGenerated, name: body.name },
    };
  }

  /**
   * A feat's edit (`featId`), from its form: the feat as the view has it, its new row, and its new pools when the form
   * sends them. Refused when a generated feat is renamed (its name names its option, `Weapon Focus: Longsword`, which
   * checks and generators find it by), or a pool a spell uses is linked.
   */
  static planEdit(view: RulesetView, featId: string, body: FeatBody) {
    const feat = view.rulesetData.find("feats", featId);
    if (!feat) throw new RulesError("not-found", "Feat not found in this ruleset");
    if (body.name !== feat.name && feat.generated) throw new RulesError("invalid", "Generated feats cannot be renamed");
    if (body.aptitudeIds?.length) FeatEntity.checkPools(view, body.aptitudeIds);
    return {
      aptitudeIds: body.aptitudeIds,
      columns: { description: body.description, name: body.name },
      feat,
    };
  }
}
