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
  TableRow,
  Typography,
} from "@mui/material";
import { Fragment, type ReactNode, useMemo } from "react";

import {
  CardTitle,
  CLICKABLE_ROW_SX,
  CountChip,
  EmptyValue,
  ExpandArrow,
  Panel,
  StatusChip,
  SubsectionTitle,
  type TableColumn,
  TableColumnsHead,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { formatChainingOperator, formatOperator } from "@/shared/customization/operators.ts";

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
  /** Its columns: the toggle's, the source's, then a rule's cells' (`ruleColumns`). */
  columns: TableColumn[];
  count: number;
  groups: RuleGroup[];
  label: string;
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

/** An invalid requirement's columns */
const INVALID_COLUMNS: TableColumn[] = [
  { key: "source", label: "Source" },
  { key: "level", label: "Level" },
  { key: "target", label: "Target" },
  { key: "warning", label: "Warning" },
];

/** A skipped modifier's columns */
const SKIPPED_COLUMNS: TableColumn[] = [
  { key: "sourceType", label: "Source Type" },
  { key: "target", label: "Target" },
  { key: "warning", label: "Warning" },
];

const SUMMARY_SX = { px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } } as const;

/** Its tables' cells, the header's too: tight, in small type */
const TABLE_SX = { "& .MuiTableCell-root": { py: 0.5, px: 1, fontSize: "0.8rem" } } as const;

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
          <Table size="small" sx={TABLE_SX}>
            {children}
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

/** Rules by source: a source with one rule is a row, one with several expands to list them. */
function GroupedRuleTable({ label, count, columns, groups }: GroupedRuleTableProps) {
  const { keys: expanded, toggle } = useToggleSet();

  return (
    <DiagnosticsGroup label={label} count={count}>
      <TableColumnsHead columns={columns} />
      <TableBody>
        {groups.map(({ key, source, rules }) => {
          if (rules.length === 1) {
            return (
              <TableRow key={key}>
                <TableCell />
                <TableCell>{source}</TableCell>
                <RuleCellsRow cells={rules[0]} />
              </TableRow>
            );
          }
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <TableRow {...toggleProps(isOpen, () => toggle(key), "row")} sx={CLICKABLE_ROW_SX}>
                <TableCell sx={{ pr: 0 }}>
                  <ExpandArrow open={isOpen} />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{source}</TableCell>
                <TableCell colSpan={4}>
                  <CountChip label={rules.length} />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                  <Collapse in={isOpen} timeout={DURATION.normal} unmountOnExit>
                    <Table size="small" sx={TABLE_SX}>
                      <TableBody>
                        {rules.map((cells, i) => (
                          <TableRow key={i} sx={{ bgcolor: "action.hover" }}>
                            <TableCell />
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

function InvalidRequirementTable({ items }: InvalidRequirementTableProps) {
  return (
    <DiagnosticsGroup label="Invalid" count={items.length}>
      <TableColumnsHead columns={INVALID_COLUMNS} />
      <TableBody>
        {items.map((item, i) => (
          <TableRow key={i}>
            <TableCell>{item.sourceName ?? item.requirement.entityType}</TableCell>
            <TableCell>{item.requirement.level}</TableCell>
            <TableCell>{item.requirement.target || <EmptyValue />}</TableCell>
            <TableCell>{item.warning}</TableCell>
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
      const cells: RuleCells = [mod.target, formatOperator("modifier", mod.operator), mod.value, mod.valueType];
      const rules = bySource.get(source);
      if (rules) rules.push(cells);
      else bySource.set(source, [cells]);
    }
    return [...bySource].map(([source, rules]) => ({ key: source, source, rules }));
  }, [modifiers]);

  return <GroupedRuleTable label={label} count={modifiers.length} columns={ruleColumns("Type")} groups={groups} />;
}

function RequirementTable({ groups, label }: RequirementTableProps) {
  return (
    <GroupedRuleTable
      label={label}
      count={groups.length}
      columns={ruleColumns("Chaining")}
      groups={groups.map((group, index) => ({
        key: String(index),
        source: group.sourceName ?? group.sourceType ?? <EmptyValue />,
        rules: group.requirements.map((req): RuleCells => [
          req.target,
          req.operator && formatOperator("requirement", req.operator),
          req.value,
          req.chainingOperator && formatChainingOperator(req.chainingOperator),
        ]),
      }))}
    />
  );
}

function RuleCellsRow({ cells }: RuleCellsRowProps) {
  const [target, ...rest] = cells;
  return (
    <>
      <TableCell>{shownCell(target)}</TableCell>
      {rest.map((cell, i) => (
        <TableCell key={i} align="center">
          {shownCell(cell)}
        </TableCell>
      ))}
    </>
  );
}

/** The grouped rules' columns: the toggle's, the source's, then a rule's cells, the last one `last`. */
function ruleColumns(last: string): TableColumn[] {
  return [
    { key: "toggle", label: "", width: "28px" },
    { key: "source", label: "Source" },
    { key: "target", label: "Target" },
    { key: "operator", label: "Operator", align: "center" },
    { key: "value", label: "Value", align: "center" },
    { key: "last", label: last, align: "center" },
  ];
}

/** A rule's cell, a dash where it has nothing (a requirement without a chaining operator); a 0 is shown. */
function shownCell(cell: ReactNode) {
  return cell === "" || cell == null ? <EmptyValue /> : cell;
}

function SkippedModifierTable({ items }: SkippedModifierTableProps) {
  return (
    <DiagnosticsGroup label="Skipped" count={items.length}>
      <TableColumnsHead columns={SKIPPED_COLUMNS} />
      <TableBody>
        {items.map((item, i) => (
          <TableRow key={i}>
            <TableCell>{item.modifier.sourceType}</TableCell>
            <TableCell>{item.modifier.target}</TableCell>
            <TableCell>{item.warning}</TableCell>
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

            <Box>
              {/* Its tables follow as one list of accordions, the space above them the title's */}
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", pb: 1 }}>
                <SubsectionTitle>Requirements</SubsectionTitle>
                <Stack direction="row" spacing={1}>
                  <CountChip label={`Fulfilled (${requirements.fulfilledRequirementGroups.length})`} color="success" />
                  <CountChip label={`Unmet (${requirements.unmetRequirementGroups.length})`} color="error" />
                  {requirements.invalidRequirements.length > 0 && (
                    <CountChip label={`Invalid (${requirements.invalidRequirements.length})`} color="warning" />
                  )}
                </Stack>
              </Stack>
              <RequirementTable groups={requirements.fulfilledRequirementGroups} label="Fulfilled" />
              <RequirementTable groups={requirements.unmetRequirementGroups} label="Unmet" />
              <InvalidRequirementTable items={requirements.invalidRequirements} />
            </Box>

            <Box>
              {/* Its tables follow as one list of accordions, the space above them the title's */}
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", pb: 1 }}>
                <SubsectionTitle>Modifiers</SubsectionTitle>
                <Stack direction="row" sx={{ flexWrap: "wrap", columnGap: 1.5, rowGap: 0.5 }}>
                  <CountChip label={`Applied (${modifiers.appliedModifiers.length})`} color="success" />
                  {modifiers.unappliedModifiers.length > 0 && (
                    <CountChip label={`Unapplied (${modifiers.unappliedModifiers.length})`} color="error" />
                  )}
                  {modifiers.inactiveModifiers.length > 0 && (
                    <CountChip label={`Inactive (${modifiers.inactiveModifiers.length})`} />
                  )}
                  {modifiers.skippedModifiers.length > 0 && (
                    <CountChip label={`Skipped (${modifiers.skippedModifiers.length})`} color="warning" />
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
