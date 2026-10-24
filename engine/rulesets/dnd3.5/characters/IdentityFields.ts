import { z } from "zod";

import type { FieldsBlock, FieldsPlan, FieldsRequest, SheetField } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { ALIGNMENT_OPTIONS, GENDER_OPTIONS } from "@/shared/enums.ts";

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

/**
 * Each field an identity edit sends, by its key, and how it's read: a select's value is one of its options (null: as it
 * is), an age a whole number from 1 or null (cleared), experience a whole number from 0, a height or a weight a text
 * (empty or null: cleared). The race is its creation's, never edited.
 */
const FIELDS_REQUEST = z
  .object({
    age: z.number().int().min(1).nullable(),
    alignment: z.enum(ALIGNMENT_OPTIONS).nullable(),
    deity: z.string(),
    description: z.string(),
    experience: z.number().int().min(0),
    gender: z.enum(GENDER_OPTIONS).nullable(),
    height: z.string().nullable(),
    weight: z.string().nullable(),
  })
  .partial()
  .strict();

/**
 * A 3.5 character's identity as its sheet's `fields` block: its race (its creation's), alignment, experience and deity
 * on a line, its age, gender, height and weight on the next, its description under them, the languages it speaks, and
 * its notes; a partly seen character's race and physical traits alone. And what an edit of its fields writes.
 */
export default class IdentityFields {
  /** A value the select offers, else none: a value its options don't hold reads as not set. */
  private static optionOf(value: string, options: readonly string[]) {
    return options.includes(value) ? value : null;
  }

  /**
   * The identity's block (`identity`, as its sheet reads it), its private notes as they read (none for a reader who
   * doesn't read them); `partial`: what a campaign member who sees the character partly reads, its race and its physical
   * traits alone.
   */
  static describe(identity: SheetIdentity, partial = false): FieldsBlock {
    const { background, beliefs, meta, physiology } = identity;
    const race: SheetField = {
      key: "race",
      kind: "text",
      label: "Race",
      value: physiology.race?.name || "",
      fixed: true,
    };
    const traits: SheetField[] = [
      { key: "age", kind: "number", label: "Age", min: 1, value: physiology.age ?? null },
      {
        key: "gender",
        kind: "select",
        label: "Gender",
        options: [...GENDER_OPTIONS],
        value: IdentityFields.optionOf(physiology.gender, GENDER_OPTIONS),
      },
      { key: "height", kind: "text", label: "Height", value: String(physiology.height || "") },
      { key: "weight", kind: "text", label: "Weight", value: String(physiology.weight || "") },
    ];
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
      lines: [
        [
          race,
          {
            key: "alignment",
            kind: "select",
            label: "Alignment",
            options: [...ALIGNMENT_OPTIONS],
            value: IdentityFields.optionOf(beliefs.alignment, ALIGNMENT_OPTIONS),
          },
          {
            key: "experience",
            kind: "number",
            label: "Experience Points",
            min: 0,
            required: "Experience points are required",
            value: meta.xp || 0,
          },
          { key: "deity", kind: "text", label: "Deity", value: beliefs.deity || "" },
        ],
        traits,
      ],
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
          link: "languages",
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
   * What an edit of the identity's fields (`request`, by their keys) writes, each checked: refused when it names a field
   * the identity hasn't, or a value its field doesn't take. A select left unset, its value as it is.
   */
  static plan(request: FieldsRequest): FieldsPlan {
    const { age, alignment, deity, description, experience, gender, height, weight } = RulesError.parse(
      FIELDS_REQUEST,
      request,
      ["fields"],
    );
    return {
      columns: {
        ...(age !== undefined && { age }),
        ...(alignment && { alignment }),
        ...(deity !== undefined && { deity }),
        ...(description !== undefined && { description }),
        ...(experience !== undefined && { xp: experience }),
        ...(gender && { gender }),
        ...(height !== undefined && { height: height || null }),
        ...(weight !== undefined && { weight: weight || null }),
      },
    };
  }
}
