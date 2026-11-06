import type { FieldsWrite } from "@/engine/core/fields/index.ts";
import type { EntityRemoval, MadeEntity } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { FEAT_GENERATED } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A feat a plan makes with an entity: its name and description, its fields, its customizations. */
export type GeneratedFeat = Pick<MadeEntity, "modifiers" | "requirements"> & {
  description: string;
  fields: FieldsWrite;
  name: string;
};

/**
 * A set of feats an entity brings, generated in the pool a ruleset names (`poolSlug`: the Skill Proficiencies'): what a
 * name brings (`featsOf`, a skill's, a school's), made with the entity's plan (`make`), and removed with it by a set
 * that removes its feats (`removeFeat`, which a set exposes when it does).
 */
export default abstract class GeneratedFeats {
  constructor(protected readonly view: RulesetView) {}

  /** The pool the set's feats go in, by its slug. */
  protected abstract readonly poolSlug: string;

  /** The feats `name` brings: each is made unless the view has a feat of its name. */
  protected abstract featsOf(name: string): GeneratedFeat[];

  /** The generated feat named `featName` a plan removes, refused (`inUse`) while picked: none when the view has none. */
  protected removeFeat(featName: string, inUse: string) {
    const feat = Dnd52View.of(this.view.rulesetData).feats.find((f) => f.name === featName);
    const removal: EntityRemoval[] = feat ? [{ id: feat.id, inUse, type: "feats" }] : [];
    return removal;
  }

  /**
   * The feats `name` brings, as entities a plan makes in the set's pool: none when the ruleset has no such pool, and
   * none of those whose name its view shows (its own or its chain's; one it deleted, a tombstone hides, doesn't count),
   * so a set the ruleset holds part of gets the rest.
   */
  make(name: string): MadeEntity[] {
    const { rulesetData } = this.view;
    const dnd52 = Dnd52View.of(rulesetData);
    const aptitudeId = dnd52.aptitudeIdBySlug.get(this.poolSlug);
    if (!aptitudeId) return [];
    const shown = new Set(dnd52.feats.map((feat) => feat.name));
    const feats = this.featsOf(name).filter((feat) => !shown.has(feat.name));
    return feats.map(({ description, fields, modifiers, name: featName, requirements }) => ({
      links: [{ links: [{ toId: aptitudeId }], role: "listedIn", toType: "aptitudes" }],
      modifiers,
      requirements,
      row: {
        description,
        fields: { ...fields.fields, [FEAT_GENERATED]: true },
        links: fields.links,
        name: featName,
      },
      type: "feats",
    }));
  }
}
