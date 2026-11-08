import { Box, Stack, Typography } from "@mui/material";
import { type ReactNode } from "react";

import { SubsectionTitle, ValueChip } from "@/client/src/components/common/index.ts";

import { ScoreBox } from "./ScoreBox.tsx";
import { ScoreTile } from "./ScoreTile.tsx";
import { openingBlock, type SheetBlock, type SheetField } from "./sheetBlocks.ts";

interface BoxRowProps {
  children: ReactNode;
}

interface CompactBlockProps {
  block: SheetBlock;
}

interface CompactSheetProps {
  /** The sheet's blocks, as the engine describes them: a partly seen character's, its identity's alone. */
  blocks: readonly SheetBlock[];
}

/**
 * A compact box in its row: as wide as its label on one line ("Flat-footed") and its value, and at least a third of a
 * phone's card (abilities three to a row) or, from a tablet's width, a sixth of a wider one's (six to a row); never
 * stretched across what its row leaves.
 */
const BOX_SX = { flex: "0 0 auto", minWidth: { xs: 72, sm: 56 } } as const;

/** A row of compact boxes, wrapping onto the next line where the card's width holds no more. */
function BoxRow({ children }: BoxRowProps) {
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      {children}
    </Stack>
  );
}

/**
 * A block of the sheet, in brief: its scores in compact boxes; its stats' line, then its first panel's boxes, each a
 * row of them (3.5's combat, then its first weapon set's armor class); its entries' names.
 */
function CompactBlock({ block }: CompactBlockProps) {
  if (block.kind === "scores") {
    return (
      <Stack spacing={1}>
        <SubsectionTitle>{block.title}</SubsectionTitle>
        <BoxRow>
          {block.scores.map((score) => (
            <ScoreTile key={score.key} score={score} compact sx={BOX_SX} />
          ))}
        </BoxRow>
      </Stack>
    );
  }
  if (block.kind === "stats") {
    const rows = [
      { key: "line", stats: block.stats },
      { key: "boxes", stats: block.panels[0]?.boxes ?? [] },
    ].filter(({ stats }) => stats.length > 0);
    return (
      <Stack spacing={1}>
        <SubsectionTitle>{block.title}</SubsectionTitle>
        {rows.map(({ key, stats }) => (
          <BoxRow key={key}>
            {stats.map(({ label, value }) => (
              <ScoreBox key={label} label={label} value={value} compact sx={BOX_SX} />
            ))}
          </BoxRow>
        ))}
      </Stack>
    );
  }
  if (block.kind === "entries" && block.entries.length > 0) {
    return (
      <Stack spacing={1}>
        <SubsectionTitle>{block.title}</SubsectionTitle>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {block.entries.map((entry) => (
            <ValueChip
              key={entry.key}
              color="default"
              label={entry.count === undefined ? entry.name : `${entry.name} (x${entry.count})`}
            />
          ))}
        </Stack>
      </Stack>
    );
  }
  return null;
}

/** A field that holds a value: a number, an option or a text, none of them empty. */
function isFilled(field: SheetField) {
  return field.value !== null && field.value !== "";
}

/**
 * A character's sheet in brief, as a card shows it among others: its identity's facts that hold a value, each its label
 * and its value, then its scores and its stats in compact boxes and its entries' names, in its blocks' order. Its
 * tables, pools and inventory are its sheet's alone, and so is everything of a partly seen character but its identity.
 */
export function CompactSheet({ blocks }: CompactSheetProps) {
  const facts = openingBlock(blocks)?.lines.flat().filter(isFilled) ?? [];

  return (
    <Stack spacing={2.5}>
      {facts.length > 0 && (
        <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", columnGap: 2.5, rowGap: 0.5 }}>
          {facts.map((field) => (
            // A fact keeps to one line, its label before its value, cut short where the card is narrower
            <Box
              key={field.key}
              sx={{ whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
                {`${field.label} `}
              </Typography>
              <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>
                {field.value}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
      {blocks.map((block) => (
        <CompactBlock key={block.key} block={block} />
      ))}
    </Stack>
  );
}
