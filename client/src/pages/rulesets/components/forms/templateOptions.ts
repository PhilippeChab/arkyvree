/**
 * A template select's options, once its type's templates load (`templates`; none before, as a value with no option is
 * out of range): those templates, and the one the form holds (`held`) when it isn't one of them, a template of another
 * type, which the item's save refuses, so the select shows it and picking "None" clears it. Its name is the one the
 * item was saved with (`heldName`).
 */
export function templateOptions(
  templates: readonly { id: string; name: string }[] | undefined,
  held: unknown,
  heldName: string | null | undefined,
) {
  if (!templates) return [];
  const options = templates.map((template) => ({ value: template.id, label: template.name }));
  if (typeof held !== "string" || !held || options.some((option) => option.value === held)) return options;
  return [...options, { value: held, label: `${heldName ?? "Template"} (of another type)`, disabled: true }];
}
