import { Typography } from "@mui/material";

/** A section table's description column: secondary text clamped to two lines. */
export function DescriptionCell({ text }: { text: string | null | undefined }) {
  return (
    <Typography
      variant="body2"
      sx={{
        color: "text.secondary",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}
    >
      {text || "—"}
    </Typography>
  );
}
