/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its form. */

import { ListedEntity } from "@/engine/core/entities/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type { FeatWithAptitudes } from "@/shared/relations.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

import { FEAT_FIELDS } from "./fields.ts";

/**
 * A feat's save, as its form sends it: its name and description, and the pools it's picked in. A new one named as an
 * ancestor its ruleset deleted stands in for it, and is generated when the ancestor was (`tombstoneGenerated`, what the
 * server reads of the ancestor, which the view hides).
 */
type FeatBody = { aptitudeIds?: string[]; description?: string | null; name: string; tombstoneGenerated?: boolean };

/** A slot a feat's modifier adds to (or sets on) a pool. */
export type PoolModifier = { aptitudeId: string; operator: string; value: number };

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity extends ListedEntity<
  "feats",
  FeatBody,
  { description?: string | null; generated?: boolean; name: string },
  typeof FEAT_FIELDS.fields
> {
  /** Its families, the weapon rules it changes, the schools it forbids. */
  protected readonly fields = FEAT_FIELDS;

  protected readonly label = "Feat";

  readonly type = "feats";

  /**
   * Refuses a new feat without a pool, renaming a generated feat (its name names its option, `Weapon Focus: Longsword`,
   * which checks and generators find it by), and a feat linked to a pool the view's spells use.
   */
  protected override checkForm(body: FeatBody, feat?: FeatWithAptitudes) {
    if (!feat && !body.aptitudeIds?.length)
      throw new RulesError("invalid", "At least one aptitude must be selected for the feat");
    if (feat && body.name !== feat.name && feat.generated)
      throw new RulesError("invalid", "Generated feats cannot be renamed");
    const message = "Cannot link feat to aptitude(s) already used for spells";
    this.refuseLists(body.aptitudeIds ?? [], this.rulesetData.aptitudeIdsWithPowers, message);
  }

  /** A form's columns: a new feat's mark of a generated one it stands in for. */
  protected columnsOf({ description, name, tombstoneGenerated }: FeatBody, feat?: FeatWithAptitudes) {
    return { description, name, ...(!feat && { generated: tombstoneGenerated ?? false }) };
  }

  /** A feat's pool links, as the view composes them. */
  protected linksIn({ featsAptitudesInRules }: FeatWithAptitudes) {
    return { featsAptitudesInRules };
  }

  /** The pools a form links the feat to (none: an edit's kept). */
  protected override linksOf({ aptitudeIds }: FeatBody) {
    return aptitudeIds?.map((aptitudeId) => ({ aptitudeId }));
  }

  /** The pools these feats' modifiers add slots to (`aptitudes.<slug>.allowed`), by feat id. */
  describePoolModifiers(featIds: string[]) {
    const { aptitudeIdBySlug, modifiersBySource } = this.rulesetData;
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
   * The families these feats (`featIds`) are grouped in, as a picker's list of variants shows them: each of a feat's
   * families its name starts with (`Weapon Focus: Longsword`'s Weapon Focus). A feat named for none stands alone.
   */
  groupByFamily(featIds: string[]) {
    return featIds.flatMap((featId) => {
      const feat = this.rulesetData.featsById.get(featId);
      if (!feat) return [];
      const { families } = this.fields.read(this.propertiesOf(feat));
      return families.filter((family) => feat.name.startsWith(family)).map((family) => ({ family, id: featId }));
    });
  }

  /**
   * A page of the ruleset's feats, as its form asks for it: what it's read with (`filters`: a pool's feats, a family's;
   * `groupFilters`: grouped by family), and its rows described, with their pools as the ruleset composes them.
   */
  override openList(where: { aptitudeId?: string; childOnly?: boolean; family?: string }) {
    const ids = where.aptitudeId === undefined ? undefined : this.rulesetData.listFeatIds(where.aptitudeId);
    return {
      describe: <T extends Record<string, unknown> & { id: string }>(rows: T[]) => this.describeListed(rows, where),
      filters: { ids, ...(where.family && { family: { type: FEAT_FAMILY, value: where.family } }) },
      groupFilters: { familyType: FEAT_FAMILY, ids },
    };
  }
}
