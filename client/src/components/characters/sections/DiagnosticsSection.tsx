import { Accordion, AccordionDetails, AccordionSummary, Box, Collapse, Stack } from "@mui/material";
import { Fragment, type ReactNode } from "react";

import { ValidationIssueList } from "@/client/src/components/characters/validation/index.ts";
import {
  CardTitle,
  CLICKABLE_ROW_SX,
  CountChip,
  DataCell,
  DataRow,
  DataTable,
  EmptyValue,
  ExpandArrow,
  Panel,
  type PhoneSlot,
  StatusChip,
  SubsectionTitle,
  type TableColumn,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { useToggleSet } from "@/client/src/hooks/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { formatChainingOperator, formatOperator } from "@/shared/customization/operators.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface DiagnosticsGroupProps {
  /** Its rows, each a `DataRow` */
  children: ReactNode;
  columns: TableColumn[];
  count: number;
  label: string;
}

interface DiagnosticsSectionProps {
  /** The character's, whose words name what a rule's source is (a 3.5 power is a "Spell") */
  baseRules: BaseRules;
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
  baseRules: BaseRules;
  items: DiagnosticsSectionProps["requirements"]["invalidRequirements"];
}

interface ModifierTableProps {
  baseRules: BaseRules;
  label: string;
  modifiers: Modifier[];
}

interface RequirementTableProps {
  baseRules: BaseRules;
  groups: RequirementGroup[];
  label: string;
}

interface RuleCellsRowProps {
  cells: RuleCells;
  /** Its last column's name, which a phone leads its cell with */
  last: string;
  /** Where its target goes on a phone: under its source, or leading its row (a group's rule, its source above it) */
  targetSlot: PhoneSlot;
}

interface RuleGroup {
  key: string;
  rules: RuleCells[];
  source: ReactNode;
}

interface SkippedModifierTableProps {
  baseRules: BaseRules;
  items: DiagnosticsSectionProps["modifiers"]["skippedModifiers"];
}
/** A modifier in the applied, unapplied or inactive list, with its source's name. */
type Modifier = DiagnosticsSectionProps["modifiers"]["appliedModifiers"][number];

type RequirementGroup = DiagnosticsSectionProps["requirements"]["unmetRequirementGroups"][number];

/** A requirement's or modifier's target, operator, value and last column (chaining or value type). */
type RuleCells = [target: ReactNode, operator: ReactNode, value: ReactNode, last: ReactNode];

const ACCORDION_SX = { boxShadow: "none", "&:before": { display: "none" } } as const;

/** An invalid requirement's columns */
const INVALID_COLUMNS: TableColumn[] = [
  { key: "source", label: "Source" },
  { key: "level", label: "Level" },
  { key: "target", label: "Target" },
  { key: "warning", label: "Warning" },
];

/** What a cell shows on a phone alone: a group's arrow, which leads its source there, its toggle's column gone */
const PHONE_ONLY_SX = { display: { xs: "inline", sm: "none" }, pr: 0.5, "& svg": { verticalAlign: "middle" } };

/** A rule's operator, before its value on a phone, its own column gone there ("+ 2") */
const PHONE_OPERATOR_SX = { display: { xs: "inline", sm: "none" }, pr: 0.5 };

/** A skipped modifier's columns */
const SKIPPED_COLUMNS: TableColumn[] = [
  { key: "sourceType", label: "Source Type" },
  { key: "target", label: "Target" },
  { key: "warning", label: "Warning" },
];

const SUMMARY_SX = { px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } } as const;

/** Its tables' cells, the header's too: tight, in small type, from `sm` up (a phone lists them) */
const TABLE_SX = { "& .MuiTableCell-root": { py: { sm: 0.5 }, px: { sm: 1 }, fontSize: { sm: "0.8rem" } } } as const;

/** A collapsed table of one kind of diagnostic ("Unmet (3)"), hidden when there are none. */
function DiagnosticsGroup({ label, count, columns, children }: DiagnosticsGroupProps) {
  if (count === 0) return null;
  return (
    <Accordion disableGutters sx={ACCORDION_SX}>
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={SUMMARY_SX}>
        <SubsectionTitle component="h4">
          {label} ({count})
        </SubsectionTitle>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <DataTable size="small" columns={columns} sx={TABLE_SX}>
          {children}
        </DataTable>
      </AccordionDetails>
    </Accordion>
  );
}

/** Rules by source: a source with one rule is a row, one with several expands to list them. */
function GroupedRuleTable({ label, count, columns, groups }: GroupedRuleTableProps) {
  const last = columns[columns.length - 1].label;
  const { keys: expanded, toggle } = useToggleSet();

  return (
    <DiagnosticsGroup label={label} count={count} columns={columns}>
      {groups.map(({ key, source, rules }) => {
        if (rules.length === 1) {
          return (
            <DataRow key={key}>
              <DataCell slot="hidden" />
              <DataCell slot="primary">{source}</DataCell>
              <RuleCellsRow cells={rules[0]} last={last} targetSlot="inline" />
            </DataRow>
          );
        }
        const isOpen = expanded.has(key);
        return (
          <Fragment key={key}>
            <DataRow {...toggleProps(isOpen, () => toggle(key), "row")} sx={CLICKABLE_ROW_SX}>
              <DataCell slot="hidden" sx={{ pr: 0 }}>
                <ExpandArrow open={isOpen} />
              </DataCell>
              <DataCell slot="primary" sx={{ fontWeight: 600 }}>
                <Box component="span" sx={PHONE_ONLY_SX}>
                  <ExpandArrow open={isOpen} />
                </Box>
                {source}
              </DataCell>
              <DataCell slot="trailing" colSpan={4}>
                <CountChip label={rules.length} />
              </DataCell>
            </DataRow>
            {/* Its rules, under it while it's open: closed, its row takes no room on a phone */}
            <DataRow>
              <DataCell slot="block" colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                <Collapse in={isOpen} timeout={DURATION.normal} unmountOnExit>
                  <DataTable size="small" sx={TABLE_SX}>
                    {rules.map((cells, i) => (
                      <DataRow key={i} indented sx={{ bgcolor: "action.hover" }}>
                        <DataCell slot="hidden" />
                        <RuleCellsRow cells={cells} last={last} targetSlot="primary" />
                      </DataRow>
                    ))}
                  </DataTable>
                </Collapse>
              </DataCell>
            </DataRow>
          </Fragment>
        );
      })}
    </DiagnosticsGroup>
  );
}

function InvalidRequirementTable({ baseRules, items }: InvalidRequirementTableProps) {
  return (
    <DiagnosticsGroup label="Invalid" count={items.length} columns={INVALID_COLUMNS}>
      {items.map((item, i) => (
        <DataRow key={i}>
          <DataCell slot="primary">
            {item.sourceName ?? entityTypeLabel(item.requirement.entityType, baseRules)}
          </DataCell>
          <DataCell slot="labeled" label="Level">
            {item.requirement.level}
          </DataCell>
          <DataCell slot={item.requirement.target ? "inline" : "hidden"}>
            {item.requirement.target || <EmptyValue />}
          </DataCell>
          <DataCell slot="block">{item.warning}</DataCell>
        </DataRow>
      ))}
    </DiagnosticsGroup>
  );
}

/** Whether a rule's cell has something to show (a requirement may have no chaining operator); a 0 is shown. */
function isShown(cell: ReactNode) {
  return cell !== "" && cell != null;
}

function ModifierTable({ baseRules, modifiers, label }: ModifierTableProps) {
  const bySource = new Map<string, RuleCells[]>();
  for (const mod of modifiers) {
    const source = mod.sourceName ?? entityTypeLabel(mod.sourceType, baseRules);
    const cells: RuleCells = [mod.target, formatOperator("modifier", mod.operator), mod.value, mod.valueType];
    const rules = bySource.get(source);
    if (rules) rules.push(cells);
    else bySource.set(source, [cells]);
  }
  const groups = [...bySource].map(([source, rules]) => ({ key: source, source, rules }));

  return <GroupedRuleTable label={label} count={modifiers.length} columns={ruleColumns("Type")} groups={groups} />;
}

function RequirementTable({ baseRules, groups, label }: RequirementTableProps) {
  return (
    <GroupedRuleTable
      label={label}
      count={groups.length}
      columns={ruleColumns("Chaining")}
      groups={groups.map((group, index) => ({
        key: String(index),
        source: group.sourceName ?? (group.sourceType ? entityTypeLabel(group.sourceType, baseRules) : <EmptyValue />),
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

function RuleCellsRow({ cells, last, targetSlot }: RuleCellsRowProps) {
  const [target, operator, value, lastCell] = cells;
  return (
    <>
      <DataCell slot={targetSlot}>{shownCell(target)}</DataCell>
      <DataCell slot="hidden" align="center">
        {shownCell(operator)}
      </DataCell>
      <DataCell slot="inline" align="center">
        {isShown(operator) && (
          <Box component="span" sx={PHONE_OPERATOR_SX}>
            {operator}
          </Box>
        )}
        {shownCell(value)}
      </DataCell>
      <DataCell slot={isShown(lastCell) ? "labeled" : "hidden"} label={last} align="center">
        {shownCell(lastCell)}
      </DataCell>
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

/** A rule's cell, a dash where it has nothing. */
function shownCell(cell: ReactNode) {
  return isShown(cell) ? cell : <EmptyValue />;
}

function SkippedModifierTable({ baseRules, items }: SkippedModifierTableProps) {
  return (
    <DiagnosticsGroup label="Skipped" count={items.length} columns={SKIPPED_COLUMNS}>
      {items.map((item, i) => (
        <DataRow key={i}>
          <DataCell slot="primary">{entityTypeLabel(item.modifier.sourceType, baseRules)}</DataCell>
          <DataCell slot="inline">{item.modifier.target}</DataCell>
          <DataCell slot="block">{item.warning}</DataCell>
        </DataRow>
      ))}
    </DiagnosticsGroup>
  );
}

export function DiagnosticsSection({ baseRules, validation, requirements, modifiers }: DiagnosticsSectionProps) {
  return (
    <Panel>
      <Accordion disableGutters sx={ACCORDION_SX}>
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
                <ValidationIssueList issues={validation.issues} baseRules={baseRules} named={false} />
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
              <RequirementTable
                baseRules={baseRules}
                groups={requirements.fulfilledRequirementGroups}
                label="Fulfilled"
              />
              <RequirementTable baseRules={baseRules} groups={requirements.unmetRequirementGroups} label="Unmet" />
              <InvalidRequirementTable baseRules={baseRules} items={requirements.invalidRequirements} />
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
              <ModifierTable baseRules={baseRules} modifiers={modifiers.appliedModifiers} label="Applied" />
              <ModifierTable baseRules={baseRules} modifiers={modifiers.unappliedModifiers} label="Unapplied" />
              <ModifierTable baseRules={baseRules} modifiers={modifiers.inactiveModifiers} label="Inactive" />
              <SkippedModifierTable baseRules={baseRules} items={modifiers.skippedModifiers} />
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Panel>
  );
}
