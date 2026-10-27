import { Engine, type FieldValue, type FieldWrite, type StorageEngine } from "@/engine/index.ts";

/**
 * A field's write (`write`: an owner's field, of the owner's type, an entity type, `rulesets` or `characters`, as a
 * write gives it) as its rows' columns, one a value, in its order: its declared kind's column, its place in a set
 * (`ordinal`, 0 to n-1; a single field's 0), a number kept to its declared places, by the modules' declarations
 * (`storage`: every registered module's, unless a test gives its own). Refused for a field no module declares, a value
 * of another kind, or several values of a single field. None for none: a write that clears it.
 */
export function toFieldRows(type: string, field: string, write: FieldWrite, storage: StorageEngine = Engine.storage()) {
  const def = storage.field(type, field);
  if (!def) throw new Error(`No module declares the field ${field} of ${type}`);
  const values: readonly FieldValue[] = write === null ? [] : Array.isArray(write) ? write : [write as FieldValue];
  if (!def.multiple && values.length > 1) throw new Error(`The field ${field} of ${type} holds one value`);
  return values.map((value, ordinal) => {
    const fits =
      def.valueKind === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : typeof value === (def.valueKind === "flag" ? "boolean" : "string");
    if (!fits) throw new Error(`${field} holds a ${def.valueKind}: ${String(value)} isn't one`);
    return {
      field,
      ordinal,
      valueKind: def.valueKind,
      multiple: def.multiple,
      textValue: def.valueKind === "text" ? (value as string) : null,
      numberValue: def.valueKind === "number" ? storage.storedNumber(type, field, value) : null,
      flagValue: def.valueKind === "flag" ? (value as boolean) : null,
    };
  });
}
