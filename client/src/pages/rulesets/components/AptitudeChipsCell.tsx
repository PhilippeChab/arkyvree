import { Stack } from "@mui/material";

import { EmptyValue, ValueChip } from "@/client/src/components/common/index.ts";

import { byName } from "./useAptitudeLookup.ts";

interface AptitudeChipsCellProps {
  links: AptitudeLink[] | null | undefined;
}

/** An entity's link to an aptitude, as the feats and spells lists include it. */
interface AptitudeLink {
  aptitudeId: string;
  aptitudesInRule?: { name: string } | null;
}

/** A section table's aptitudes column: a chip per aptitude, by name, as the books list a spell's classes, or a dash. */
export function AptitudeChipsCell({ links }: AptitudeChipsCellProps) {
  if (!links?.length) return <EmptyValue />;

  const aptitudes = links.map((link) => ({ id: link.aptitudeId, name: link.aptitudesInRule?.name || "Unknown" }));
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
      {aptitudes.toSorted(byName).map((aptitude) => (
        <ValueChip key={aptitude.id} label={aptitude.name} />
      ))}
    </Stack>
  );
}
