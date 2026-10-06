import { Stack, Typography } from "@mui/material";

import { TagChip } from "@/client/src/components/common/index.ts";

import { aptitudeTag } from "./entityTags.ts";

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
  if (!links?.length) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
      {links.toSorted(byListName).map((link) => (
        <TagChip key={link.aptitudeId} tag={aptitudeTag(link.aptitudesInRule?.name || "Unknown")} />
      ))}
    </Stack>
  );
}
