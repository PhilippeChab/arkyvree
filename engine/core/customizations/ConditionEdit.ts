import type { NameBindingDraft, NameBindingPlace } from "@/shared/customization/nameBindings.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";

/** A condition's text as a save checks it: its target, its operator and its value, with the value type of its path. */
interface CheckedCondition {
  operator?: string;
  target: string;
  value?: string;
  valueType: string;
}

/**
 * What an edit reads of a condition: what it's sent (its target and its value only where its author changed them),
 * the value it holds now (`value`, as the view reads it), and the fields its stored bindings are of (`bound`).
 */
interface EditedCondition {
  bound: readonly { field: string }[];
  sent: { target?: string; value?: string };
  value?: string | null;
}

/** A field of a row whose names a save binds. */
type BoundField = NameBindingPlace["field"];

/** A row's fields a name can sit in, in their order. */
const FIELDS: readonly BoundField[] = ["target", "value"];

/**
 * A modifier's or a requirement's edit, by what its author changed. Its form sends its target and its value only when
 * they changed, so a field it isn't sent keeps its stored text and what its names mean, whatever the entities they
 * name are called now: a dialog opened before a rename saves its operator without reading the old name anew, which
 * names nothing since, or another entity that took it. A new value is bound beside the target it keeps. A new target
 * keeps a formula's paths as they are, which don't depend on it; a literal value it reads anew, under the name the
 * view shows it by, since whether it's an entity's name (a race's) is the target's to say. A field the row holds no
 * binding of (a row written past a save, before a fill) is bound from its text, which then reads as the view does, so
 * keeping its others' leaves it none the fill would miss.
 */
export default class ConditionEdit {
  constructor(private readonly edited: EditedCondition) {}

  /**
   * The bindings of the fields it writes, among what a binder reads of the edited condition (`drafts`): the other
   * fields' stay as stored.
   */
  pick(drafts: NameBindingDraft[]): NameBindingDraft[] {
    const fields = this.rebound;
    return drafts.filter((draft) => fields.includes(draft.field));
  }

  /** The fields whose text the edit writes and whose names it binds anew. */
  get rebound(): BoundField[] {
    const { bound, sent, value } = this.edited;
    return FIELDS.filter((field) => {
      if (field === "target" ? sent.target !== undefined : sent.value !== undefined) return true;
      if (field === "value" && sent.target !== undefined && !(value && isTemplateValue(value))) return true;
      return !bound.some((binding) => binding.field === field);
    });
  }

  /**
   * What the row stores of the edited condition, checked (`checked`, its target and value as the view reads them where
   * it wasn't sent them): its operator and its value type, and the fields it writes.
   */
  store({ target, value, ...checked }: CheckedCondition) {
    const fields = this.rebound;
    return { ...checked, ...(fields.includes("target") && { target }), ...(fields.includes("value") && { value }) };
  }
}
