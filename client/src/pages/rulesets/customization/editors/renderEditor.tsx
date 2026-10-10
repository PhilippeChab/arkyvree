/** The entities the customization page edits, which it can delete too: their editor of their details, and its props. */

import type { ComponentType } from "react";

import type {
  ClassLevel,
  CustomizationEntity,
  Item,
  Power,
} from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import { ClassLevelEditor, ItemEditor, SpellEditor } from "./dnd3.5/index.ts";
import { FeatEditor } from "./FeatEditor.tsx";
import { RaceEditor } from "./RaceEditor.tsx";

/** The editors of the entities that are a base rules' own: its class levels, its items and its powers (3.5's spells). */
interface RulesetEditors {
  ClassLevelEditor: ComponentType<EditorProps<ClassLevel>>;
  ItemEditor: ComponentType<EditorProps<Item>>;
  PowersEditor: ComponentType<EditorProps<Power>>;
}

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

export type EditableEntity = Extract<CustomizationEntity, { type: (typeof EDITABLE_TYPES)[number] }>;

/** The entity types with an editor on the customization page */
const EDITABLE_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;

const RULESET_EDITORS: Record<BaseRules, RulesetEditors> = {
  "Dungeons & Dragons: 3.5": { ClassLevelEditor, ItemEditor, PowersEditor: SpellEditor },
};

export function isEditable(data: CustomizationEntity): data is EditableEntity {
  return isOneOf(data.type, EDITABLE_TYPES);
}

/** An entity's editor, by its type, and by its ruleset's base rules for an entity that is theirs */
export function renderEditor(data: EditableEntity, baseRules: BaseRules, props: Omit<EditorProps<unknown>, "entity">) {
  const editors = RULESET_EDITORS[baseRules];
  switch (data.type) {
    case "feats":
      return <FeatEditor {...props} entity={data.entity} />;
    case "races":
      return <RaceEditor {...props} entity={data.entity} />;
    case "items":
      return <editors.ItemEditor {...props} entity={data.entity} />;
    case "powers":
      return <editors.PowersEditor {...props} entity={data.entity} />;
    case "klass_levels":
      return <editors.ClassLevelEditor {...props} entity={data.entity} />;
    default:
      return data satisfies never;
  }
}
