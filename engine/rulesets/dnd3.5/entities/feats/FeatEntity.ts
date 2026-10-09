/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its save. */

import { RulesetEntity } from "@/engine/core/entities/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

/** A feat's save, as its form sends it: its name and description, and the pools it's picked in. */
interface FeatBody {
  aptitudeIds?: string[];
  description?: string | null;
  name: string;
}

/** A slot a feat's modifier adds to (or sets on) a pool. */
export type PoolModifier = { aptitudeId: string; operator: string; value: number };

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity extends RulesetEntity<"feats"> {
  protected readonly label = "Feat";

  readonly type = "feats";

  /** Refuses a feat linked to a pool the view's spells use: the ruleset's own and its chain's, no other ruleset's. */
  private checkPools(aptitudeIds: string[]) {
    const { rulesetData } = this.view;
    if (aptitudeIds.some((id) => rulesetData.aptitudeIdsByHavingPowers.has(rulesetData.canonicalize(id))))
      throw new RulesError("conflict", "Cannot link feat to aptitude(s) already used for spells");
  }

  /** A feat with its modifiers, properties and requirements. */
  override describe(id: string) {
    return this.describeCustomized(id);
  }

  /** The pools these feats' modifiers add slots to (`aptitudes.<slug>.allowed`), by feat id. */
  describePoolModifiers(featIds: string[]) {
    const { aptitudeIdBySlug, modifiersBySource } = this.view.rulesetData;
    const byFeat = new Map<string, PoolModifier[]>();
    for (const featId of featIds) {
      for (const modifier of modifiersBySource.get(featId) ?? []) {
        if (modifier.sourceType !== "feats") continue;
        const pool = AptitudeTargets.parsePool(modifier.target);
        const aptitudeId = pool === undefined ? undefined : aptitudeIdBySlug.get(pool);
        const value = LiteralValue.parse(modifier.value, "number");
        if (!aptitudeId || typeof value !== "number") continue;
        const modifiers = byFeat.get(modifier.sourceId) ?? [];
        modifiers.push({ aptitudeId, value, operator: modifier.operator });
        byFeat.set(modifier.sourceId, modifiers);
      }
    }
    return byFeat;
  }

  /**
   * A page of the ruleset's feats, as its form asks for it: what it's read with (`filters`: a pool's feats, a family's;
   * `groupFilters`: grouped by family), and its rows described (`describe`), each inherited feat with its pools as the
   * ruleset composes them, its siblings' links merged in, unless the page lists the ruleset's own feats only.
   */
  openList(where: { aptitudeId?: string; childOnly?: boolean; family?: string }) {
    const { rulesetData } = this.view;
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
  planCreate(body: FeatBody, reads: { tombstoneGenerated: boolean }) {
    if (!body.aptitudeIds || body.aptitudeIds.length === 0)
      throw new RulesError("invalid", "At least one aptitude must be selected for the feat");
    this.checkPools(body.aptitudeIds);
    return {
      columns: { description: body.description, generated: reads.tombstoneGenerated, name: body.name },
      links: body.aptitudeIds.map((aptitudeId) => ({ aptitudeId })),
    };
  }

  /**
   * A feat's edit (`featId`), from its form: the feat as the view has it, its new row, and its new pools when the form
   * sends them. Refused when a generated feat is renamed (its name names its option, `Weapon Focus: Longsword`, which
   * checks and generators find it by), or a pool a spell uses is linked.
   */
  planEdit(featId: string, body: FeatBody) {
    const feat = this.find(featId);
    if (body.name !== feat.name && feat.generated) throw new RulesError("invalid", "Generated feats cannot be renamed");
    if (body.aptitudeIds?.length) this.checkPools(body.aptitudeIds);
    return {
      columns: { description: body.description, name: body.name },
      entity: feat,
      links: body.aptitudeIds?.map((aptitudeId) => ({ aptitudeId })),
    };
  }
}
