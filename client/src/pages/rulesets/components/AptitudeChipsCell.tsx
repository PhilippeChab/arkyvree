import { Chip, Stack } from "@mui/material";

import { EmptyValue } from "@/client/src/components/common/index.ts";

interface AptitudeChipsCellProps {
  links: AptitudeLink[] | null | undefined;
}

/** An entity's link to an aptitude, as the feats and spells lists include it. */
interface AptitudeLink {
  aptitudeId: string;
  aptitudesInRule?: { name: string } | null;
}

/** Two links by their lists' names, as the books list a spell's classes. */
function byListName(a: AptitudeLink, b: AptitudeLink) {
  return (a.aptitudesInRule?.name ?? "").localeCompare(b.aptitudesInRule?.name ?? "");
}

/** A section table's aptitudes column: a chip per aptitude, by name, or a dash. */
export function AptitudeChipsCell({ links }: AptitudeChipsCellProps) {
  if (!links?.length) return <EmptyValue />;

  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {links.toSorted(byListName).map((link) => (
        <Chip
          key={link.aptitudeId}
          label={link.aptitudesInRule?.name || "Unknown"}
          size="small"
          color="primary"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}
