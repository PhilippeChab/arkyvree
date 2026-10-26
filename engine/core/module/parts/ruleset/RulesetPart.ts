import type { EntityFieldValues, FieldCodec, FieldsWrite, FormField, LeafSpec } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds, type RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

import type { RulesDeclaration, RulesWord } from "./RulesDescription.ts";

/** The words of the types the engine itself holds, whatever the rules: a customization's modifier. */
const ENGINE_WORDS: Readonly<Record<string, RulesWord>> = { modifiers: { many: "Modifiers", one: "Modifier" } };

/**
 * What a ruleset answers of a ruleset as a whole, past its entities: what it needs to be published, its own fields, its
 * Settings (`fields`, which its own fields and links hold), as its chain composes them and as their save writes them,
 * and what every ruleset of its base rules shares (`rules`).
 */
export default abstract class RulesetPart {
  /**
   * The ruleset's own fields, its Settings, which its own fields and links hold (3.5's: the skill points' ability, a
   * link), each a value of its own: none is a group.
   */
  protected abstract readonly fields: FieldCodec<Readonly<Record<string, LeafSpec>>>;

  /** What every ruleset of its base rules shares: its words, its kinds, its bounds, its license */
  protected abstract readonly rules: RulesDeclaration;

  /** The content its rules make a character of that a ruleset's view lacks, each named by its kind (`race`, `skill`). */
  protected abstract findMissingContent(view: RulesetView): string[];

  /**
   * The ruleset's Settings, read off its chain's own, the fork's first (a fork holds a copy of its source's until it
   * saves its own): a reference the id the view keys its entity by.
   */
  private settingsOf(view: RulesetView) {
    const { ruleset, rulesetData } = view;
    const values = this.fields.read(rulesetData.rulesetValuesOf(ruleset.id));
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

  /**
   * What every ruleset of its base rules shares, which the client reads once: its words (the engine's own types' with
   * its own), its kinds, its license…
   */
  describeRules(): RulesDeclaration {
    return { ...this.rules, words: { ...ENGINE_WORDS, ...this.rules.words } };
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
   * the write of the ruleset's own fields and links that keep them.
   */
  planSettings(
    view: RulesetView,
    body: { fields?: EntityFieldValues },
  ): { fields: EntityFieldValues; write: FieldsWrite } {
    const kept = this.settingsOf(view);
    const ids = new RequestIds(view.rulesetData, "this ruleset");
    const given = this.fields.parse(body.fields, {
      kept,
      resolve: (type, id) => ids.resolve(type, id),
    });
    const fields = this.fields.merge(kept, given);
    return { fields, write: this.fields.write(fields) };
  }
}
