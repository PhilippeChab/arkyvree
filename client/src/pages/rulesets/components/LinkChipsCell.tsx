import { Stack } from "@mui/material";

import { EmptyValue, ValueChip } from "@/client/src/components/common/index.ts";

import { byName } from "./byName.ts";
import { ownLinksOf } from "./forms/index.ts";

interface LinkChipsCellProps {
  /** The listed entity, as its list's endpoint sends it, its links among them (a spell's to its spell lists). */
  entity: object;
  /** The role of the links it shows (`listedIn`). */
  role: string | undefined;
}

/** A link's entity: its id and name, "Unknown" where it has none. */
function linkedOf(link: Record<string, unknown>, index: number) {
  const id = typeof link.toId === "string" ? link.toId : String(index);
  const name = typeof link.toName === "string" && link.toName ? link.toName : "Unknown";
  return { id, name };
}

/**
 * A section table's pools column: a chip per entity an entity links to by a role, by name, as the books list a spell's
 * classes, or a dash.
 */
export function LinkChipsCell({ entity, role }: LinkChipsCellProps) {
  const linked = role === undefined ? [] : ownLinksOf(entity, role).map(linkedOf);
  if (linked.length === 0) return <EmptyValue />;

  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {linked.toSorted(byName).map((entity) => (
        <ValueChip key={entity.id} label={entity.name} />
      ))}
    </Stack>
  );
}
