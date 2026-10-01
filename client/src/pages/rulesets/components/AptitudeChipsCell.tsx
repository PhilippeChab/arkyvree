import { Box, Chip, Typography } from "@mui/material";

/** An entity's link to an aptitude, as the feats and spells lists include it. */
interface AptitudeLink {
  aptitudeId: string;
  aptitudesInRule?: { name: string } | null;
}

/** A section table's aptitudes column: a chip per aptitude, or a dash. */
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
      {links.map((link) => (
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
