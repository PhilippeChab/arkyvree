import {
  Box,
  Collapse,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CLICKABLE_SX, ExpandArrow, Section, TagChip, toggleProps } from "@/client/src/components/common/index.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { type AptitudeSpells, buildSpellGroups, type SpellGroup, type SpellRow } from "@/shared/dnd3.5/spellGroups.ts";

import type { Dnd35PowersSectionProps } from "./types.ts";

interface CollapsibleClassProps {
  apt: AptitudeSpells;
  rulesetId?: string;
}

interface CollapsibleLevelProps {
  group: SpellGroup;
  rulesetId?: string;
}

interface SpellRowItemProps {
  spell: SpellRow;
  rulesetId?: string;
}

function CollapsibleClass({ apt, rulesetId }: CollapsibleClassProps) {
  const [open, setOpen] = useState(false);
  const totalSpells = apt.levels.reduce((sum, g) => sum + g.spells.length, 0);

  return (
    <Stack spacing={1}>
      <Stack
        {...toggleProps(open, () => setOpen((prev) => !prev))}
        direction="row"
        spacing={0.5}
        sx={{ alignItems: "center", ...CLICKABLE_SX }}
      >
        <ExpandArrow open={open} />
        <Typography component="h3" variant="h6">
          {apt.aptitudeName} ({totalSpells})
        </Typography>
      </Stack>
      <Collapse in={open} unmountOnExit>
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
  const label = group.level === 0 ? "Cantrips" : `Level ${group.level}`;

  return (
    <Stack spacing={1}>
      <Stack
        {...toggleProps(open, () => setOpen((prev) => !prev))}
        direction="row"
        spacing={0.5}
        sx={{ alignItems: "center", ...CLICKABLE_SX }}
      >
        <ExpandArrow open={open} />
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography component="h4" variant="subtitle1">
            {label} ({group.spells.length})
          </Typography>
          {group.uses != null && (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              — {group.uses}/day
            </Typography>
          )}
        </Stack>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <colgroup>
              <Box component="col" sx={{ width: "40%" }} />
              <Box component="col" sx={{ width: "20%" }} />
              <Box component="col" sx={{ width: "30%" }} />
              <Box component="col" sx={{ width: "10%" }} />
            </colgroup>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>School</TableCell>
                <TableCell>Save</TableCell>
                <TableCell align="center">DC</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.spells.map((spell) => (
                <SpellRowItem key={spell.name} spell={spell} rulesetId={rulesetId} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Collapse>
    </Stack>
  );
}

function SpellRowItem({ spell, rulesetId }: SpellRowItemProps) {
  const [open, setOpen] = useState(false);

  const detailProps = Object.entries(spell.properties).filter(([key]) => key !== SPELL_SCHOOL);
  const spellLink = rulesetId && spell.id ? `/rulesets/${rulesetId}/powers/${spell.id}/customization` : undefined;

  return (
    <Fragment>
      <TableRow
        hover
        {...toggleProps(open, () => setOpen((prev) => !prev), "row")}
        sx={{ ...CLICKABLE_SX, "& > td": { borderBottom: open ? "none" : undefined } }}
      >
        <TableCell>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <ExpandArrow open={open} />
            {spellLink ? (
              <MuiLink
                component={Link}
                to={spellLink}
                target="_blank"
                underline="hover"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {spell.name}
              </MuiLink>
            ) : (
              spell.name
            )}
            {spell.tags?.map((tag) => (
              <TagChip key={tag.name} tag={{ label: tag.name, color: tag.joinsClassList ? "secondary" : "primary" }} />
            ))}
          </Stack>
        </TableCell>
        <TableCell>{spell.school}</TableCell>
        <TableCell>{spell.save}</TableCell>
        <TableCell align="center">{spell.dc ?? "—"}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: open ? undefined : "none" }}>
          <Collapse in={open} unmountOnExit>
            <Stack spacing={1} sx={{ py: 1.5, px: 1 }}>
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
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

export function SpellsSection({
  classes,
  powers,
  virtualPowers,
  aptitudes,
  spellTags,
  spellTagLists,
  rulesetId,
}: Dnd35PowersSectionProps) {
  const groups = useMemo(
    () => buildSpellGroups({ classes, powers, virtualPowers, aptitudes, spellTags, spellTagLists }),
    [classes, powers, virtualPowers, aptitudes, spellTags, spellTagLists],
  );

  if (groups.length === 0) return null;

  return (
    <Section title="Spells">
      {groups.map((apt) => (
        <CollapsibleClass key={apt.aptitudeName} apt={apt} rulesetId={rulesetId} />
      ))}
    </Section>
  );
}
