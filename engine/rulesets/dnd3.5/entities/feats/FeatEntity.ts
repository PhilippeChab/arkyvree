/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its form. */

import { z } from "zod";

import type { EntityFieldValues, EntityForm } from "@/engine/core/fields/index.ts";
import type { EntityRecord } from "@/engine/core/module/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import ListedEntity from "@/engine/rulesets/dnd3.5/entities/ListedEntity.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Feat } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd3.5/fields/index.ts";

import { FEAT_COLUMNS } from "./columns.ts";
import { FEAT_FIELDS } from "./fields.ts";

/**
 * A feat's save, as its form sends it: its name and description, the pools it's picked in, and its fields (its
 * families, the weapon rules it changes).
 */
interface FeatBody {
  aptitudeIds?: string[];
  description?: string | null;
  fields?: EntityFieldValues;
  name: string;
}

/** A slot a feat's modifier adds to (or sets on) a pool. */
export interface PoolModifier {
  aptitudeId: string;
  operator: string;
  value: number;
}

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity extends ListedEntity<
  "feats",
  FeatBody,
  { description?: string | null; generated?: boolean; name: string },
  typeof FEAT_FIELDS.fields
> {
  /** Its feat pools. */
  protected override readonly columns = FEAT_COLUMNS;

  /** Its families, the weapon rules it changes, the schools it forbids. */
  protected override readonly fields = FEAT_FIELDS;

  /** Its groups' filters: a pool's families. */
  protected override readonly groupFilters = { aptitudeId: z.string().uuid() };

  protected override readonly label = "Feat";

  /** Its list's filters: a pool's feats, a family's. */
  protected override readonly listFilters = { aptitudeId: z.string().uuid(), family: z.string() };

  /** Whether a new feat is generated: its own flag. */
  protected override readonly storedAt = { generated: { field: FEAT_GENERATED } };

  /** A new feat standing in for a generated ancestor is generated. */
  override readonly takesAfterAncestor = true;

  override readonly type = "feats";

  /**
   * Refuses renaming a generated feat (its name names its option, `Weapon Focus: Longsword`,
   * which checks and generators find it by), and a feat linked to a pool the view's spells use.
   */
  protected override checkForm(body: FeatBody, feat?: Feat) {
    if (feat && body.name !== feat.name && feat.fields[FEAT_GENERATED])
      throw new RulesError("invalid", "Generated feats cannot be renamed");
    const message = "Cannot link feat to aptitude(s) already used for spells";
    this.refuseLists(body.aptitudeIds ?? [], this.dnd35.aptitudeIdsWithSpells, message);
  }

  /** A form's columns: a new feat's not generated (`planCreate` marks one that stands in for a generated one). */
  protected override columnsOf({ description, name }: FeatBody, feat?: Feat) {
    return { description, name, ...(!feat && { generated: false }) };
  }

  /** A page of the ruleset's feats' families, of a pool's feats when its query says (`aptitudeId`). */
  protected override groupsOf(where: { aptitudeId?: string }) {
    return {
      groupFilters: {
        groupField: FEAT_FAMILY,
        ids: this.poolFeatIds(where.aptitudeId),
      },
    };
  }

  /** The pools a form links the feat to (none: an edit's kept). */
  protected override linksOf({ aptitudeIds }: FeatBody) {
    return aptitudeIds && this.listedIn(aptitudeIds.map((toId) => ({ toId })));
  }

  /**
   * A page of the ruleset's feats, as its query asks for it: what it's read with (`filters`: a pool's feats, a
   * family's), and its records described, with their pools as the ruleset composes them.
   */
  protected override listOf(where: { aptitudeId?: string; family?: string }) {
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeListed(rows),
      filters: {
        ids: this.poolFeatIds(where.aptitudeId),
        ...(where.family && { fields: { [FEAT_FAMILY]: where.family } }),
      },
    };
  }

  /** A form's pools, the view's: refused when it names one twice (by its source's id and its copy's). */
  protected override resolveIds({ aptitudeIds }: FeatBody) {
    return aptitudeIds ? { aptitudeIds: this.ids.resolveAll("aptitudes", aptitudeIds) } : {};
  }

  /**
   * A new feat off its form. Named as an ancestor its ruleset deleted, it stands in for it, and is generated when the
   * ancestor was (`ancestor`: its stored record, which the server reads and the view hides, never the form's).
   */
  override planCreate(form: EntityForm, ancestor?: EntityRecord) {
    const plan = super.planCreate(form);
    const generated = ancestor?.fields[FEAT_GENERATED] === true;
    return { ...plan, row: { ...plan.row, fields: { ...plan.row.fields, [FEAT_GENERATED]: generated } } };
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /** A pool's feats' ids (`aptitudeId`), as the ruleset composes them: every feat's (`undefined`) without one. */
  private poolFeatIds(aptitudeId: string | undefined) {
    return aptitudeId === undefined ? undefined : this.dnd35.listFeatIds(aptitudeId);
  }

  /** The pools these feats' modifiers add slots to (`aptitudes.<slug>.allowed`), by feat id. */
  describePoolModifiers(featIds: string[]) {
    const { aptitudeIdBySlug } = this.dnd35;
    const { modifiersBySource } = this.rulesetData;
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
      const feat = this.dnd35.featsById.get(featId);
      if (!feat) return [];
      const { families } = this.fields.read(feat);
      return families.filter((family) => feat.name.startsWith(family)).map((family) => ({ group: family, id: featId }));
    });
  }
}
