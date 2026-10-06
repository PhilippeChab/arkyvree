import type { Tag } from "@/client/src/components/common/index.ts";

/** How much of a pick's description its tooltip shows */
const PREVIEW_LENGTH = 200;

/** A feat or a spell a level picked: its name, the start of its description on hover, and a way to drop it. */
export function pickTag(pick: { name: string; description?: string | null }, onDelete: () => void): Tag {
  const { description } = pick;
  const preview =
    description && description.length > PREVIEW_LENGTH ? `${description.slice(0, PREVIEW_LENGTH)}…` : description;
  return { label: pick.name, color: "primary", tooltip: preview || undefined, onDelete };
}
