import { Button, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  AddButton,
  BlankNote,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SubsectionTitle,
  ToggleLabel,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { DURATION } from "@/client/src/theme/animations.ts";

import { SheetSection } from "./SheetSection.tsx";

interface ClassesSectionProps {
  classes: SheetClasses;
  onAddLevel?: () => void;
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onRemoveLevel?: () => void;
  readOnly?: boolean;
  rulesetId?: string;
}

interface ClassGroupProps {
  /** Its class's page, which its name links to */
  classLink?: string;
  klass: SheetKlass;
  /** Its levels, one at least: a class the character has no level in isn't listed */
  levels: SheetLevel[];
  /** Edits a level; a read-only viewer sees the levels without it. */
  onEditLevel?: (editingLevel: EditingLevel) => void;
}

type SheetClass = CharacterDetail["classes"][string];

/** The sheet's classes, by name: those the character has levels in, every sheet's alike (a Partial one's none) */
type SheetClasses = CharacterDetail["classes"];

type SheetKlass = SheetClass["klass"];

type SheetLevel = SheetClass["levels"][number];

/** A level the sheet opens in Edit Level: its own row's id and level, and its class's. */
export interface EditingLevel {
  characterLevelId: SheetLevel["characterLevel"]["id"];
  hd: SheetKlass["hd"];
  klassId: SheetKlass["id"];
  klassName: SheetKlass["name"];
  level: SheetLevel["klassLevel"]["level"];
}

/** A class's levels under its heading, led by its arrow as every group the sheet opens and closes. */
function ClassGroup({ klass, levels, classLink, onEditLevel }: ClassGroupProps) {
  const [open, setOpen] = useState(false);

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <SubsectionTitle>
        {classLink ? (
          // Its name links to its class: the arrow alone is the toggle
          <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)} label={`${klass.name} Levels`}>
            <MuiLink component={Link} to={classLink} target="_blank" underline="hover">
              {klass.name}
            </MuiLink>{" "}
            — Level {levels.length}
          </ToggleLabel>
        ) : (
          <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
            {klass.name} — Level {levels.length}
          </ToggleLabel>
        )}
      </SubsectionTitle>
      <Collapse in={open} timeout={DURATION.normal} unmountOnExit>
        <Stack>
          {levels.map((lvl) => (
            <Stack
              key={lvl.characterLevel.id}
              direction="row"
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                py: 0.5,
                px: 1,
                ...ROW_ACTIONS_HOVER_SX,
              }}
            >
              <Typography variant="body2">
                Level {lvl.klassLevel.level} — HP Gain: +{lvl.characterLevel.hp}
              </Typography>
              {onEditLevel && (
                <RowActions>
                  <RowAction
                    icon={EditIcon}
                    label={`Edit ${klass.name} Level ${lvl.klassLevel.level}`}
                    onClick={() =>
                      onEditLevel({
                        characterLevelId: lvl.characterLevel.id,
                        klassId: klass.id,
                        klassName: klass.name,
                        level: lvl.klassLevel.level,
                        hd: klass.hd,
                      })
                    }
                  />
                </RowActions>
              )}
            </Stack>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
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
      action={
        !readOnly &&
        onAddLevel &&
        onRemoveLevel && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Button variant="outlined" size="small" startIcon={<DeleteIcon />} onClick={onRemoveLevel}>
              Remove Level
            </Button>
            <AddButton label="Add Level" size="small" onClick={onAddLevel} />
          </Stack>
        )
      }
    >
      {Object.keys(classes).length > 0 ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
          {/* Each class lists its levels, which an editor can edit */}
          {Object.values(classes).map(({ klass, levels }) => (
            <ClassGroup
              key={klass.id}
              klass={klass}
              levels={levels}
              classLink={rulesetId && `/rulesets/${rulesetId}/classes/${klass.id}`}
              onEditLevel={readOnly ? undefined : onEditLevel}
            />
          ))}
        </Stack>
      ) : (
        <BlankNote>No classes</BlankNote>
      )}
    </SheetSection>
  );
}
