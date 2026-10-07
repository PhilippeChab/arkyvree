import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Collapse,
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

import {
  CardTitle,
  CLICKABLE_SX,
  CountChip,
  EmptyValue,
  ExpandArrow,
  Panel,
  StatusChip,
  SubsectionTitle,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

interface DiagnosticsGroupProps {
  children: ReactNode;
  count: number;
  label: string;
}

interface DiagnosticsSectionProps {
  modifiers: CharacterDetail["modifiers"];
  requirements: CharacterDetail["requirements"];
  validation: CharacterDetail["validation"];
}

interface GroupedRuleTableProps {
  count: number;
  groups: RuleGroup[];
  label: string;
  lastColumn: string;
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
  label: string;
  modifiers: Modifier[];
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
  rules: RuleCells[];
  source: ReactNode;
}

interface SkippedModifierTableProps {
  items: DiagnosticsSectionProps["modifiers"]["skippedModifiers"];
}

const ACCORDION_SX = { boxShadow: "none", "&:before": { display: "none" } } as const;
const SUMMARY_SX = { px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } } as const;
const TABLE_CELL_SX = { py: 0.5, px: 1, fontSize: "0.8rem" } as const;

/** A collapsed table of one kind of diagnostic ("Unmet (3)"), hidden when there are none. */
function DiagnosticsGroup({ label, count, children }: DiagnosticsGroupProps) {
  if (count === 0) return null;
  return (
    <Accordion disableGutters sx={ACCORDION_SX}>
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={SUMMARY_SX}>
        <SubsectionTitle component="h4">
          {label} ({count})
        </SubsectionTitle>
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
  const { keys: expanded, toggle } = useToggleSet();

  return (
    <DiagnosticsGroup label={label} count={count}>
      <TableHead>
        <TableRow>
          <TableCell sx={TABLE_CELL_SX} width={28} />
          <TableCell sx={TABLE_CELL_SX}>Source</TableCell>
          <TableCell sx={TABLE_CELL_SX}>Target</TableCell>
          {["Operator", "Value", lastColumn].map((column) => (
            <TableCell key={column} sx={TABLE_CELL_SX} align="center">
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
                <TableCell sx={TABLE_CELL_SX} />
                <TableCell sx={TABLE_CELL_SX}>{source}</TableCell>
                <RuleCellsRow cells={rules[0]} />
              </TableRow>
            );
          }
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <TableRow hover {...toggleProps(isOpen, () => toggle(key), "row")} sx={CLICKABLE_SX}>
                <TableCell sx={{ ...TABLE_CELL_SX, pr: 0 }}>
                  <ExpandArrow open={isOpen} />
                </TableCell>
                <TableCell sx={{ ...TABLE_CELL_SX, fontWeight: 600 }}>{source}</TableCell>
                <TableCell sx={TABLE_CELL_SX} colSpan={4}>
                  <CountChip label={rules.length} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                  <Collapse in={isOpen} timeout="auto" unmountOnExit>
                    <Table size="small">
                      <TableBody>
                        {rules.map((cells, i) => (
                          <TableRow key={i} sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={TABLE_CELL_SX} />
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
          <TableCell key={label} sx={TABLE_CELL_SX}>
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
            <TableCell sx={TABLE_CELL_SX}>{item.sourceName ?? item.requirement.entityType}</TableCell>
            <TableCell sx={TABLE_CELL_SX}>{item.requirement.level}</TableCell>
            <TableCell sx={TABLE_CELL_SX}>{item.requirement.target || <EmptyValue />}</TableCell>
            <TableCell sx={TABLE_CELL_SX}>{item.warning}</TableCell>
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
        source: group.sourceName ?? group.sourceType ?? <EmptyValue />,
        rules: group.requirements.map((req): RuleCells => [req.target, req.operator, req.value, req.chainingOperator]),
      }))}
    />
  );
}

function RuleCellsRow({ cells }: RuleCellsRowProps) {
  const [target, ...rest] = cells;
  return (
    <>
      <TableCell sx={TABLE_CELL_SX}>{shownCell(target)}</TableCell>
      {rest.map((cell, i) => (
        <TableCell key={i} sx={TABLE_CELL_SX} align="center">
          {shownCell(cell)}
        </TableCell>
      ))}
    </>
  );
}

/** A rule's cell, a dash where it has nothing (a requirement without a chaining operator); a 0 is shown. */
function shownCell(cell: ReactNode) {
  return cell === "" || cell == null ? <EmptyValue /> : cell;
}

function SkippedModifierTable({ items }: SkippedModifierTableProps) {
  return (
    <DiagnosticsGroup label="Skipped" count={items.length}>
      <HeaderRow labels={["Source Type", "Target", "Warning"]} />
      <TableBody>
        {items.map((item, i) => (
          <TableRow key={i}>
            <TableCell sx={TABLE_CELL_SX}>{item.modifier.sourceType}</TableCell>
            <TableCell sx={TABLE_CELL_SX}>{item.modifier.target}</TableCell>
            <TableCell sx={TABLE_CELL_SX}>{item.warning}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </DiagnosticsGroup>
  );
}

export function DiagnosticsSection({ validation, requirements, modifiers }: DiagnosticsSectionProps) {
  return (
    <Panel>
      <Accordion defaultExpanded={false} disableGutters sx={ACCORDION_SX}>
        <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={SUMMARY_SX}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <CardTitle>Diagnostics</CardTitle>
            <StatusChip label={validation.valid ? "Valid" : "Invalid"} color={validation.valid ? "success" : "error"} />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 2 }}>
          <Stack spacing={3}>
            {/* Validation Issues */}
            {validation.issues.length > 0 && (
              <Stack spacing={1}>
                <SubsectionTitle>Issues</SubsectionTitle>
                <Box>
                  {validation.issues.map((issue, i) => (
                    <Typography key={i} variant="body2" sx={{ pl: 1, py: 0.25 }}>
                      {issue.message}
                    </Typography>
                  ))}
                </Box>
              </Stack>
            )}

            {/* Requirements System Status */}
            <Box>
              {/* Its tables follow as one list of accordions, the space above them the title's */}
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", pb: 1 }}>
                <SubsectionTitle>Requirements</SubsectionTitle>
                <Stack direction="row" spacing={1}>
                  <CountChip label={`Fulfilled: ${requirements.fulfilledRequirementGroups.length}`} color="success" />
                  <CountChip label={`Unmet: ${requirements.unmetRequirementGroups.length}`} color="error" />
                  {requirements.invalidRequirements.length > 0 && (
                    <CountChip label={`Invalid: ${requirements.invalidRequirements.length}`} color="warning" />
                  )}
                </Stack>
              </Stack>
              <RequirementTable groups={requirements.fulfilledRequirementGroups} label="Fulfilled" />
              <RequirementTable groups={requirements.unmetRequirementGroups} label="Unmet" />
              <InvalidRequirementTable items={requirements.invalidRequirements} />
            </Box>

            {/* Modifier System Status */}
            <Box>
              {/* Its tables follow as one list of accordions, the space above them the title's */}
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", pb: 1 }}>
                <SubsectionTitle>Modifiers</SubsectionTitle>
                <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 1.5, rowGap: 0.5 }}>
                  <CountChip label={`Applied: ${modifiers.appliedModifiers.length}`} color="success" />
                  {modifiers.unappliedModifiers.length > 0 && (
                    <CountChip label={`Unapplied: ${modifiers.unappliedModifiers.length}`} color="error" />
                  )}
                  {modifiers.inactiveModifiers.length > 0 && (
                    <CountChip label={`Inactive: ${modifiers.inactiveModifiers.length}`} />
                  )}
                  {modifiers.skippedModifiers.length > 0 && (
                    <CountChip label={`Skipped: ${modifiers.skippedModifiers.length}`} color="warning" />
                  )}
                </Stack>
              </Stack>
              <ModifierTable modifiers={modifiers.appliedModifiers} label="Applied" />
              <ModifierTable modifiers={modifiers.unappliedModifiers} label="Unapplied" />
              <ModifierTable modifiers={modifiers.inactiveModifiers} label="Inactive" />
              <SkippedModifierTable items={modifiers.skippedModifiers} />
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Panel>
  );
}
