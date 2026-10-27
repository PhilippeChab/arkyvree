import { z } from "zod";

import { Field } from "@/engine/core/fields/index.ts";
import type { CharacterInput, FieldsBlock, FieldsPlan, FieldsRequest, SheetField } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { CHARACTER_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

import CharacterValues from "./CharacterValues.ts";

/** A 3.5 character's identity, as its sheet reads it: who it is, its beliefs, its experience, and its notes. */
interface SheetIdentity {
  background: { notes: string; privateNotes?: string };
  beliefs: { alignment: string; deity: string };
  meta: { xp: number };
  physiology: {
    age?: number;
    description: string;
    gender: string;
    height: string;
    languages: { id: string; name: string }[];
    race: { name: string } | null;
    weight: string;
  };
}

/** A field of a 3.5 character's, by its name among its declarations (`CHARACTER_FIELDS`). */
type FieldName = keyof typeof CHARACTER_FIELDS;

/** The row's own column an identity edit sends among its fields, by its key: its description, a text. */
const OWN_REQUEST = z.object({ description: z.string().optional() });

/**
 * The stored fields an identity edit never leaves at none (`required`: its alignment and its gender, selects of their
 * options), which an edit that sends one unset (null) leaves as it is: the character always holds one.
 */
const UNCLEARED = new Set(
  Field.storedLeavesOf(CHARACTER_FIELDS).flatMap((leaf) => ("required" in leaf && leaf.required ? [leaf.field] : [])),
);

/**
 * A 3.5 character's identity as its sheet's `fields` block: its race (its creation's), alignment, experience and deity
 * on a line, its age, gender, height and weight on the next, its description under them, the languages it speaks, and
 * its notes; a partly seen character's race and physical traits alone. Each field is keyed by the stored field that
 * keeps it, labeled and bounded as it's declared (`CHARACTER_FIELDS`). And what an edit of its fields writes, read by
 * the character's codec as an entity's form is (`FieldCodec.parse`).
 */
export default class IdentityFields {
  /**
   * A character's field (`name`'s) as its block shows it, holding `value` (the identity's, as its sheet reads it): a
   * number at least its least (one with a default, required: its edit never clears it), a select of its values (one
   * they don't hold reads as not set), or a text.
   */
  private static sheetFieldOf(name: FieldName, value: unknown): SheetField {
    const declared = CHARACTER_FIELDS[name];
    const { field: key, label } = declared;
    if (declared.kind === "number") {
      const fallback: number | undefined = "default" in declared ? declared.default : undefined;
      return {
        key,
        kind: "number",
        label,
        min: Field.boundsOf(declared).min,
        ...(fallback !== undefined && { required: `${label} is required` }),
        value: typeof value === "number" ? value : (fallback ?? null),
      };
    }
    if ("values" in declared) {
      const options: readonly string[] = declared.values;
      return {
        key,
        kind: "select",
        label,
        options: [...options],
        value: options.find((option) => option === value) ?? null,
      };
    }
    return { key, kind: "text", label, value: typeof value === "string" ? value : "" };
  }

  /** The identity's fields' values (`identity`, as its sheet reads it), by their names. */
  private static valuesOf({ beliefs, meta, physiology }: SheetIdentity): Record<FieldName, unknown> {
    return {
      age: physiology.age,
      alignment: beliefs.alignment,
      deity: beliefs.deity,
      gender: physiology.gender,
      height: physiology.height,
      weight: physiology.weight,
      xp: meta.xp,
    };
  }

  /**
   * The identity's block (`identity`, as its sheet reads it), its private notes as they read (none for a reader who
   * doesn't read them); `partial`: what a campaign member who sees the character partly reads, its race and its physical
   * traits alone.
   */
  static describe(identity: SheetIdentity, partial = false): FieldsBlock {
    const { background, physiology } = identity;
    const values = IdentityFields.valuesOf(identity);
    const fieldsOf = (names: FieldName[]) => names.map((name) => IdentityFields.sheetFieldOf(name, values[name]));
    const race: SheetField = {
      key: "race",
      kind: "text",
      label: "Race",
      value: physiology.race?.name || "",
      fixed: true,
    };
    const traits = fieldsOf(["age", "gender", "height", "weight"]);
    const head = {
      kind: "fields",
      key: "identity",
      title: "Personal Details",
      empty: "",
      portrait: "Portrait",
      saved: "Character updated",
      failed: "Failed to save character details",
    } as const;
    if (partial) return { ...head, lines: [[race], traits], fields: [] };
    return {
      ...head,
      lines: [[race, ...fieldsOf(["alignment", "xp", "deity"])], traits],
      fields: [
        {
          key: "description",
          kind: "textarea",
          label: "Description",
          placeholder: "Character appearance, personality, or background…",
          value: physiology.description || "",
        },
      ],
      links: [
        {
          label: "Languages",
          role: "speaks",
          none: "No language left to pick",
          picked: (physiology.languages ?? []).map(({ id, name }) => ({ id, name })),
        },
      ],
      notes: {
        notes: background.notes || "",
        ...(background.privateNotes !== undefined && { privateNotes: background.privateNotes || "" }),
      },
    };
  }

  /**
   * What an edit of a character's (`character`) identity (`request`: its fields by the stored field that keeps each,
   * and its description) writes, each checked by the character's codec as an entity's form is (`FieldCodec.parse`):
   * refused, by field, when it names a field the character hasn't, or a value its field doesn't take. A field it
   * leaves out is kept, and so is one it never leaves at none that it sends unset (`UNCLEARED`); one it clears
   * (null, an empty text), none.
   */
  static plan(view: RulesetView, character: CharacterInput, request: FieldsRequest): FieldsPlan {
    const { description, ...given } = request;
    const own = RulesError.parse(OWN_REQUEST, { description }, ["fields"]);
    const sent = Object.fromEntries(
      Object.entries(given).filter(([field, value]) => value !== null || !UNCLEARED.has(field)),
    );
    const values = CharacterValues.parseForm(view, sent, CharacterValues.fieldsOf(character.record));
    return {
      fields: CharacterValues.writeOf(values),
      own: { ...(own.description !== undefined && { description: own.description }) },
    };
  }
}
