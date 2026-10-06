import type { Session } from "@/shared/relations.ts";

/**
 * Any signed-in session reads the record's attachments: avatars and portraits are display assets meant to be visible
 * to signed-in users, and the URL adds no exposure beyond the page (a share token gates that).
 */
export async function canAnySessionRead(_session: Session, _recordId: string): Promise<boolean> {
  return true;
}
