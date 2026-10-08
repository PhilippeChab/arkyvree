/** The entities the customization page edits, which it can delete too: their editor of their details, and its props. */

import type { CustomizationEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";

import { ClassLevelEditor } from "./ClassLevelEditor.tsx";
import { FeatEditor } from "./FeatEditor.tsx";
import { ItemEditor } from "./ItemEditor.tsx";
import { RaceEditor } from "./RaceEditor.tsx";
import { SpellEditor } from "./SpellEditor.tsx";

export type EditableEntity = Extract<CustomizationEntity, { type: (typeof EDITABLE_TYPES)[number] }>;

/** What the customization page passes each editor of an entity's details. */
export interface EditorProps<T> {
  /** Set right after a copy-on-write moved the page here: the record the form may still hold. */
  adoptKey?: string;
  canEdit: boolean;
  entity: T;
  entityId: string;
  /** The page's `followCopy`: a save of an inherited entity copies it, the page moving to the copy (`useEntitySave`) */
  followCopy: (copyId: string, sourceId: string) => void;
  /** No saving: the page still shows the entity a copy was made from. */
  locked: boolean;
  /** The form's record identity (useFormSync's `key`). */
  recordKey: string;
  /** Refetches the saved entity, which its save's response holds without its relations (aptitudes, a level's feats) */
  refetchSaved: (saved: { id: string }) => Promise<unknown>;
  rulesetId: string;
}

/** The entity types with an editor on the customization page */
const EDITABLE_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;

export function isEditable(data: CustomizationEntity): data is EditableEntity {
  return EDITABLE_TYPES.some((type) => type === data.type);
}

/** An entity's editor, by its type */
export function renderEditor(data: EditableEntity, props: Omit<EditorProps<unknown>, "entity">) {
  switch (data.type) {
    case "feats":
      return <FeatEditor {...props} entity={data.entity} />;
    case "races":
      return <RaceEditor {...props} entity={data.entity} />;
    case "items":
      return <ItemEditor {...props} entity={data.entity} />;
    case "powers":
      return <SpellEditor {...props} entity={data.entity} />;
    case "klass_levels":
      return <ClassLevelEditor {...props} entity={data.entity} />;
    default:
      return data satisfies never;
  }
}
