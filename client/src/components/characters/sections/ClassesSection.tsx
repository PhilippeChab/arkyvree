import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  IconButton,
  Link as MuiLink,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type React from "react";
import { Link } from "react-router-dom";

import { BlankState, Section, TagChip } from "@/client/src/components/common/index.ts";
import { AddIcon, DecrementIcon, EditIcon, ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import type { EditingLevel } from "@/client/src/types/character.ts";

import type { CharacterData } from "./characterData.ts";

interface ClassesSectionProps {
  classes: SheetClasses;
  rulesetId?: string;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onAddLevel?: () => void;
  onRemoveLevel?: () => void;
  readOnly?: boolean;
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
    <Section
      title="Classes & Levels"
      action={
        !readOnly && (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Add Level">
              <IconButton size="small" onClick={onAddLevel}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove Level">
              <IconButton size="small" onClick={onRemoveLevel}>
                <DecrementIcon fontSize="small" />
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
                <TagChip
                  key={className}
                  tag={{ label: `${className} ${currentLevel}`, color: "default", to: classLink, newTab: true }}
                  size="medium"
                />
              );
            }

            return (
              <Accordion
                key={className}
                disableGutters
                variant="outlined"
                sx={{
                  width: "100%",
                  "&::before": { display: "none" },
                  // Over MUI's first and last panel corners
                  "&, &:first-of-type, &:last-of-type": { borderRadius: 1 },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: "fontWeightMedium" }}>
                    {classLink ? (
                      <>
                        <MuiLink
                          component={Link}
                          to={classLink}
                          target="_blank"
                          underline="hover"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
                        "&:hover": { backgroundColor: "action.hover" },
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
        </Stack>
      ) : (
        <BlankState title="No classes available" />
      )}
    </Section>
  );
}
