import { BlankState } from "@/client/src/components/common/index.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";
import type React from "react";
import {
  Add as AddIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Remove as RemoveIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
  Link as MuiLink,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";
import { SheetSection } from "./SheetSection.tsx";

interface ClassLevel {
  klassLevel: { id: string; level: number; klassId: string };
  characterLevel: { id: string; hp: number; abilityId: string | null };
}

interface ClassData {
  klass?: { id: string; name: string; hd: number };
  levels?: ClassLevel[];
  level?: number;
}

interface ClassesSectionProps {
  classes: Record<string, ClassData>;
  rulesetId?: string;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onAddLevel?: () => void;
  onRemoveLevel?: () => void;
  readOnly?: boolean;
}

export function ClassesSection({
  classes,
  rulesetId,
  onEditLevel,
  onAddLevel,
  onRemoveLevel,
  readOnly,
}: ClassesSectionProps) {

  return (
    <SheetSection
      title="Classes & Levels"
      action={!readOnly && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Add Level">
              <IconButton size="small" onClick={onAddLevel}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove Level">
              <IconButton size="small" onClick={onRemoveLevel}>
                <RemoveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
      )}
    >
      {classes && Object.keys(classes).length > 0
        ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1 }}>
            {Object.values(classes).map((cls) => {
              const className = cls.klass?.name || "Unknown";
              const currentLevel = cls.levels?.length || cls.level || 1;
              const hasLevels = cls.levels && cls.levels.length > 0;

              const classLink = rulesetId && cls.klass?.id
                ? `/rulesets/${rulesetId}/classes/${cls.klass.id}`
                : undefined;

              if (!hasLevels || !onEditLevel) {
                return (
                  <Chip
                    key={className}
                    label={classLink
                      ? <MuiLink component={Link} to={classLink} target="_blank" underline="hover">{className} {currentLevel}</MuiLink>
                      : `${className} ${currentLevel}`
                    }
                    variant="outlined"
                    sx={{
                      fontSize: "0.875rem",
                      height: "auto",
                      "& .MuiChip-label": { px: 2, py: 1 },
                    }}
                  />
                );
              }

              return (
                <Accordion
                  key={className}
                  disableGutters
                  sx={{
                    width: "100%",
                    boxShadow: "none",
                    "&::before": { display: "none" },
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "8px !important",
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography sx={{ fontWeight: 500 }}>
                      {classLink
                        ? <><MuiLink component={Link} to={classLink} target="_blank" underline="hover" onClick={(e: React.MouseEvent) => e.stopPropagation()}>{className}</MuiLink> — Level {currentLevel}</>
                        : <>{className} — Level {currentLevel}</>
                      }
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    {cls.levels!.map((lvl) => (
                      <Stack
                        key={lvl.characterLevel.id}
                        direction="row"
                        sx={{
                          alignItems: "center",
                          justifyContent: "space-between",
                          py: 0.5,
                          px: 1,
                          borderRadius: 1,
                          "&:hover": { backgroundColor: "action.hover" }
                        }}>
                        <Typography variant="body2">
                          Level {lvl.klassLevel.level} — HP: +{lvl.characterLevel.hp}
                        </Typography>
                        {!readOnly && (
                          <IconButton
                            size="small"
                            onClick={() => onEditLevel({
                              characterLevelId: lvl.characterLevel.id,
                              klassId: cls.klass!.id,
                              klassName: cls.klass!.name,
                              level: lvl.klassLevel.level,
                              hd: cls.klass!.hd,
                            })}
                            aria-label={`Edit ${className} level ${lvl.klassLevel.level}`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                    ))}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )
        : (
          <BlankState title="No classes available" />
        )}
    </SheetSection>
  );
}
