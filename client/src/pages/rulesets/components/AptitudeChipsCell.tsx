import { Box, Chip, Typography } from "@mui/material";

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
export function AptitudeChipsCell({ links }: { links: AptitudeLink[] | null | undefined }) {
  if (!links?.length) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        —
      </Typography>
    );
  }
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      {links.toSorted(byListName).map((link) => (
        <Chip
          key={link.aptitudeId}
          label={link.aptitudesInRule?.name || "Unknown"}
          size="small"
          color="primary"
          variant="outlined"
        />
      ))}
    </Box>
  );
}
