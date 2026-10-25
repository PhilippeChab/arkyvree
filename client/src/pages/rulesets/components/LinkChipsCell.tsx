import { Stack } from "@mui/material";

import { EmptyValue, ValueChip } from "@/client/src/components/common/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { byName } from "./byName.ts";

interface LinkChipsCellProps {
  /** An entity's links, as its list includes them (a spell's to its spell lists, and its others). */
  links: unknown[] | undefined;
  /** The role of the links it shows (`listedIn`). */
  role: string | undefined;
}

/** A link's entity, of a role (`role`): its id and name, "Unknown" where it has none; none for a link of another role. */
function linkedOf(link: unknown, index: number, role: string | undefined) {
  if (!isRecord(link) || link.role !== role) return [];
  const id = typeof link.toId === "string" ? link.toId : String(index);
  const name = typeof link.toName === "string" && link.toName ? link.toName : "Unknown";
  return [{ id, name }];
}

/**
 * A section table's pools column: a chip per entity an entity links to by a role, by name, as the books list a spell's
 * classes, or a dash.
 */
export function LinkChipsCell({ links, role }: LinkChipsCellProps) {
  const linked = (links ?? []).flatMap((link, index) => linkedOf(link, index, role));
  if (linked.length === 0) return <EmptyValue />;

  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {linked.toSorted(byName).map((entity) => (
        <ValueChip key={entity.id} label={entity.name} />
      ))}
    </Stack>
  );
}
