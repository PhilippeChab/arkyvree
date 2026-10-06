import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Link as MuiLink,
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

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { type AptitudeSpells, buildSpellGroups, type SpellGroup, type SpellRow } from "@/shared/dnd3.5/spellGroups.ts";

import type { Dnd35PowersSectionProps } from "./types.ts";

function SpellRowItem({ spell, rulesetId }: { spell: SpellRow; rulesetId?: string }) {
  const [open, setOpen] = useState(false);

  const detailProps = Object.entries(spell.properties).filter(([key]) => key !== SPELL_SCHOOL);
  const spellLink = rulesetId && spell.id ? `/rulesets/${rulesetId}/powers/${spell.id}/customization` : undefined;

  return (
    <Fragment>
      <TableRow
        hover
        onClick={() => setOpen((prev) => !prev)}
        sx={{ cursor: "pointer", "& > td": { borderBottom: open ? "none" : undefined } }}
      >
        <TableCell>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <IconButton size="small" aria-label={`${open ? "Hide" : "Show"} ${spell.name}'s details`} sx={{ p: 0 }}>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
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
              <Chip
                key={tag.name}
                label={tag.name}
                size="small"
                variant="outlined"
                color={tag.joinsClassList ? "secondary" : "primary"}
                sx={{ ml: 0.5, height: 20, fontSize: "0.7rem" }}
              />
            ))}
          </Box>
        </TableCell>
        <TableCell>{spell.school}</TableCell>
        <TableCell>{spell.save}</TableCell>
        <TableCell align="center">{spell.dc ?? "—"}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: open ? undefined : "none" }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ py: 1.5, px: 1 }}>
              {detailProps.length > 0 && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
                    gap: 0.5,
                    mb: spell.description ? 1.5 : 0,
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
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}

function CollapsibleLevel({ group, rulesetId }: { group: SpellGroup; rulesetId?: string }) {
  const [open, setOpen] = useState(false);
  const label = group.level === 0 ? "Cantrips" : `Level ${group.level}`;

  return (
    <Box sx={{ mb: 1, "&:last-child": { mb: 0 } }}>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 0.5, mb: 0.5 }}
      >
        <IconButton size="small" aria-label={`${open ? "Hide" : "Show"} ${label} spells`} sx={{ p: 0 }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {label} ({group.spells.length})
          {group.uses != null && (
            <Typography component="span" variant="body2" sx={{ color: "text.secondary", ml: 1 }}>
              — {group.uses}/day
            </Typography>
          )}
        </Typography>
      </Box>
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
    </Box>
  );
}

function CollapsibleClass({ apt, rulesetId }: { apt: AptitudeSpells; rulesetId?: string }) {
  const [open, setOpen] = useState(false);
  const totalSpells = apt.levels.reduce((sum, g) => sum + g.spells.length, 0);

  return (
    <Box sx={{ mb: 3, "&:last-child": { mb: 0 } }}>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 0.5, mb: 1 }}
      >
        <IconButton size="small" aria-label={`${open ? "Hide" : "Show"} ${apt.aptitudeName}`} sx={{ p: 0 }}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {apt.aptitudeName} ({totalSpells})
        </Typography>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ pl: 1 }}>
          {apt.levels.map((group) => (
            <CollapsibleLevel key={group.level} group={group} rulesetId={rulesetId} />
          ))}
        </Box>
      </Collapse>
    </Box>
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
      {groups.map((apt) => (
        <CollapsibleClass key={apt.aptitudeName} apt={apt} rulesetId={rulesetId} />
      ))}
    </SheetSection>
  );
}
