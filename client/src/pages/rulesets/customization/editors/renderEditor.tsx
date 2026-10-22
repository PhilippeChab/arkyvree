/** The entities the customization page edits, which it can delete too: their editor of their details, and its props. */

import type { RulesDescription } from "@/client/src/lib/queries.ts";
import type { CustomizationEntity } from "@/client/src/pages/rulesets/customization/entityQueries.ts";

import { ClassLevelEditor } from "./ClassLevelEditor.tsx";
import { EntityEditor } from "./EntityEditor.tsx";

/** What the customization page passes each editor of an entity's details. */
export interface EditorProps<T> {
  /** Set right after a copy-on-write moved the page here: the record the form may still hold. */
  adoptKey?: string;
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

/** An entity the customization page edits: a kind's, or a class's level; a modifier has no details to edit. */
export type EditableEntity = Exclude<CustomizationEntity, { type: "modifiers" }>;

export function isEditable(data: CustomizationEntity): data is EditableEntity {
  return data.type !== "modifiers";
}

/**
 * An entity's editor: a class level's own, else its kind's, as its rules describe it (`rules`, which the app has
 * loaded: none for a kind they don't list).
 */
export function renderEditor(
  data: EditableEntity,
  rules: RulesDescription | undefined,
  props: Omit<EditorProps<unknown>, "entity">,
) {
  if (data.type === "klass_levels") return <ClassLevelEditor {...props} entity={data.entity} />;
  const kind = rules?.kinds.find((each) => each.type === data.type);
  return kind && <EntityEditor {...props} entity={data.entity} kind={kind} />;
}
