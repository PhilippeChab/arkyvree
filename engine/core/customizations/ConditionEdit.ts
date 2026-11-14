import type { NameBindingDraft, NameBindingPlace } from "@/shared/customization/nameBindings.ts";

/** A condition's text as a save checks it: its target, its operator and its value, with the value type of its path. */
interface CheckedCondition {
  operator?: string;
  target: string;
  value?: string;
  valueType: string;
}

/** What an edit is sent of a condition: its target and its value only where its author changed them. */
interface SentCondition {
  target?: string;
  value?: string;
}

/** A field of a row whose names a save binds. */
type BoundField = NameBindingPlace["field"];

/**
 * A modifier's or a requirement's edit, by what its author changed (`sent`). Its form sends its target and its value
 * only when they changed, so a field it isn't sent keeps its stored text and what its names mean, whatever the
 * entities they name are called now: a dialog opened before a rename saves its operator without reading the old name
 * anew, which names nothing since, or another entity that took it. A new target takes its value with it, stored as
 * the view reads it and bound against the new target; a new value alone is bound beside the target it keeps.
 */
export default class ConditionEdit {
  constructor(private readonly sent: SentCondition) {}

  /**
   * The bindings of the fields it writes, among what a binder reads of the edited condition (`drafts`): the other
   * fields' stay as stored.
   */
  pick(drafts: NameBindingDraft[]): NameBindingDraft[] {
    const fields = this.rebound;
    return drafts.filter((draft) => fields.includes(draft.field));
  }

  /** The fields whose text the edit writes and whose names it binds anew: none when it changed neither. */
  get rebound(): BoundField[] {
    if (this.sent.target !== undefined) return ["target", "value"];
    return this.sent.value === undefined ? [] : ["value"];
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
