import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5/characterKinds.ts";

import CreationPicker from "./CreationPicker.ts";

/** A new character's species picker: a player character's species (`filters`), each checked against its form. */
export default class SpeciesPicker extends CreationPicker {
  override readonly filters = { partitions: [PLAYER_CHARACTER_KIND] };
}
