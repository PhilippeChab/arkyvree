import { NotFoundError } from "@/server/errors/index.ts";

/** Use copy-time identity mappings; equal customization values aren't unique. */
export function resolveCustomizationId(
  entityId: string,
  resolvedEntityId: string,
  customizationId: string,
  copiedIds: ReadonlyMap<string, string>,
  kind: "property" | "requirement",
): string {
  if (resolvedEntityId === entityId) return customizationId;
  const copiedId = copiedIds.get(customizationId);
  if (!copiedId) throw new NotFoundError(`Copied ${kind} not found`);
  return copiedId;
}
