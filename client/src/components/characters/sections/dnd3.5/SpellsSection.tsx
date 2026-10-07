import {
  Box,
  Chip,
  Collapse,
  IconButton,
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
import { type MouseEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { CLICKABLE_SX, clickableProps } from "@/client/src/components/common/index.ts";
import { ExpandLessIcon, ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
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
    // The last class, closed, keeps the space its title has to its spells
    <Stack spacing={1} sx={{ "&:last-child": { pb: open ? 0 : 1 } }}>
      <Stack
        direction="row"
        spacing={0.5}
        {...clickableProps(() => setOpen((prev) => !prev))}
        sx={[CLICKABLE_SX, { alignItems: "center" }]}
      >
        <IconButton size="small" aria-label={apt.aptitudeName} aria-expanded={open} sx={{ p: 0 }}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
          {apt.aptitudeName} ({totalSpells})
        </Typography>
      </Stack>
      <Collapse in={open} timeout="auto" unmountOnExit>
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
    // The last level, closed, keeps the space its title has to its spells
    <Stack spacing={0.5} sx={{ "&:last-child": { pb: open ? 0 : 0.5 } }}>
      <Stack
        direction="row"
        spacing={0.5}
        {...clickableProps(() => setOpen((prev) => !prev))}
        sx={[CLICKABLE_SX, { alignItems: "center" }]}
      >
        <IconButton size="small" aria-label={`${label} spells`} aria-expanded={open} sx={{ p: 0 }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 600 }}>
            {label} ({group.spells.length})
          </Typography>
          {group.uses != null && (
            // Italic as the level's label it follows
            <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
              — {group.uses}/day
            </Typography>
          )}
        </Stack>
      </Stack>
      <Collapse in={open} timeout="auto" unmountOnExit>
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
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>School</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Save</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  DC
                </TableCell>
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
    <>
      <TableRow
        hover
        {...clickableProps(() => setOpen((prev) => !prev))}
        sx={{ ...CLICKABLE_SX, "& > td": { borderBottom: open ? "none" : undefined } }}
      >
        <TableCell>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <IconButton size="small" aria-label={`${spell.name}'s details`} aria-expanded={open} sx={{ p: 0 }}>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
            {/* A tag sits twice the row's gap from the name, and from the next tag */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {spellLink ? (
                <MuiLink
                  component={Link}
                  to={spellLink}
                  target="_blank"
                  underline="hover"
                  onClick={(e: MouseEvent) => e.stopPropagation()}
                >
                  {spell.name}
                </MuiLink>
              ) : (
                spell.name
              )}
              {spell.tags?.map((tag) => (
                <Chip
                  key={tag.name}
                  label={tag.name}
                  size="small"
                  variant="outlined"
                  color={tag.joinsClassList ? "secondary" : "primary"}
                  sx={{ height: 20, fontSize: "0.7rem" }}
                />
              ))}
            </Stack>
          </Stack>
        </TableCell>
        <TableCell>{spell.school}</TableCell>
        <TableCell>{spell.save}</TableCell>
        <TableCell align="center">{spell.dc ?? "—"}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: open ? undefined : "none" }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
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
        </TableCell>
      </TableRow>
    </>
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
    <SheetSection title="Spells">
      <Stack spacing={3}>
        {groups.map((apt) => (
          <CollapsibleClass key={apt.aptitudeName} apt={apt} rulesetId={rulesetId} />
        ))}
      </Stack>
    </SheetSection>
  );
}
