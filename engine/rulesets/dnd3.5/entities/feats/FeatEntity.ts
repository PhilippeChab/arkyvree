/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its form. */

import { z } from "zod";

import type { FormBody } from "@/engine/core/entities/index.ts";
import type { EntityForm } from "@/engine/core/fields/index.ts";
import type { EntityRecord } from "@/engine/core/module/index.ts";
import ListedEntity from "@/engine/rulesets/dnd3.5/entities/ListedEntity.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { FEAT_FAMILY, FEAT_GENERATED } from "@/vocabulary/dnd3.5/fields/index.ts";

import { FEAT_FIELDS } from "./fields.ts";

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity extends ListedEntity<"feats", typeof FEAT_FIELDS.fields> {
  /** Its families: its family field, its groups a pool's families (the pool its `listedIn` links name). */
  protected static override readonly families = { field: FEAT_FAMILY, groupFilters: { listedIn: z.string().uuid() } };

  /**
   * A generated feat keeps its name, which names its option (`Weapon Focus: Longsword`) and which checks and generators
   * find it by.
   */
  protected static override readonly lockedName = { field: FEAT_GENERATED, reason: "A generated feat keeps its name" };

  /** Its feat pools, its flags, its families, the weapon rules it changes, the schools it forbids. */
  protected override readonly fields = FEAT_FIELDS;

  /** A new feat standing in for a generated ancestor is generated. */
  override readonly takesAfterAncestor = true;

  override readonly type = "feats";

  /** Refuses a feat linked to a pool the view's spells use. */
  protected override checkForm(body: FormBody) {
    const message = "Cannot link feat to aptitude(s) already used for spells";
    const listIds = (this.listsOf(body) ?? []).map((list) => list.toId);
    this.refuseLists(listIds, this.dnd35.aptitudeIdsWithSpells, message);
  }

  /** A page of the ruleset's feats' families, of a pool's feats when its query says (`listedIn`). */
  protected override groupsOf(where: { listedIn?: string }) {
    return {
      groupFilters: {
        groupField: FEAT_FAMILY,
        ids: this.poolFeatIds(where.listedIn),
      },
    };
  }

  /**
   * A page of the ruleset's feats, as its query asks for it: what it's read with (`filters`: a pool's feats, a
   * family's), and its records described, with their pools as the ruleset composes them.
   */
  protected override listOf(where: Record<string, unknown> & { listedIn?: string }) {
    const family = where[FEAT_FAMILY] as string | undefined;
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) => this.describeListed(rows),
      filters: {
        ids: this.poolFeatIds(where.listedIn),
        ...(family && { fields: { [FEAT_FAMILY]: family } }),
      },
    };
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
