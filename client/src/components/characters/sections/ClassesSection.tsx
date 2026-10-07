import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  IconButton,
  Link as MuiLink,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { type MouseEvent } from "react";
import { Link } from "react-router-dom";

import { BlankState } from "@/client/src/components/common/index.ts";
import { AddIcon, EditIcon, ExpandMoreIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";

import type { CharacterData } from "./characterData.ts";
import { SheetSection } from "./SheetSection.tsx";

interface ClassesSectionProps {
  classes: SheetClasses;
  onAddLevel?: () => void;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onRemoveLevel?: () => void;
  readOnly?: boolean;
  rulesetId?: string;
}

type SheetClasses = NonNullable<CharacterData["classes"]>;

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
      action={
        !readOnly && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Add Level">
              <IconButton aria-label="Add Level" size="small" onClick={onAddLevel}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove Level">
              <IconButton aria-label="Remove Level" size="small" onClick={onRemoveLevel}>
                <RemoveIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        )
      }
    >
      {classes && Object.keys(classes).length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
          {Object.values(classes).map((cls) => {
            const { klass } = cls;
            const levels = cls.levels ?? [];
            const className = klass?.name || "Unknown";
            const currentLevel = levels.length || cls.level || 1;

            const classLink = rulesetId && klass?.id ? `/rulesets/${rulesetId}/classes/${klass.id}` : undefined;

            // Levels can only be edited on a class the sheet carries in full.
            if (!klass || levels.length === 0 || !onEditLevel) {
              return (
                <Chip
                  key={className}
                  label={
                    classLink ? (
                      <MuiLink component={Link} to={classLink} target="_blank" underline="hover">
                        {className} {currentLevel}
                      </MuiLink>
                    ) : (
                      `${className} ${currentLevel}`
                    )
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
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
                  <Typography sx={{ fontWeight: 500 }}>
                    {classLink ? (
                      <>
                        <MuiLink
                          component={Link}
                          to={classLink}
                          target="_blank"
                          underline="hover"
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                        >
                          {className}
                        </MuiLink>{" "}
                        — Level {currentLevel}
                      </>
                    ) : (
                      <>
                        {className} — Level {currentLevel}
                      </>
                    )}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  {levels.map((lvl) => (
                    <Stack
                      key={lvl.characterLevel.id}
                      direction="row"
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        py: 0.5,
                        px: 1,
                        borderRadius: 1,
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <Typography variant="body2">
                        Level {lvl.klassLevel.level} — HP: +{lvl.characterLevel.hp}
                      </Typography>
                      {!readOnly && (
                        <IconButton
                          size="small"
                          onClick={() =>
                            onEditLevel({
                              characterLevelId: lvl.characterLevel.id,
                              klassId: klass.id,
                              klassName: klass.name,
                              level: lvl.klassLevel.level,
                              hd: klass.hd,
                            })
                          }
                          aria-label={`Edit ${className} Level ${lvl.klassLevel.level}`}
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
        </Stack>
      ) : (
        <BlankState title="No classes available" />
      )}
    </SheetSection>
  );
}
