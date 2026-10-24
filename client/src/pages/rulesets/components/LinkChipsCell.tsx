import { Stack } from "@mui/material";

import { EmptyValue, ValueChip } from "@/client/src/components/common/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { byName } from "./byName.ts";

interface LinkChipsCellProps {
  /** An entity's links, as its list includes them (a spell's to its spell lists). */
  links: unknown[] | undefined;
  /** Where a link holds the entity it links to (`aptitudesInRule`). */
  target: string | undefined;
}

/** A link's entity: its id and name, "Unknown" where it has none. */
function linkedOf(link: unknown, index: number, target: string | undefined) {
  const linked = isRecord(link) && target ? link[target] : undefined;
  const id = isRecord(linked) && typeof linked.id === "string" ? linked.id : String(index);
  const name = isRecord(linked) && typeof linked.name === "string" && linked.name ? linked.name : "Unknown";
  return { id, name };
}

/**
 * A section table's pools column: a chip per entity an entity links to, by name, as the books list a spell's classes,
 * or a dash.
 */
export function LinkChipsCell({ links, target }: LinkChipsCellProps) {
  if (!links?.length) return <EmptyValue />;

  const linked = links.map((link, index) => linkedOf(link, index, target));
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {linked.toSorted(byName).map((entity) => (
        <ValueChip key={entity.id} label={entity.name} />
      ))}
    </Stack>
  );
}
