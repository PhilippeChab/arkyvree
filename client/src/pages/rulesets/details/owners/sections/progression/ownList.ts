import { isRecord } from "@/shared/isRecord.ts";

/**
 * An owner's own list, as its progression's answer gives it (at its rules' `counts.ownList`): its id, none while its
 * ruleset has no such list, which its first add or its create makes, and its name ("Witch Spells").
 */
export function readOwnList(value: unknown): { id: string | null; name: string } | undefined {
  if (!isRecord(value) || typeof value.name !== "string") return undefined;
  return { id: typeof value.id === "string" ? value.id : null, name: value.name };
}
