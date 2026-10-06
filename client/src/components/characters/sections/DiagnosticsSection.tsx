import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Fragment, type ReactNode, useMemo } from "react";

import { CLICKABLE_SX, ExpandArrow, TagChip, toggleProps } from "@/client/src/components/common/index.ts";
import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

interface DiagnosticsGroupProps {
  label: string;
  count: number;
  children: ReactNode;
}

interface DiagnosticsSectionProps {
  validation: CharacterDetail["validation"];
  requirements: CharacterDetail["requirements"];
  modifiers: CharacterDetail["modifiers"];
}
interface GroupedRuleTableProps {
  label: string;
  count: number;
  lastColumn: string;
  groups: RuleGroup[];
}

interface HeaderRowProps {
  labels: string[];
}

interface InvalidRequirementTableProps {
  items: DiagnosticsSectionProps["requirements"]["invalidRequirements"];
}

/** A modifier in the applied, unapplied or inactive list, with its source's name. */
type Modifier = DiagnosticsSectionProps["modifiers"]["appliedModifiers"][number];

interface ModifierTableProps {
  modifiers: Modifier[];
  label: string;
}

type RequirementGroup = DiagnosticsSectionProps["requirements"]["unmetRequirementGroups"][number];

interface RequirementTableProps {
  groups: RequirementGroup[];
  label: string;
}

/** A requirement's or modifier's target, operator, value and last column (chaining or value type). */
type RuleCells = [target: ReactNode, operator: ReactNode, value: ReactNode, last: ReactNode];

interface RuleCellsRowProps {
  cells: RuleCells;
}

interface RuleGroup {
  key: string;
  source: string;
  rules: RuleCells[];
}

interface SkippedModifierTableProps {
  items: DiagnosticsSectionProps["modifiers"]["skippedModifiers"];
}

const accordionSx = { boxShadow: "none", "&:before": { display: "none" } } as const;
const tableCellSx = { py: 0.5, px: 1 } as const;
const headerCellSx = { ...tableCellSx, fontWeight: 600 } as const;
const summarySx = { px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } } as const;

/** A collapsed table of one kind of diagnostic ("Unmet (3)"), hidden when there are none. */
function DiagnosticsGroup({ label, count, children }: DiagnosticsGroupProps) {
  if (count === 0) return null;
  return (
    <Accordion disableGutters sx={accordionSx}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
        <Typography component="h4" variant="subtitle2">
          {label} ({count})
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <TableContainer>
          <Table size="small">{children}</Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

/** Rules by source: a source with one rule is a row, one with several expands to list them. */
function GroupedRuleTable({ label, count, lastColumn, groups }: GroupedRuleTableProps) {
  const [expanded, toggle] = useToggleSet();

  return (
    <DiagnosticsGroup label={label} count={count}>
      <TableHead>
        <TableRow>
          <TableCell sx={headerCellSx} width={28} />
          <TableCell sx={headerCellSx}>Source</TableCell>
          <TableCell sx={headerCellSx}>Target</TableCell>
          {["Operator", "Value", lastColumn].map((column) => (
            <TableCell key={column} sx={headerCellSx} align="center">
              {column}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {groups.map(({ key, source, rules }) => {
          if (rules.length === 1) {
            return (
              <TableRow key={key}>
                <TableCell sx={tableCellSx} />
                <TableCell sx={tableCellSx}>{source}</TableCell>
                <RuleCellsRow cells={rules[0]} />
              </TableRow>
            );
          }
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <TableRow hover {...toggleProps(isOpen, () => toggle(key), "row")} sx={CLICKABLE_SX}>
                <TableCell sx={{ ...tableCellSx, pr: 0 }}>
                  <ExpandArrow open={isOpen} />
                </TableCell>
                <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{source}</TableCell>
                <TableCell sx={tableCellSx} colSpan={4}>
                  {formatCount(rules.length, "rule")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                  <Collapse in={isOpen} unmountOnExit>
                    <Table size="small">
                      <TableBody>
                        {rules.map((cells, i) => (
                          <TableRow key={i} sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={tableCellSx} />
                            <RuleCellsRow cells={cells} />
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Collapse>
                </TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </DiagnosticsGroup>
  );
}

function HeaderRow({ labels }: HeaderRowProps) {
  return (
    <TableHead>
      <TableRow>
        {labels.map((label) => (
          <TableCell key={label} sx={headerCellSx}>
            {label}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

function InvalidRequirementTable({ items }: InvalidRequirementTableProps) {
  return (
    <DiagnosticsGroup label="Invalid" count={items.length}>
      <HeaderRow labels={["Source", "Level", "Target", "Warning"]} />
      <TableBody>
        {items.map((item, i) => (
          <TableRow key={i}>
            <TableCell sx={tableCellSx}>{item.sourceName ?? item.requirement.entityType}</TableCell>
            <TableCell sx={tableCellSx}>{item.requirement.level}</TableCell>
            <TableCell sx={tableCellSx}>{item.requirement.target || "—"}</TableCell>
            <TableCell sx={tableCellSx}>{item.warning}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DiagnosticsGroup>
  );
}

function ModifierTable({ modifiers, label }: ModifierTableProps) {
  const groups = useMemo(() => {
    const bySource = new Map<string, RuleCells[]>();
    for (const mod of modifiers) {
      const source = mod.sourceName ?? mod.sourceType;
      const cells: RuleCells = [mod.target, mod.operator, mod.value, mod.valueType];
      const rules = bySource.get(source);
      if (rules) rules.push(cells);
      else bySource.set(source, [cells]);
    }
    return [...bySource].map(([source, rules]) => ({ key: source, source, rules }));
  }, [modifiers]);

  return <GroupedRuleTable label={label} count={modifiers.length} lastColumn="Type" groups={groups} />;
}

function RequirementTable({ groups, label }: RequirementTableProps) {
  return (
    <GroupedRuleTable
      label={label}
      count={groups.length}
      lastColumn="Chaining"
      groups={groups.map((group, index) => ({
        key: String(index),
        source: group.sourceName ?? group.sourceType ?? "—",
        rules: group.requirements.map((req): RuleCells => [
          req.target || "—",
          req.operator || "—",
          req.value || "—",
          req.chainingOperator || "—",
        ]),
      }))}
    />
  );
}

function RuleCellsRow({ cells }: RuleCellsRowProps) {
  const [target, ...rest] = cells;
  return (
    <>
      <TableCell sx={tableCellSx}>{target}</TableCell>
      {rest.map((cell, i) => (
        <TableCell key={i} sx={tableCellSx} align="center">
          {cell}
        </TableCell>
      ))}
    </>
  );
}

function SkippedModifierTable({ items }: SkippedModifierTableProps) {
  return (
    <DiagnosticsGroup label="Skipped" count={items.length}>
      <HeaderRow labels={["Source Type", "Target", "Warning"]} />
      <TableBody>
        {items.map((item, i) => (
          <TableRow key={i}>
            <TableCell sx={tableCellSx}>{item.modifier.sourceType}</TableCell>
            <TableCell sx={tableCellSx}>{item.modifier.target}</TableCell>
            <TableCell sx={tableCellSx}>{item.warning}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DiagnosticsGroup>
  );
}

export function DiagnosticsSection({ validation, requirements, modifiers }: DiagnosticsSectionProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Accordion defaultExpanded={false} disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={summarySx}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Typography component="h2" variant="h6">
              Diagnostics
            </Typography>
            <TagChip
              tag={{ label: validation.valid ? "Valid" : "Invalid", color: validation.valid ? "success" : "error" }}
            />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 2 }}>
          <Stack spacing={3}>
            {/* Validation Issues */}
            {validation.issues.length > 0 && (
              <div>
                <Typography component="h3" variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  Issues
                </Typography>
                {validation.issues.map((issue, i) => (
                  <Typography key={i} variant="body2" sx={{ pl: 1, py: 0.25 }}>
                    {issue.message}
                  </Typography>
                ))}
              </div>
            )}

            {/* Requirements System Status */}
            <Stack spacing={1}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Requirements
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TagChip
                    tag={{ label: `Fulfilled: ${requirements.fulfilledRequirementGroups.length}`, color: "success" }}
                  />
                  <TagChip tag={{ label: `Unmet: ${requirements.unmetRequirementGroups.length}`, color: "error" }} />
                  {requirements.invalidRequirements.length > 0 && (
                    <TagChip tag={{ label: `Invalid: ${requirements.invalidRequirements.length}`, color: "warning" }} />
                  )}
                </Stack>
              </Stack>
              <RequirementTable groups={requirements.fulfilledRequirementGroups} label="Fulfilled" />
              <RequirementTable groups={requirements.unmetRequirementGroups} label="Unmet" />
              <InvalidRequirementTable items={requirements.invalidRequirements} />
            </Stack>

            {/* Modifier System Status */}
            <Stack spacing={1}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Modifiers
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <TagChip tag={{ label: `Applied: ${modifiers.appliedModifiers.length}`, color: "success" }} />
                  {modifiers.unappliedModifiers.length > 0 && (
                    <TagChip tag={{ label: `Unapplied: ${modifiers.unappliedModifiers.length}`, color: "error" }} />
                  )}
                  {modifiers.inactiveModifiers.length > 0 && (
                    <TagChip tag={{ label: `Inactive: ${modifiers.inactiveModifiers.length}`, color: "default" }} />
                  )}
                  {modifiers.skippedModifiers.length > 0 && (
                    <TagChip tag={{ label: `Skipped: ${modifiers.skippedModifiers.length}`, color: "warning" }} />
                  )}
                </Stack>
              </Stack>
              <ModifierTable modifiers={modifiers.appliedModifiers} label="Applied" />
              <ModifierTable modifiers={modifiers.unappliedModifiers} label="Unapplied" />
              <ModifierTable modifiers={modifiers.inactiveModifiers} label="Inactive" />
              <SkippedModifierTable items={modifiers.skippedModifiers} />
            </Stack>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}
