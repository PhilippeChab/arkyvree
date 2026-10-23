/** A new character's form: what the create dialog holds, how it starts, and what it sends. */

import type { InferRequestType } from "hono/client";

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

/** A new character's form, as its rules lay it out. */
export type CharacterForm = RulesDescription["characterForm"];

/**
 * What a new character's form holds: what every character is made from (its ruleset, race, name, ability scores and
 * notes), and its rules' fields by their keys (a number's NaN while it's empty, a select's "" while it's unset).
 */
export type CreateCharacterFormData = Omit<CreateCharacterRequest, "fields" | "notes"> & {
  notes: string;
} & Record<string, unknown>;

/** What a new character is created with: the create request's body. */
export type CreateCharacterRequest = InferRequestType<typeof rpc.api.characters.$post>["json"];

/** A field of a new character's form, one of its rules'. */
export type CreationField = Extract<CreationItem, { key: string }>;

/** An item of a new character's form's line: one of the form's own, or one of its rules' fields. */
export type CreationItem = Extract<CharacterForm["sections"][number], { kind: "fields" }>["lines"][number][number];

/** The rules' fields of a new character's form, in its order. */
export function creationFieldsOf(form: CharacterForm): CreationField[] {
  return form.sections.flatMap((section) =>
    section.kind === "fields" ? section.lines.flat().filter((item): item is CreationField => "key" in item) : [],
  );
}

/**
 * How the create dialog starts: no ruleset or race picked (the user's own ruleset, once it's known, is picked by the
 * dialog), every score its method's default, and each of its rules' fields at its start, else empty (a number `NaN`,
 * a number field's empty value), which the player gives or leaves unset.
 */
export function emptyNewCharacter(form: CharacterForm): CreateCharacterFormData {
  return {
    rulesetId: "",
    raceId: "",
    name: "",
    abilities: {},
    notes: "",
    ...Object.fromEntries(
      creationFieldsOf(form).map((field) => [field.key, field.kind === "number" ? (field.start ?? Number.NaN) : ""]),
    ),
  };
}

/** The keys of the fields that narrow the race picker (`racePick`), in the form's order. */
export function racePickKeysOf(form: CharacterForm) {
  return creationFieldsOf(form)
    .filter((field) => field.racePick)
    .map((field) => field.key);
}

/** What the fields that narrow the race picker hold (`values`, each of `keys` in order), by their keys: "" unpicked. */
export function racePicksOf(keys: string[], values: unknown[]) {
  return Object.fromEntries(keys.map((key, index) => [key, typeof values[index] === "string" ? values[index] : ""]));
}

/** A form's rules' fields as its create sends them, by their keys: an empty number or an unset select, none. */
export function sentCreationFieldsOf(form: CharacterForm, values: Record<string, unknown>) {
  return Object.fromEntries(
    creationFieldsOf(form).map((field) => {
      const value = values[field.key];
      if (field.kind === "number")
        return [field.key, typeof value === "number" && Number.isFinite(value) ? value : null];
      if (field.kind === "select") return [field.key, typeof value === "string" && value ? value : null];
      return [field.key, typeof value === "string" ? value : ""];
    }),
  );
}
