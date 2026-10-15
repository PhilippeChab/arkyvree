import { Link as MuiLink, Popover, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import {
  LinkButton,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import { AddIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatClassLevel } from "@/shared/characterClasses.ts";

interface ClassLevelsProps {
  /** Its class's page, which its name over its levels links to, in a new tab */
  classLink?: string;
  klass: SheetKlass;
  /** Its levels, one at least: a class the character has no level in isn't listed */
  levels: SheetLevel[];
  /** Opens Add Level with the class planned for the next level: an editor's */
  onAddLevel?: (klassId: SheetKlass["id"]) => void;
  /** Edits a level; a read-only viewer sees the levels without it. */
  onEditLevel?: (editingLevel: EditingLevel) => void;
}

type SheetClass = CharacterDetail["classes"][string];

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

/**
 * A class on a sheet's header, with the character's level in it ("Fighter 3"): its click opens its levels, under its
 * name, which an editor opens in Edit Level, and an editor's plus at the name's end adds a level of the class. A viewer
 * with nothing to do there, no class page to open and no level to add or edit (a shared sheet's), reads it as text.
 */
export function ClassLevels({ klass, levels, classLink, onAddLevel, onEditLevel }: ClassLevelsProps) {
  const popover = useAnchorMenu();
  const name = formatClassLevel(klass.name, levels.length);

  if (!classLink && !onAddLevel && !onEditLevel) return name;

  return (
    <>
      <LinkButton label={`${name} Levels`} expanded={popover.open} onClick={popover.openMenu}>
        {name}
      </LinkButton>
      <Popover
        open={popover.open}
        anchorEl={popover.anchorEl}
        onClose={popover.closeMenu}
        // Under the class, as the header's line centers it
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        slotProps={{ paper: { role: "dialog", "aria-label": `${klass.name} Levels` } }}
      >
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <SubsectionTitle>
              {classLink ? (
                <MuiLink component={Link} to={classLink} target="_blank" underline="hover">
                  {klass.name}
                </MuiLink>
              ) : (
                klass.name
              )}
            </SubsectionTitle>
            {onAddLevel && (
              // An editor's plus, at the end of the class's name: a level of it
              <RowAction
                icon={AddIcon}
                label={`Add ${klass.name} Level`}
                onClick={popover.closeMenuAnd(() => onAddLevel(klass.id))}
              />
            )}
          </Stack>
          <Stack>
            {levels.map((lvl) => (
              <Stack
                key={lvl.characterLevel.id}
                direction="row"
                spacing={2}
                sx={{ alignItems: "center", justifyContent: "space-between", py: 0.5, ...ROW_ACTIONS_HOVER_SX }}
              >
                <Typography variant="body2">Level {lvl.klassLevel.level}</Typography>
                {onEditLevel && (
                  <RowActions>
                    <RowAction
                      icon={EditIcon}
                      label={`Edit ${klass.name} Level ${lvl.klassLevel.level}`}
                      onClick={popover.closeMenuAnd(() =>
                        onEditLevel({
                          characterLevelId: lvl.characterLevel.id,
                          klassId: klass.id,
                          klassName: klass.name,
                          level: lvl.klassLevel.level,
                          hd: klass.hd,
                        }),
                      )}
                    />
                  </RowActions>
                )}
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
