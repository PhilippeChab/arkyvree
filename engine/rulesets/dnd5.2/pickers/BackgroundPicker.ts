import CreationPicker from "./CreationPicker.ts";

/**
 * A new character's background picker: the ruleset's backgrounds, each checked against its form. A background is for
 * no kind of character in particular: none is left out by a partition.
 */
export default class BackgroundPicker extends CreationPicker {
  override readonly filters = {};
}
