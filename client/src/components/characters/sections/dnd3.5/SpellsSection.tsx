import { Box, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import {
  CLICKABLE_ROW_SX,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ExpandArrow,
  SubsectionTitle,
  type TableColumn,
  ToggleLabel,
  toggleProps,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

import { ScoreBox } from "./ScoreBox.tsx";

interface CollapsibleAptitudeProps {
  apt: AptitudeSpells;
  rulesetId?: string;
}

interface CollapsibleLevelProps {
  group: SpellGroup;
  rulesetId?: string;
}

interface SpellRowItemProps {
  rulesetId?: string;
  spell: SpellGroup["spells"][number];
}

interface SpellsPerDayTableProps {
  spellsPerDay: CharacterDetail["spellsPerDay"];
}

interface SpellsSectionProps {
  rulesetId?: string;
  spellGroups: CharacterDetail["spellGroups"];
  spellsPerDay: CharacterDetail["spellsPerDay"];
}

/** An aptitude's spells, by spell level, as the sheet lists them. */
type AptitudeSpells = CharacterDetail["spellGroups"][number];

/** An aptitude's spells at a spell level. */
type SpellGroup = AptitudeSpells["levels"][number];

/** A cell that keeps to one line */
const NO_WRAP_SX = { whiteSpace: "nowrap" };

/** A spell level's cell: narrow, so a few levels fit */
const LEVEL_CELL_SX = { ...NO_WRAP_SX, px: 1 };

/** The spell levels' headers, smaller, as the skills' number columns */
const LEVEL_HEADERS_SX = {
  "& > thead th": NO_WRAP_SX,
  "& > thead th:not(:first-of-type)": { ...LEVEL_CELL_SX, fontSize: "0.8125rem" },
};

/** What shows on a phone alone: the slots' boxes */
const PHONE_ONLY_SX = { display: { sm: "none" } };

/** A list's slots in boxes, four to a row */
const SLOT_BOXES_SX = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1 };

/** A spell's columns: on a phone, its name leads, its DC at the line's end, its school and save under them */
const SPELL_COLUMNS: TableColumn[] = [
  { key: "name", label: "Name", width: "40%" },
  { key: "school", label: "School", width: "20%" },
  { key: "save", label: "Save", width: "30%" },
  { key: "dc", label: "DC", width: "10%", align: "center" },
];

/** What shows from `sm` up alone: the slots' table */
const WIDE_ONLY_SX = { display: { xs: "none", sm: "block" } };

function CollapsibleAptitude({ apt, rulesetId }: CollapsibleAptitudeProps) {
  const [open, setOpen] = useState(false);
  const totalSpells = apt.levels.reduce((sum, g) => sum + g.spells.length, 0);

  return (
    // The last list, closed, keeps the space its title has to its spells
    <Stack spacing={1} sx={{ "&:last-child": { pb: open ? 0 : 1 } }}>
      <SubsectionTitle>
        <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
          {apt.aptitudeName} ({totalSpells})
        </ToggleLabel>
      </SubsectionTitle>
      <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
        <Stack spacing={1} sx={{ pl: 1 }}>
          {apt.levels.map((group) => (
            <CollapsibleLevel key={group.level} group={group} rulesetId={rulesetId} />
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

function CollapsibleLevel({ group, rulesetId }: CollapsibleLevelProps) {
  const [open, setOpen] = useState(false);
  const label = SPELL_LEVEL_LABELS[group.level];

  return (
    // The last level, closed, keeps the space its title has to its spells
    <Stack spacing={1} sx={{ "&:last-child": { pb: open ? 0 : 1 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
        <SubsectionTitle component="h4">
          <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
            {label} ({group.spells.length})
          </ToggleLabel>
        </SubsectionTitle>
        {group.uses != null && (
          // Italic as the level's label it follows
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            — {group.uses}/day
          </Typography>
        )}
      </Stack>
      <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
        <DataTable size="small" columns={SPELL_COLUMNS}>
          {group.spells.map((spell) => (
            <SpellRowItem key={spell.name} spell={spell} rulesetId={rulesetId} />
          ))}
        </DataTable>
      </Collapse>
    </Stack>
  );
}

function SpellRowItem({ spell, rulesetId }: SpellRowItemProps) {
  const [open, setOpen] = useState(false);

  const detailProps = Object.entries(spell.properties).filter(([key]) => key !== SPELL_SCHOOL);
  const spellLink =
    rulesetId && spell.id ? `/rulesets/${rulesetId}/${buildCustomizationPath("powers", spell.id)}` : undefined;

  return (
    <>
      <DataRow
        {...toggleProps(open, () => setOpen((prev) => !prev), "row")}
        sx={[CLICKABLE_ROW_SX, open && { borderBottom: 0, "& > td": { borderBottom: "none" } }]}
      >
        <DataCell slot="primary" sx={{ fontWeight: 400 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <ExpandArrow open={open} />
            {/* A tag sits twice the row's gap from the name, and from the next tag */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {spellLink ? (
                <MuiLink component={Link} to={spellLink} target="_blank" underline="hover">
                  {spell.name}
                </MuiLink>
              ) : (
                spell.name
              )}
              {spell.tags?.map((tag) => (
                <ValueChip key={tag.name} label={tag.name} color={tag.joinsClassList ? "secondary" : "primary"} />
              ))}
            </Stack>
          </Stack>
        </DataCell>
        <DataCell slot={spell.school ? "inline" : "hidden"}>{spell.school}</DataCell>
        <DataCell slot={spell.save ? "labeled" : "hidden"} label="Save">
          {spell.save}
        </DataCell>
        <DataCell slot={spell.dc != null ? "labeled" : "hidden"} label="DC" align="center">
          {spell.dc ?? <EmptyValue />}
        </DataCell>
      </DataRow>
      {/* Its details, under it while it's open: closed, its row takes no room on a phone */}
      <DataRow>
        <DataCell slot="block" colSpan={4} sx={{ py: 0, borderBottom: open ? undefined : "none" }}>
          <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
            <Stack spacing={1.5} sx={{ py: 1.5, px: 1 }}>
              {detailProps.length > 0 && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
                    gap: 0.5,
                  }}
                >
                  {detailProps.map(([key, value]) => (
                    <Typography key={key} variant="body2" sx={{ color: "text.secondary" }}>
                      <strong>{formatPropertyType(key)}:</strong> {value}
                    </Typography>
                  ))}
                </Box>
              )}
              {spell.description && (
                <Typography variant="body2" sx={{ fontStyle: "italic" }}>
                  {spell.description}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </DataCell>
      </DataRow>
    </>
  );
}

/**
 * The character's slots per day, at the start of its spells: a row per spell list with slots, a column per spell level
 * it has slots at, each cell as the rules write it ("3+1" with a domain or a school slot).
 */
function SpellsPerDayTable({ spellsPerDay }: SpellsPerDayTableProps) {
  return (
    <Stack spacing={1}>
      <SubsectionTitle>Spells per Day</SubsectionTitle>
      {/* On a phone, each list's slots in boxes, as the sheet's armor classes: a row of numbers reads as one */}
      <Stack spacing={2} sx={PHONE_ONLY_SX}>
        {spellsPerDay.lists.map((list) => (
          <Stack key={list.aptitudeName} spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {list.aptitudeName}
            </Typography>
            <Box sx={SLOT_BOXES_SX}>
              {list.slots.map(
                (slots, index) =>
                  slots != null && (
                    <ScoreBox
                      key={spellsPerDay.levels[index]}
                      label={SPELL_LEVEL_LABELS[spellsPerDay.levels[index]]}
                      value={slots}
                      compact
                    />
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
          { key: "list", label: "Spell List" },
          ...spellsPerDay.levels.map((level) => ({
            key: String(level),
            label: SPELL_LEVEL_LABELS[level],
            align: "center" as const,
          })),
        ]}
        sx={LEVEL_HEADERS_SX}
      >
        {spellsPerDay.lists.map((list) => (
          <DataRow key={list.aptitudeName}>
            <DataCell slot="primary" sx={[NO_WRAP_SX, { fontWeight: 500 }]}>
              {list.aptitudeName}
            </DataCell>
            {list.slots.map((slots, index) => (
              <DataCell
                key={spellsPerDay.levels[index]}
                slot={slots == null ? "hidden" : "labeled"}
                label={SPELL_LEVEL_LABELS[spellsPerDay.levels[index]]}
                align="center"
                sx={LEVEL_CELL_SX}
              >
                {slots ?? <EmptyValue />}
              </DataCell>
            ))}
          </DataRow>
        ))}
      </DataTable>
    </Stack>
  );
}

export function SpellsSection({ spellGroups, spellsPerDay, rulesetId }: SpellsSectionProps) {
  if (spellGroups.length === 0 && spellsPerDay.lists.length === 0) return null;

  return (
    <SheetSection title="Spells">
      <Stack spacing={3}>
        {spellsPerDay.lists.length > 0 && <SpellsPerDayTable spellsPerDay={spellsPerDay} />}
        {spellGroups.map((apt) => (
          <CollapsibleAptitude key={apt.aptitudeName} apt={apt} rulesetId={rulesetId} />
        ))}
      </Stack>
    </SheetSection>
  );
}
