import { Box, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  BlankNote,
  CLICKABLE_ROW_SX,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ExpandArrow,
  SubsectionTitle,
  ToggleLabel,
  toggleProps,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { useCustomizationPages } from "@/client/src/hooks/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";

import { BlockCell } from "./BlockTable.tsx";
import { ScoreBox } from "./ScoreBox.tsx";
import { type BlockOf, entityPagePath, type SheetColumn, splitNameColumn } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";

interface CountsTableProps {
  counts: NonNullable<BlockOf<"pools">["counts"]>;
}

interface PoolEntryRowProps {
  columns: SheetColumn[];
  entityType: string;
  entry: PoolTier["entries"][number];
  rulesetId?: string;
}

interface PoolsSectionProps {
  block: BlockOf<"pools">;
  rulesetId?: string;
}

interface PoolTierProps {
  columns: SheetColumn[];
  entityType: string;
  rulesetId?: string;
  tier: PoolTier;
}

interface PoolViewProps {
  columns: SheetColumn[];
  entityType: string;
  pool: SheetPool;
  rulesetId?: string;
}

/** A tier of a pool: its label, its note and its entries. */
type PoolTier = SheetPool["tiers"][number];

/** A pool of a `pools` block: its name and its tiers. */
type SheetPool = BlockOf<"pools">["pools"][number];

/** A pool's counts in boxes, four to a row */
const COUNT_BOXES_SX = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1 };

/** A cell that keeps to one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/** What shows on a phone alone: the counts' boxes */
const PHONE_ONLY_SX = { display: { sm: "none" } };

/** A tier's cell: narrow, so a few tiers fit */
const TIER_CELL_SX = { ...NO_WRAP_SX, px: 1 };

/** The tiers' headers, smaller, as a fixed table's number columns */
const TIER_HEADERS_SX = {
  "& > thead th": NO_WRAP_SX,
  "& > thead th:not(:first-of-type)": { ...TIER_CELL_SX, fontSize: "0.8125rem" },
};

/** What shows from `sm` up alone: the counts' table */
const WIDE_ONLY_SX = { display: { xs: "none", sm: "block" } };

/**
 * The counts each pool's tiers allow, at the start of the block (3.5's slots per day): a row per pool, a column per
 * tier, each cell as the rules write it ("3+1"); on a phone, each pool's counts in boxes, as the sheet's armor classes.
 */
function CountsTable({ counts }: CountsTableProps) {
  return (
    <Stack spacing={1}>
      <SubsectionTitle>{counts.title}</SubsectionTitle>
      {/* On a phone, each list's counts in boxes: a row of numbers reads as one */}
      <Stack spacing={2} sx={PHONE_ONLY_SX}>
        {counts.lists.map((list) => (
          <Stack key={list.name} spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {list.name}
            </Typography>
            <Box sx={COUNT_BOXES_SX}>
              {list.counts.map(
                (count, index) =>
                  count != null && (
                    <ScoreBox key={counts.tiers[index]} label={counts.tiers[index]} value={count} compact />
                  ),
              )}
            </Box>
          </Stack>
        ))}
      </Stack>
      <DataTable
        size="small"
        containerSx={WIDE_ONLY_SX}
        columns={[
          { key: "list", label: counts.corner },
          ...counts.tiers.map((tier) => ({ key: tier, label: tier, align: "center" as const })),
        ]}
        sx={TIER_HEADERS_SX}
      >
        {counts.lists.map((list) => (
          <DataRow key={list.name}>
            <DataCell slot="primary" sx={[NO_WRAP_SX, { fontWeight: 500 }]}>
              {list.name}
            </DataCell>
            {list.counts.map((count, index) => (
              <DataCell
                key={counts.tiers[index]}
                slot={count == null ? "hidden" : "labeled"}
                label={counts.tiers[index]}
                align="center"
                sx={TIER_CELL_SX}
              >
                {count ?? <EmptyValue />}
              </DataCell>
            ))}
          </DataRow>
        ))}
      </DataTable>
    </Stack>
  );
}

/**
 * An entry's row, which opens its details under it: its name, a link to its page in the ruleset, and its tags, then
 * its other cells as its block's columns lay them out; open, its details' lines and its description.
 */
function PoolEntryRow({ columns, entityType, entry, rulesetId }: PoolEntryRowProps) {
  const [open, setOpen] = useState(false);
  const { name: nameColumn, others } = splitNameColumn(columns);
  const name = entry.cells[nameColumn.key] ?? "";
  const link = entityPagePath(rulesetId, entityType, entry.id, useCustomizationPages());

  return (
    <>
      <DataRow
        {...toggleProps(open, () => setOpen((prev) => !prev), "row")}
        // Open, it runs on into its details at every width (a breakpoint's value outranks a phone's row's own divider)
        sx={[CLICKABLE_ROW_SX, open && { borderBottom: { xs: 0 }, "& > td": { borderBottom: "none" } }]}
      >
        <DataCell slot="primary">
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <ExpandArrow open={open} />
            {/* A tag sits twice the row's gap from the name, and from the next tag */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {link ? (
                <MuiLink component={Link} to={link} target="_blank" underline="hover">
                  {name}
                </MuiLink>
              ) : (
                name
              )}
              {entry.tags.map((tag) => (
                <ValueChip key={tag.name} label={tag.name} color={tag.tone} />
              ))}
            </Stack>
          </Stack>
        </DataCell>
        {others.map((column) => (
          <BlockCell key={column.key} column={column} value={entry.cells[column.key] ?? ""} />
        ))}
      </DataRow>
      {/* Its details, under it while it's open: closed, its row takes no room on a phone */}
      <DataRow>
        <DataCell slot="block" colSpan={columns.length} sx={{ py: 0, borderBottom: open ? undefined : "none" }}>
          <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
            <Stack spacing={1.5} sx={{ py: 1.5, px: 1 }}>
              {entry.details.length > 0 && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
                    gap: 0.5,
                  }}
                >
                  {entry.details.map(({ label, value }) => (
                    <Typography key={label} variant="body2" sx={{ color: "text.secondary" }}>
                      <strong>{label}:</strong> {value}
                    </Typography>
                  ))}
                </Box>
              )}
              {entry.description && (
                <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                  {entry.description}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </DataCell>
      </DataRow>
    </>
  );
}

/** A tier of a pool, to open: its label and its entries' count, its note after it ("3/day"), then its entries. */
function PoolTierView({ columns, entityType, rulesetId, tier }: PoolTierProps) {
  const [open, setOpen] = useState(false);
  const { name, others } = splitNameColumn(columns);
  const laidOut = [name, ...others];

  return (
    // The last tier, closed, keeps the space its title has to its entries
    <Stack spacing={1} sx={{ "&:last-child": { pb: open ? 0 : 1 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <SubsectionTitle component="h4">
          <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
            {tier.label} ({tier.entries.length})
          </ToggleLabel>
        </SubsectionTitle>
        {tier.note && (
          // Italic as the tier's label it follows
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            — {tier.note}
          </Typography>
        )}
      </Stack>
      <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
        <DataTable size="small" columns={laidOut.map(({ key, label, width, align }) => ({ key, label, width, align }))}>
          {tier.entries.map((entry) => (
            <PoolEntryRow
              key={entry.key}
              columns={columns}
              entityType={entityType}
              entry={entry}
              rulesetId={rulesetId}
            />
          ))}
        </DataTable>
      </Collapse>
    </Stack>
  );
}

/** A pool, to open: its name and its entries' count, then its tiers. */
function PoolView({ columns, entityType, pool, rulesetId }: PoolViewProps) {
  const [open, setOpen] = useState(false);
  const total = pool.tiers.reduce((sum, tier) => sum + tier.entries.length, 0);

  return (
    // The last pool, closed, keeps the space its title has to its entries
    <Stack spacing={1} sx={{ "&:last-child": { pb: open ? 0 : 1 } }}>
      <SubsectionTitle>
        <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
          {pool.name} ({total})
        </ToggleLabel>
      </SubsectionTitle>
      <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
        <Stack spacing={1} sx={{ pl: 1 }}>
          {pool.tiers.map((tier) => (
            <PoolTierView key={tier.key} columns={columns} entityType={entityType} rulesetId={rulesetId} tier={tier} />
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

/**
 * A `pools` block: the counts its pools' tiers allow, then each pool (3.5's spells, per day and known); with neither,
 * what it says of none.
 */
export function PoolsSection({ block, rulesetId }: PoolsSectionProps) {
  return (
    <SheetSection title={block.title}>
      {!block.counts && block.pools.length === 0 ? (
        <BlankNote>{block.empty}</BlankNote>
      ) : (
        <Stack spacing={3}>
          {block.counts && <CountsTable counts={block.counts} />}
          {block.pools.map((pool) => (
            <PoolView
              key={pool.key}
              columns={block.columns}
              entityType={block.entityType}
              pool={pool}
              rulesetId={rulesetId}
            />
          ))}
        </Stack>
      )}
    </SheetSection>
  );
}
