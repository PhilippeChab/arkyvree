/** A class's levels as a ruleset's entities: their details, their fields, and what their forms write. */

import { z } from "zod";

import { CustomizationPageEntity, type FormBody } from "@/engine/core/entities/index.ts";
import type { EntityForm, PartialFieldValues } from "@/engine/core/fields/index.ts";
import type { EntityRecord, EntityWrite, EntityWrites, LinkSet } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { NamedLink, RulesetView, ViewLink } from "@/engine/core/view/index.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import { CLASS_LEVEL_FIELDS } from "./fields.ts";

/**
 * A class level's link as its answers carry it (`NamedLink`): a feat it grants with the feat's description
 * (`toDescription`) and its pool's name (`viaName`, none when the pool doesn't list the feat).
 */
interface LevelLink extends NamedLink {
  toDescription?: string | null;
  viaName?: string | null;
}

/** A new level's number: the class's first to its last. */
const LEVEL = z.number().int().min(1).max(RULESET_LIMITS.classLevel);

/**
 * A class's levels (`klass`, as the view has it) as the ruleset describes them, each with all its links (`links`, as
 * its saves answer them too), and what a level's save writes beside its row: its fields, the feats it grants and its
 * saves' base bonuses (its `grants` and `baseBonus` links, `linksOf`), and its requirement of the class's previous
 * level. A level's number is its `position` on its class's.
 */
export default class ClassLevelEntity extends CustomizationPageEntity<
  "class-levels",
  typeof CLASS_LEVEL_FIELDS.fields
> {
  constructor(
    view: RulesetView,
    private readonly klass: Klass,
  ) {
    super(view);
  }

  /** Its saves' base bonuses and the feats it grants, its base attack bonus and its skill points. */
  protected override readonly fields = CLASS_LEVEL_FIELDS;

  override readonly type = "class-levels";

  /**
   * Refuses a new level without its number (its `position`), or past the class's bounds (its fields refuse a save's
   * base bonus past the rules').
   */
  protected override checkForm({ position }: FormBody, _given: object, level?: KlassLevel) {
    if (!level) RulesError.parse(LEVEL, position, ["position"]);
  }

  /**
   * A form's links, by role: the feats it grants (`grants`, each through its pool, free unless it says), and its saves'
   * base bonuses (`baseBonus`), each entity the view's. A role the form leaves out it keeps.
   */
  protected override linksOf(body: FormBody): LinkSet[] {
    const sets = super.linksOf(body) ?? [];
    const grants = sets.filter((set) => set.role === "grants");
    return [
      ...grants.map((set) => ({ ...set, links: set.links.map((link) => ({ ...link, free: link.free ?? true })) })),
      ...sets.filter((set) => set.role !== "grants"),
    ];
  }

  /**
   * A level's links, each with its target's name (`toName`): a feat it grants with its description (`toDescription`)
   * and its pool's name (`viaName`), when the pool lists the feat.
   */
  protected override nameLinks(links: readonly ViewLink[]): LevelLink[] {
    const { dnd35 } = this;
    return super.nameLinks(links).map((link) => {
      const feat = link.role === "grants" && link.toType === "feats" ? dnd35.featsById.get(link.toId) : undefined;
      if (!feat) return link;
      const viaId = link.viaId === null ? undefined : this.rulesetData.canonicalize(link.viaId);
      const listed = viaId !== undefined && dnd35.listLinksOf(feat.id).some((list) => list.toId === viaId);
      const pool = listed ? dnd35.aptitudesById.get(viaId) : undefined;
      return { ...link, toDescription: feat.description, viaName: pool?.name ?? null };
    });
  }

  /** Of a saved level's own links (`links`, as stored), those its answer names: all of them, as a read names them. */
  protected override savedLinks(_row: Pick<EntityRecord, "links">, links: readonly ViewLink[]): readonly ViewLink[] {
    return this.ordered(links);
  }

  /** What a level's form writes of its row: nothing, a level has no name nor description (its number its `position`). */
  protected override storedOf(): EntityWrite {
    return {};
  }

  /**
   * What saving a level writes beside its row (`level`: the one edited): made with a level past the class's first, its
   * requirement of the class's previous level (`classes.<slug>.level` above it).
   */
  protected override writesOf(
    body: FormBody,
    _given: PartialFieldValues<typeof CLASS_LEVEL_FIELDS.fields>,
    level?: KlassLevel,
  ): EntityWrites {
    const writes: EntityWrites = {};
    if (!level && body.position !== undefined && body.position > 1) {
      writes.requirement = {
        level: "1",
        target: ClassesPaths.level(this.klass.name),
        value: (body.position - 1).toString(),
        valueType: "number",
        operator: "greater_than",
      };
    }
    return writes;
  }

  /** One of the class's levels with all its links and its customizations: refused when it isn't the class's. */
  override describe(levelId: string) {
    const level = super.describe(levelId);
    return { ...level, links: this.linksIn(level.id) };
  }

  /** One of the class's levels, as the view has it: refused when there's none, or it isn't the class's. */
  override find(levelId: string) {
    const level = super.find(levelId);
    if (level.ownerId !== this.klass.id) this.refuseMissing();
    return level;
  }

  /**
   * A new level of the class: the class as the view has it, the level's row (its number, its `position`) and links,
   * what its form writes beside them, and the level it answers once written, with the fields it keeps.
   */
  override planCreate(form: EntityForm) {
    const plan = super.planCreate(form);
    const level = RulesError.parse(LEVEL, form.position);
    return {
      ...plan,
      activity: { entityName: this.klass.name, level },
      owner: this.klass,
      row: { ...plan.row, position: level },
    };
  }

  /** Deleting one of the class's levels: the class and the level, as the view has them. */
  override planDelete(levelId: string) {
    const plan = super.planDelete(levelId);
    const activity = { rulesetId: this.view.ruleset.id, entityName: this.klass.name, level: plan.entity.position };
    return { ...plan, activity, owner: this.klass };
  }

  /**
   * One of the class's levels' edit: the class and the level, as the view has them, its new links when the form sends
   * them, what its form writes against the fields the view composes for it (those a copy of it holds), and the
   * level it answers once written, with the fields it keeps.
   */
  override planEdit(levelId: string, form: EntityForm) {
    const plan = super.planEdit(levelId, form);
    return { ...plan, activity: { entityName: this.klass.name, level: plan.entity.position }, owner: this.klass };
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /**
   * A level's links as its answers carry them (`levelId`): all of them, as the view composes them (`ordered`), named
   * (`nameLinks`).
   */
  private linksIn(levelId: string): LevelLink[] {
    return this.nameLinks(this.ordered(this.rulesetData.linksOf(levelId)));
  }

  /**
   * A level's links in the order its answers give them (`links`): the feats it grants by their names, as the books list
   * them, then its others (its saves' base bonuses) as they come.
   */
  private ordered(links: readonly ViewLink[]): ViewLink[] {
    const { featsById } = this.dnd35;
    const isFeat = (link: ViewLink) => link.role === "grants" && link.toType === "feats";
    const nameOf = (link: ViewLink) => featsById.get(link.toId)?.name ?? "";
    const feats = links.filter(isFeat).toSorted((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return [...feats, ...links.filter((link) => !isFeat(link))];
  }

  /**
   * The class's levels, each with its fields, all its links, and its base attack bonus as the sheet writes it, its
   * attacks a round (`babLabel`: "+6/+1").
   */
  describeAll() {
    const levels = this.dnd35.classLevelsByClass.get(this.klass.id) ?? [];
    return this.describeRows(levels).map((level, index) => ({
      ...level,
      babLabel: CombatSheet.formatBab(this.fieldsOf(levels[index]).bab),
      links: this.linksIn(level.id),
    }));
  }
}
