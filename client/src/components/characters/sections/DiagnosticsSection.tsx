import {
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  Collapse,
  IconButton,
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
import { Fragment, useMemo, useState } from "react";

interface Requirement {
  level: string;
  target: string | null;
  operator: string | null;
  value: string | null;
  chainingOperator: string | null;
  entityId: string;
  entityType: string;
}

interface Modifier {
  sourceType: string;
  target: string;
  operator: string;
  value: string;
  valueType: string;
  sourceName?: string;
}

interface RequirementGroup {
  sourceName?: string;
  sourceType?: string;
  requirements: Requirement[];
}

interface ValidationIssue {
  category: "aptitudes" | "skills" | "requirements" | "modifiers" | "integrity";
  message: string;
  entityName?: string | null;
  entityType?: string | null;
  requirementTree?: string;
}

interface DiagnosticsSectionProps {
  validation: {
    valid: boolean;
    issues: ValidationIssue[];
  };
  requirements: {
    invalidRequirements: { warning: string; requirement: Requirement; sourceName?: string }[];
    unmetRequirementGroups: RequirementGroup[];
    fulfilledRequirementGroups: RequirementGroup[];
  };
  modifiers: {
    modifiers: Modifier[];
    appliedModifiers: Modifier[];
    unappliedModifiers: Modifier[];
    inactiveModifiers: Modifier[];
    skippedModifiers: { warning: string; modifier: Modifier }[];
  };
}

const tableCellSx = { py: 0.5, px: 1, fontSize: "0.8rem" } as const;
const headerCellSx = { ...tableCellSx, fontWeight: 600 } as const;

function RequirementTable({ groups, label }: { groups: RequirementGroup[]; label: string }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (groups.length === 0) return null;

  const toggle = (index: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <Accordion disableGutters sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } }}>
        <Typography variant="subtitle2">{label} ({groups.length})</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx} width={28} />
                <TableCell sx={headerCellSx}>Source</TableCell>
                <TableCell sx={headerCellSx}>Target</TableCell>
                <TableCell sx={headerCellSx} align="center">Operator</TableCell>
                <TableCell sx={headerCellSx} align="center">Value</TableCell>
                <TableCell sx={headerCellSx} align="center">Chaining</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group, groupIndex) => {
                const isOpen = expanded.has(groupIndex);
                const source = group.sourceName ?? group.sourceType ?? "—";
                const single = group.requirements.length === 1;
                const req0 = group.requirements[0];
                if (single) {
                  return (
                    <TableRow key={groupIndex}>
                      <TableCell sx={tableCellSx} />
                      <TableCell sx={tableCellSx}>{source}</TableCell>
                      <TableCell sx={tableCellSx}>{req0.target || "—"}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{req0.operator || "—"}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{req0.value || "—"}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{req0.chainingOperator || "—"}</TableCell>
                    </TableRow>
                  );
                }
                return (
                  <Fragment key={groupIndex}>
                    <TableRow
                      hover
                      onClick={() => toggle(groupIndex)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ ...tableCellSx, pr: 0 }}>
                        <IconButton size="small" sx={{ p: 0 }}>
                          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{source}</TableCell>
                      <TableCell sx={tableCellSx} colSpan={4}>
                        <Chip label={group.requirements.length} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.75rem" }} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableBody>
                              {group.requirements.map((req, reqIndex) => (
                                <TableRow key={reqIndex} sx={{ bgcolor: "action.hover" }}>
                                  <TableCell sx={tableCellSx} />
                                  <TableCell sx={tableCellSx}>{req.target || "—"}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{req.operator || "—"}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{req.value || "—"}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{req.chainingOperator || "—"}</TableCell>
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
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

function ModifierTable({ modifiers, label }: { modifiers: Modifier[]; label: string }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Modifier[]>();
    for (const mod of modifiers) {
      const key = mod.sourceName ?? mod.sourceType;
      const list = map.get(key);
      if (list) list.push(mod);
      else map.set(key, [mod]);
    }
    return map;
  }, [modifiers]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (modifiers.length === 0) return null;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Accordion disableGutters sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } }}>
        <Typography variant="subtitle2">{label} ({modifiers.length})</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx} width={28} />
                <TableCell sx={headerCellSx}>Source</TableCell>
                <TableCell sx={headerCellSx}>Target</TableCell>
                <TableCell sx={headerCellSx} align="center">Operator</TableCell>
                <TableCell sx={headerCellSx} align="center">Value</TableCell>
                <TableCell sx={headerCellSx} align="center">Type</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...grouped.entries()].map(([source, mods]) => {
                const isOpen = expanded.has(source);
                const single = mods.length === 1;
                if (single) {
                  const mod = mods[0];
                  return (
                    <TableRow key={source}>
                      <TableCell sx={tableCellSx} />
                      <TableCell sx={tableCellSx}>{source}</TableCell>
                      <TableCell sx={tableCellSx}>{mod.target}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{mod.operator}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{mod.value}</TableCell>
                      <TableCell sx={tableCellSx} align="center">{mod.valueType}</TableCell>
                    </TableRow>
                  );
                }
                return (
                  <Fragment key={source}>
                    <TableRow
                      hover
                      onClick={() => toggle(source)}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell sx={{ ...tableCellSx, pr: 0 }}>
                        <IconButton size="small" sx={{ p: 0 }}>
                          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ ...tableCellSx, fontWeight: 600 }}>{source}</TableCell>
                      <TableCell sx={tableCellSx} colSpan={4}>
                        <Chip label={mods.length} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.75rem" }} />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: isOpen ? undefined : "none" }}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableBody>
                              {mods.map((mod, i) => (
                                <TableRow key={i} sx={{ bgcolor: "action.hover" }}>
                                  <TableCell sx={tableCellSx} />
                                  <TableCell sx={tableCellSx}>{mod.target}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{mod.operator}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{mod.value}</TableCell>
                                  <TableCell sx={tableCellSx} align="center">{mod.valueType}</TableCell>
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
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

function SkippedModifierTable({ items }: { items: { warning: string; modifier: Modifier }[] }) {
  if (items.length === 0) return null;
  return (
    <Accordion disableGutters sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } }}>
        <Typography variant="subtitle2">Skipped ({items.length})</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Source Type</TableCell>
                <TableCell sx={headerCellSx}>Target</TableCell>
                <TableCell sx={headerCellSx}>Warning</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell sx={tableCellSx}>{item.modifier.sourceType}</TableCell>
                  <TableCell sx={tableCellSx}>{item.modifier.target}</TableCell>
                  <TableCell sx={tableCellSx}>{item.warning}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

function InvalidRequirementTable({ items }: { items: { warning: string; requirement: Requirement; sourceName?: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Accordion disableGutters sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } }}>
        <Typography variant="subtitle2">Invalid ({items.length})</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 1 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Source</TableCell>
                <TableCell sx={headerCellSx}>Level</TableCell>
                <TableCell sx={headerCellSx}>Target</TableCell>
                <TableCell sx={headerCellSx}>Warning</TableCell>
              </TableRow>
            </TableHead>
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
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

export function DiagnosticsSection({ validation, requirements, modifiers }: DiagnosticsSectionProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Accordion defaultExpanded={false} disableGutters sx={{ boxShadow: "none", "&:before": { display: "none" } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 0, "& .MuiAccordionSummary-content": { my: 0 } }}>
          <Stack direction="row" spacing={1.5} sx={{
            alignItems: "center"
          }}>
            <Typography variant="h6">Diagnostics</Typography>
            <Chip
              label={validation.valid ? "Valid" : "Invalid"}
              color={validation.valid ? "success" : "error"}
              size="small"
            />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 2 }}>
          <Stack spacing={3}>
            {/* Validation Issues */}
            {validation.issues.length > 0 && (
              <div>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Issues</Typography>
                {validation.issues.map((issue, i) => (
                  <Typography key={i} variant="body2" sx={{ pl: 1, py: 0.25 }}>
                    {issue.message}
                  </Typography>
                ))}
              </div>
            )}

            {/* Requirements System Status */}
            <div>
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  alignItems: "center",
                  mb: 1
                }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Requirements</Typography>
                <Stack direction="row" spacing={1}>
                  <Chip label={`Fulfilled: ${requirements.fulfilledRequirementGroups.length}`} color="success" size="small" variant="outlined" />
                  <Chip label={`Unmet: ${requirements.unmetRequirementGroups.length}`} color="error" size="small" variant="outlined" />
                  {requirements.invalidRequirements.length > 0 && (
                    <Chip label={`Invalid: ${requirements.invalidRequirements.length}`} color="warning" size="small" variant="outlined" />
                  )}
                </Stack>
              </Stack>
              <RequirementTable groups={requirements.fulfilledRequirementGroups} label="Fulfilled" />
              <RequirementTable groups={requirements.unmetRequirementGroups} label="Unmet" />
              <InvalidRequirementTable items={requirements.invalidRequirements} />
            </div>

            {/* Modifier System Status */}
            <div>
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  alignItems: "center",
                  mb: 1
                }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Modifiers</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                  <Chip label={`Applied: ${modifiers.appliedModifiers.length}`} color="success" size="small" variant="outlined" />
                  {modifiers.unappliedModifiers.length > 0 && (
                    <Chip label={`Unapplied: ${modifiers.unappliedModifiers.length}`} color="error" size="small" variant="outlined" />
                  )}
                  {modifiers.inactiveModifiers.length > 0 && (
                    <Chip label={`Inactive: ${modifiers.inactiveModifiers.length}`} size="small" variant="outlined" />
                  )}
                  {modifiers.skippedModifiers.length > 0 && (
                    <Chip label={`Skipped: ${modifiers.skippedModifiers.length}`} color="warning" size="small" variant="outlined" />
                  )}
                </Stack>
              </Stack>
              <ModifierTable modifiers={modifiers.appliedModifiers} label="Applied" />
              <ModifierTable modifiers={modifiers.unappliedModifiers} label="Unapplied" />
              <ModifierTable modifiers={modifiers.inactiveModifiers} label="Inactive" />
              <SkippedModifierTable items={modifiers.skippedModifiers} />
            </div>
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Paper>
  );
}
