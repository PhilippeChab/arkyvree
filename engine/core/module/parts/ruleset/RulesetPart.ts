import type { EntityFieldValues, FieldCodec, FormField, LeafSpec } from "@/engine/core/fields/index.ts";
import type { EntityWrites } from "@/engine/core/module/parts/entities/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

/**
 * What a ruleset answers of a ruleset as a whole, past its entities: what it needs to be published, and its own fields,
 * its Settings (`fields`, which its properties hold), as its chain composes them and as their save writes them.
 */
export default abstract class RulesetPart {
  /**
   * The ruleset's own fields, its Settings, which its properties hold (3.5's: the skill points' ability), each a value of
   * its own: none is a group.
   */
  protected abstract readonly fields: FieldCodec<Readonly<Record<string, LeafSpec>>>;

  /** The content its rules make a character of that a ruleset's view lacks, each named by its kind (`race`, `skill`). */
  protected abstract findMissingContent(view: RulesetView): string[];

  /**
   * The ruleset's Settings, read off its chain's own properties, the fork's first (a fork holds a copy of its source's
   * until it saves its own): a reference the id the view keys its entity by.
   */
  private settingsOf(view: RulesetView) {
    const { ruleset, rulesetData } = view;
    const values = this.fields.read(rulesetData.rulesetPropertiesOf(ruleset.id));
    return this.fields.resolveReferences(values, (id) => rulesetData.cow.resolve(id));
  }

  /**
   * Refuses publishing a ruleset as `kind` while its view lacks what its rules make a character of, naming what's
   * missing: no character could be made in it. An extension, an add-on to rulesets that have them, needs none.
   */
  checkPublishable(view: RulesetView, kind: RulesetKind) {
    if (kind === "extension") return;
    const missing = this.findMissingContent(view).join(", ");
    if (missing) throw new RulesError("unprocessable", `Ruleset requires at least one of each: ${missing}`);
  }

  /** The ruleset's Settings, by name: what its Settings tab shows. */
  describeSettings(view: RulesetView): EntityFieldValues {
    return this.settingsOf(view);
  }

  /** The fields of the ruleset's Settings, as it declares them: their labels, their inputs and their options. */
  describeSettingsFields(): FormField[] {
    return this.fields.describe();
  }

  /**
   * A save of the ruleset's Settings (`body.fields`, those it changes): read as an entity's fields are, against the
   * ruleset's declarations (refused as invalid otherwise), over those it has. The values it keeps once written, and
   * the properties of the ruleset's own that keep them.
   */
  planSettings(
    view: RulesetView,
    body: { fields?: EntityFieldValues },
  ): { fields: EntityFieldValues; writes: EntityWrites } {
    const kept = this.settingsOf(view);
    const ids = new RequestIds(view.rulesetData, "this ruleset");
    const given = this.fields.parse(body.fields, {
      kept,
      resolve: (type, id) => ids.resolve(type, id),
    });
    const fields = this.fields.merge(kept, given);
    return { fields, writes: { properties: this.fields.write(fields) } };
  }
}
