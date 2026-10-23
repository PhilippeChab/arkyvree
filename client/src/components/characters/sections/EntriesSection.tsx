import { Box, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import { BlankNote, EmptyValue, SubsectionTitle, ToggleLabel } from "@/client/src/components/common/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";

import { EntryTitle } from "./EntryTitle.tsx";
import { type BlockOf, entityPagePath, type SheetEntry } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";
import { SubsheetView } from "./SubsheetView.tsx";

interface EntriesSectionProps {
  block: BlockOf<"entries">;
  rulesetId?: string;
  /** A creature an entry bonds links to its sheet: the owner's view. */
  subsheetsLinkable: boolean;
}

interface EntryRowProps {
  /** Its heading's level: `h4` under the granted entries' heading. */
  component?: "h3" | "h4";
  entityType: string;
  entry: SheetEntry;
  extra?: ReactNode;
  rulesetId?: string;
}

interface GrantedEntriesProps {
  entityType: string;
  granted: NonNullable<BlockOf<"entries">["granted"]>;
  rulesetId?: string;
}

/**
 * An entry on the sheet: its name (with its count when it's held more than once, "(x2)"), a link to its page in the
 * ruleset, over its description, and its details to open.
 */
function EntryRow({ entry, entityType, rulesetId, extra, component }: EntryRowProps) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;
  const label = entry.count !== undefined ? `${entry.name} (x${entry.count})` : entry.name;
  const path = entityPagePath(rulesetId, entityType, entry.id);
  const name = path ? (
    <MuiLink component={Link} to={path} target="_blank" underline="hover">
      {label}
    </MuiLink>
  ) : (
    label
  );

  return (
    // Without details, the bar runs a little past the description
    <Stack spacing={1} sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2, pb: hasExtra ? 0 : 1 }}>
      <Box>
        <EntryTitle component={component}>
          {hasExtra ? (
            <ToggleLabel open={open} onToggle={() => setOpen((p) => !p)} label={`${label} Details`}>
              {name}
            </ToggleLabel>
          ) : (
            name
          )}
        </EntryTitle>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {entry.description || <EmptyValue />}
        </Typography>
      </Box>
      {hasExtra && (
        // Mounted while closed: the space above it stays, as the details open and close within it
        <Collapse in={open} timeout={DURATION.normal}>
          <Box sx={{ pt: 1.5 }}>{extra}</Box>
        </Collapse>
      )}
    </Stack>
  );
}

function GrantedEntries({ granted, entityType, rulesetId }: GrantedEntriesProps) {
  const [open, setOpen] = useState(false);

  return (
    <Stack spacing={1}>
      <SubsectionTitle>
        <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
          {granted.label} ({granted.entries.length})
        </ToggleLabel>
      </SubsectionTitle>
      {/* Mounted while closed: the space above it stays, as the list opens and closes within it */}
      <Collapse in={open} timeout={DURATION.normal}>
        <Stack spacing={3}>
          {granted.entries.map((entry) => (
            <EntryRow key={entry.key} entry={entry} entityType={entityType} rulesetId={rulesetId} component="h4" />
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

/**
 * An `entries` block: the entities the character holds (3.5's feats and special abilities), each with the creature it
 * bonds in its details, then those granted apart, under their heading, to open.
 */
export function EntriesSection({ block, rulesetId, subsheetsLinkable }: EntriesSectionProps) {
  const { entityType, granted } = block;

  return (
    <SheetSection title={block.title}>
      {block.entries.length > 0 || granted ? (
        <Stack spacing={3}>
          {block.entries.map((entry) => (
            <EntryRow
              key={entry.key}
              entry={entry}
              entityType={entityType}
              rulesetId={rulesetId}
              extra={entry.subsheet && <SubsheetView subsheet={entry.subsheet} linkable={subsheetsLinkable} />}
            />
          ))}
          {granted && <GrantedEntries granted={granted} entityType={entityType} rulesetId={rulesetId} />}
        </Stack>
      ) : (
        <BlankNote>{block.empty}</BlankNote>
      )}
    </SheetSection>
  );
}
