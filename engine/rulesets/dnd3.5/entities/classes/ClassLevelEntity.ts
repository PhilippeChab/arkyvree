/** A class's levels as a ruleset's entities: their details, their fields, and what their saves write. */

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { EntityWrites } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";

import { CLASS_LEVEL_FIELDS, type ClassLevelFieldValues } from "./fields.ts";

/**
 * A class level's save, as its form sends it: its number (a new level's), its fields, the feats it grants and its
 * saves' base bonuses.
 */
type ClassLevelBody = Partial<ClassLevelFieldValues> & {
  feats?: { aptitudeId: string; featId: string; free?: boolean }[];
  level?: number;
  saves?: { base: number; saveId: string }[];
};

/**
 * A class's levels (`klass`, as the view has it) as the ruleset describes them, and what a level's save writes beside
 * its row: its fields, the feats it grants and its saves' base bonuses (`joinRows`), and its requirement of the class's
 * previous level.
 */
export default class ClassLevelEntity extends CustomizationPageEntity<
  "klass_levels",
  ClassLevelBody,
  { level?: number },
  typeof CLASS_LEVEL_FIELDS.fields
> {
  constructor(
    view: RulesetView,
    private readonly klass: Klass,
  ) {
    super(view);
  }

  /** Its base attack bonus and its skill points. */
  protected readonly fields = CLASS_LEVEL_FIELDS;

  protected readonly label = "Class level";

  readonly type = "klass_levels";

  /** A form's columns: none, a level's number is its own (a new one's, its form's: `planCreate`). */
  protected columnsOf() {
    return {};
  }

  /** A level's details: the feats it grants (each with its pool's name and whether it's free), its saves' base bonuses. */
  private detailsOf(level: { id: string }) {
    const levelSaves = this.rulesetData.klassLevelSavesByKlassLevel.get(level.id) ?? [];
    return {
      feats: this.grantedFeats(level.id),
      saves: levelSaves.map((ls) => ({ saveId: ls.saveId, base: ls.base })),
    };
  }

  /** The feats a class level grants, each with its pool's name and whether it's free. */
  private grantedFeats(levelId: string) {
    const { rulesetData } = this;
    return (rulesetData.klassLevelFeatsByKlassLevel.get(levelId) ?? []).map((lf) => {
      const feat = rulesetData.featsById.get(lf.featId);
      const aptitudeEntry = feat?.featsAptitudesInRules?.find((fa) => fa.aptitudeId === lf.aptitudeId);
      return {
        ...feat!,
        aptitudeId: lf.aptitudeId,
        aptitudeName: aptitudeEntry?.aptitudesInRule?.name ?? null,
        free: lf.free,
      };
    });
  }

  /** A save's join rows, from its form: the feats it grants (free unless it says), and its saves' base bonuses. */
  private joinRows({ feats, saves }: ClassLevelBody) {
    return {
      feats: feats?.map((feat) => ({ aptitudeId: feat.aptitudeId, featId: feat.featId, free: feat.free ?? true })),
      saves: saves?.map((save) => ({ base: save.base, saveId: save.saveId })),
    };
  }

  /**
   * What saving a level writes (`level`: the one edited): the base attack and skill points its form gives, over those it
   * keeps, and, made with a level past the class's first, its requirement of the class's previous level
   * (`classes.<slug>.level` above it).
   */
  protected override writesOf(body: ClassLevelBody, level?: KlassLevel): EntityWrites {
    const writes: EntityWrites = {};
    if (!level && body.level !== undefined && body.level > 1) {
      writes.requirement = {
        level: "1",
        target: ClassesPaths.level(this.klass.name),
        value: (body.level - 1).toString(),
        valueType: "number",
        operator: "greater_than",
      };
    }
    const fields = this.formFields(body, level);
    return fields ? { ...writes, properties: this.fields.write(fields) } : writes;
  }

  /** One of the class's levels with its details and its customizations: refused when it isn't the class's. */
  override describe(levelId: string) {
    const level = super.describe(levelId);
    return { ...level, ...this.detailsOf(level) };
  }

  /** The class's levels, each with its fields and its details. */
  describeAll() {
    const levels = this.rulesetData.klassLevelsByKlass.get(this.klass.id) ?? [];
    return this.describeRows(levels).map((level) => ({ ...level, ...this.detailsOf(level) }));
  }

  /** One of the class's levels, as the view has it: refused when there's none, or it isn't the class's. */
  override find(levelId: string) {
    const level = super.find(levelId);
    if (level.klassId !== this.klass.id) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return level;
  }

  /**
   * A new level of the class: the class as the view has it, the level's row and join rows, what its save writes beside
   * them, and the level it answers once saved, with the fields the save keeps.
   */
  override planCreate(body: ClassLevelBody & { level: number }) {
    return { ...super.planCreate(body), ...this.joinRows(body), columns: { level: body.level }, klass: this.klass };
  }

  /** Deleting one of the class's levels: the class and the level, as the view has them. */
  override planDelete(levelId: string) {
    return { ...super.planDelete(levelId), klass: this.klass };
  }

  /**
   * One of the class's levels' edit: the class and the level, as the view has them, its new join rows when the form
   * sends them, what its save writes against the properties the view composes for it (those a copy of it holds), and the
   * level it answers once saved, with the fields it keeps.
   */
  override planEdit(levelId: string, body: ClassLevelBody) {
    return { ...super.planEdit(levelId, body), ...this.joinRows(body), klass: this.klass };
  }
}
