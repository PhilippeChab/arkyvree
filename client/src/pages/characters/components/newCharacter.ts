/** A new character's form: what the create dialog sends, and how it starts. */

import type { InferRequestType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

/** What the character is created with, its alignment and gender unpicked ("") until they're chosen. */
export type CreateCharacterFormData = Omit<CreateCharacterRequest, "alignment" | "gender"> & {
  alignment: CreateCharacterRequest["alignment"] | "";
  gender: CreateCharacterRequest["gender"] | "";
};

/** What a new character is created with: the create request's body. */
export type CreateCharacterRequest = InferRequestType<typeof rpc.api.characters.$post>["json"];

/**
 * How the create dialog starts: no ruleset or race picked (the user's own ruleset, once it's known, is picked by the
 * dialog), no experience, every score its method's default, and every detail empty, its age too (`NaN`, a number
 * field's empty value), which the player gives or leaves unset.
 */
export const EMPTY_NEW_CHARACTER: CreateCharacterFormData = {
  rulesetId: "",
  raceId: "",
  name: "",
  xp: 0,
  alignment: "",
  gender: "",
  abilities: {},
  age: Number.NaN,
  height: "",
  weight: "",
  deity: "",
  description: "",
  notes: "",
};
