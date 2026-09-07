import { formatPropertyType, stripSeparators } from "@/shared/utils.ts";
import {
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Link as MuiLink,
  Paper,
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
import type { PowersSectionProps } from "../../sectionFactory.ts";

const SCHOOL_KEY = "SPELL_SCHOOL";

interface SpellRow {
  id?: string;
  name: string;
  school: string;
  save: string;
  dc: number | null;
  description: string;
  properties: Record<string, string>;
  tags?: string[];
}

interface SpellGroup {
  aptitudeName: string;
  level: number;
  uses: number | null;
  spells: SpellRow[];
}

function SpellRowItem({ spell, rulesetId }: { spell: SpellRow; rulesetId?: string }) {
  const [open, setOpen] = useState(false);

  const detailProps = Object.entries(spell.properties).filter(([key]) => key !== SCHOOL_KEY);
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
            <IconButton size="small" sx={{ p: 0 }}>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
            {spellLink
              ? <MuiLink component={Link} to={spellLink} target="_blank" underline="hover" onClick={(e: React.MouseEvent) => e.stopPropagation()}>{spell.name}</MuiLink>
              : spell.name
            }
            {spell.tags?.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" color={tag.includes("Domain") ? "secondary" : "primary"} sx={{ ml: 0.5, height: 20, fontSize: "0.7rem" }} />
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
                    <Typography key={key} variant="body2" sx={{
                      color: "text.secondary"
                    }}>
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
        <IconButton size="small" sx={{ p: 0 }}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {label} ({group.spells.length})
          {group.uses != null && (
            <Typography
              component="span"
              variant="body2"
              sx={{
                color: "text.secondary",
                ml: 1
              }}>
              — {group.uses}/day
            </Typography>
          )}
        </Typography>
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <colgroup>
              <col style={{ width: "40%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.100" }}>
                <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>School</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Save</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>DC</TableCell>
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

function CollapsibleClass({ apt, rulesetId }: { apt: { aptitudeName: string; levels: SpellGroup[] }; rulesetId?: string }) {
  const [open, setOpen] = useState(false);
  const totalSpells = apt.levels.reduce((sum, g) => sum + g.spells.length, 0);

  return (
    <Box sx={{ mb: 3, "&:last-child": { mb: 0 } }}>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 0.5, mb: 1 }}
      >
        <IconButton size="small" sx={{ p: 0 }}>
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

export function SpellsSection({ classes, powers, virtualPowers, aptitudes, spellTags, rulesetId }: PowersSectionProps) {
  const groups = useMemo(() => {
    const aptitudeNameById = new Map<string, string>();
    if (aptitudes) {
      for (const apt of Object.values(aptitudes)) {
        aptitudeNameById.set(apt.id, apt.name);
      }
    }

    const getUsesPerDay = (aptitudeName: string, spellLevel: number): number | null => {
      if (!aptitudes) return null;
      const key = stripSeparators(aptitudeName);
      const apt = aptitudes[key] as Record<string, unknown> | undefined;
      if (!apt) return null;
      const levelData = apt[String(spellLevel)] as { uses?: number } | undefined;
      if (!levelData || levelData.uses == null) return null;
      return levelData.uses;
    };

    const groupMap = new Map<string, SpellGroup>();

    for (const klass of Object.values(classes)) {
      for (const level of klass.levels || []) {
        for (const power of level.powers || []) {
          const spellLevel = power.powerLevel ?? level.klassLevel?.level ?? 0;
          const aptitudeName = aptitudeNameById.get(power.aptitudeId) || "Spells";
          const groupKey = `${power.aptitudeId}:${spellLevel}`;

          const normalizedName = stripSeparators(power.name);
          const powerData = powers?.[normalizedName];

          const save = power.saveName && power.saveEffect
            ? `${power.saveName} ${power.saveEffect}`
            : power.saveEffect || "None";

          const properties = powerData?.properties ?? {};
          const school = properties[SCHOOL_KEY] || "—";
          const dc = powerData?.dc?.total ?? null;
          const description = powerData?.power?.description || power.description || "";

          const allTags = power.id ? spellTags?.[power.id] : undefined;
          const tags = allTags?.filter((tag: string) => {
            if (tag.includes("Domain")) return aptitudeName.includes("Cleric") || aptitudeName.includes("Domain");
            if (tag.includes("Specialist")) return aptitudeName.includes("Wizard") || aptitudeName.includes("Specialist");
            return true;
          });
          const row: SpellRow = { id: power.id, name: power.name, school, save, dc, description, properties, tags: tags?.length ? tags : undefined };

          const existing = groupMap.get(groupKey);
          if (existing) {
            const existingSpell = existing.spells.find((r) => r.name === power.name);
            if (existingSpell) {
              if (row.tags) {
                existingSpell.tags = [...new Set([...(existingSpell.tags || []), ...row.tags])];
              }
            } else {
              existing.spells.push(row);
            }
          } else {
            groupMap.set(groupKey, { aptitudeName, level: spellLevel, uses: getUsesPerDay(aptitudeName, spellLevel), spells: [row] });
          }
        }
      }
    }

    // Add virtually possessed spells (granted by modifiers)
    for (const vp of virtualPowers || []) {
      const aptitudeName = aptitudeNameById.get(vp.aptitudeId) || "Spells";
      const groupKey = `${vp.aptitudeId}:${vp.level}`;
      const properties = vp.properties ?? {};

      const row: SpellRow = {
        id: vp.id,
        name: vp.name,
        school: properties[SCHOOL_KEY] || "—",
        save: vp.saveName && vp.saveEffect ? `${vp.saveName} ${vp.saveEffect}` : vp.saveEffect || "None",
        dc: vp.dc ?? null,
        description: vp.description || "",
        properties,
      };

      const existing = groupMap.get(groupKey);
      if (existing) {
        existing.spells.push(row);
      } else {
        groupMap.set(groupKey, { aptitudeName, level: vp.level, uses: getUsesPerDay(aptitudeName, vp.level), spells: [row] });
      }
    }

    const byAptitude = new Map<string, { aptitudeName: string; levels: SpellGroup[] }>();
    for (const group of groupMap.values()) {
      group.spells.sort((a, b) => a.name.localeCompare(b.name));
      const existing = byAptitude.get(group.aptitudeName);
      if (existing) {
        existing.levels.push(group);
      } else {
        byAptitude.set(group.aptitudeName, { aptitudeName: group.aptitudeName, levels: [group] });
      }
    }

    const sorted = [...byAptitude.values()].sort((a, b) =>
      a.aptitudeName.localeCompare(b.aptitudeName),
    );
    for (const apt of sorted) {
      apt.levels.sort((a, b) => a.level - b.level);
    }
    return sorted;
  }, [classes, powers, virtualPowers, aptitudes, spellTags]);

  if (groups.length === 0) return null;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Spells
      </Typography>
      {groups.map((apt) => (
        <CollapsibleClass key={apt.aptitudeName} apt={apt} rulesetId={rulesetId} />
      ))}
    </Paper>
  );
}
