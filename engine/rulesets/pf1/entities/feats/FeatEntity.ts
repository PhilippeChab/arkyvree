/** A feat as a ruleset's entity: what the ruleset describes of it, lists it by, and checks of its form. */

import { z } from "zod";

import type { FormBody } from "@/engine/core/entities/index.ts";
import type { EntityForm, PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import ListedEntity from "@/engine/rulesets/pf1/entities/ListedEntity.ts";
import ClassOffers from "@/engine/rulesets/pf1/rules/ClassOffers.ts";
import FeatRules from "@/engine/rulesets/pf1/rules/FeatRules.ts";
import FeatureStacking from "@/engine/rulesets/pf1/rules/FeatureStacking.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { Feat } from "@/engine/rulesets/pf1/view/rows.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_STACKABLE } from "@/vocabulary/pf1/fields/index.ts";

import { FEAT_FIELDS } from "./fields.ts";

/** A feat as the ruleset has it: described with its customizations, listed by pool or family, saved by its rules. */
export default class FeatEntity extends ListedEntity<"feats", typeof FEAT_FIELDS.fields> {
  /**
   * Its families: its family field, its groups a pool's feats grouped under the families they're variants of (the pool
   * its `listedIn` links name).
   */
  protected static override readonly families = { field: FEAT_FAMILY, groupFilters: { listedIn: z.string().uuid() } };

  /**
   * Its list's filters past its pool: the feats a class's levels may grant as its features (`grantableBy`: the class's
   * id, `ClassOffers.describeFeatures`), which its Progression tab's Add Class Feature offers, the class's own first,
   * each with the pools the class grants it through (`grantedThrough`).
   */
  protected static override readonly listFilters = { grantableBy: z.string().uuid() };

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

  /**
   * Refuses a feat linked to a pool the view's spells use, and a Stackable feat's edit that unticks it while a class
   * grants it at several levels: a character takes a feat that doesn't stack once, so its later grants would give
   * nothing ("Sneak Attack (Rogue) stays Stackable while Rogue grants it at levels 1, 3 and 5").
   */
  protected override checkForm(body: FormBody, given: PartialFieldValues<typeof FEAT_FIELDS.fields>, feat?: Feat) {
    const message = "Cannot link feat to aptitude(s) already used for spells";
    const listIds = (this.listsOf(body) ?? []).map((list) => list.toId);
    this.refuseLists(listIds, this.pf1.aptitudeIdsWithSpells, message);
    if (feat && given.stackable === false && FeatRules.of(this.rulesetData).isStackable(feat.id))
      this.checkStillGranted(feat);
  }

  /**
   * A page of the ruleset's feats grouped by family, of a pool's feats when its query says (`listedIn`): each under the
   * families it's a variant of (`groupByFamily`), as a picker groups them.
   */
  protected override groupsOf(where: { listedIn?: string }) {
    const ids = this.poolFeatIds(where.listedIn);
    return { groupFilters: { groups: this.groupByFamily(ids ?? [...this.pf1.featsById.keys()]), ids } };
  }

  /**
   * A page of the ruleset's feats, as its query asks for it: what it's read with (`filters`: a pool's feats, those a
   * class may grant as its features, its own first), and its records described, with their pools as the ruleset
   * composes them, and those the class grants each through (`grantedThrough`; none without a class).
   */
  protected override listOf({ grantableBy, listedIn }: { grantableBy?: string; listedIn?: string }) {
    const pool = this.poolFeatIds(listedIn);
    const features = grantableBy === undefined ? undefined : this.featuresOf(grantableBy);
    const listed = pool && new Set(pool);
    return {
      describe: <T extends Pick<EntityRecord, "fields" | "id" | "links">>(rows: T[]) =>
        this.describeListed(rows).map((row) => ({ ...row, grantedThrough: features?.through.get(row.id) ?? [] })),
      filters: {
        firstIds: features?.ownIds,
        ids: features ? features.ids.filter((id) => !listed || listed.has(id)) : pool,
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

  /**
   * Refuses unticking a feat's Stackable while a class grants it at several levels, naming the first such class and
   * its levels.
   */
  private checkStillGranted(feat: Feat) {
    const { rulesetData } = this;
    for (const [classId, levels] of this.pf1.classLevelsByClass) {
      const granting = levels.filter((level) =>
        this.pf1.grantedFeatsOf(level.id).some(({ toId }) => rulesetData.canonicalize(toId) === feat.id),
      );
      if (granting.length < 2) continue;
      const className = this.pf1.classesById.get(classId)?.name ?? "A class";
      const positions = granting.map((level) => level.position).toSorted((a, b) => a - b);
      const message = `${feat.name} stays Stackable while ${className} grants it at ${FeatureStacking.formatLevels(positions)}`;
      throw new RulesError("invalid", message, [{ category: `fields.${FEAT_STACKABLE}`, message }]);
    }
  }

  /** The feats a class (`classId`) may grant as its features, as its rule gives them: refused for a class it lacks. */
  private featuresOf(classId: string) {
    const klass = this.pf1.classesById.get(this.rulesetData.canonicalize(classId));
    if (!klass) throw new RulesError("not-found", "Class not found");
    return new ClassOffers(this.view, klass).describeFeatures();
  }

  /** The view's Pathfinder lists and indices. */
  private get pf1(): Pf1View {
    return Pf1View.of(this.rulesetData);
  }

  /** A pool's feats' ids (`aptitudeId`), as the ruleset composes them: every feat's (`undefined`) without one. */
  private poolFeatIds(aptitudeId: string | undefined) {
    return aptitudeId === undefined ? undefined : this.pf1.listFeatIds(aptitudeId);
  }

  /**
   * The families these feats (`featIds`) are grouped in, as a picker's list of variants shows them: each of a feat's
   * families it's a variant of (`FeatRules.variantOf`: `Weapon Focus: Longsword`'s Weapon Focus). A feat that's a
   * variant of none stands alone.
   */
  groupByFamily(featIds: string[]) {
    return featIds.flatMap((featId) => {
      const feat = this.pf1.featsById.get(featId);
      if (!feat) return [];
      const { families } = this.fields.read(feat);
      return families
        .filter((family) => FeatRules.variantOf(feat.name, family) !== undefined)
        .map((family) => ({ group: family, id: featId }));
    });
  }
}
