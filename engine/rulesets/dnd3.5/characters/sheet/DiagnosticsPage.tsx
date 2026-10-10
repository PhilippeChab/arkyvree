import { Page, Text, View } from "@react-pdf/renderer";

import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

type DiagnosticColumn = { centered?: boolean; label: string; width: string };

const MODIFIER_COLUMNS: DiagnosticColumn[] = [
  { label: "SOURCE TYPE", width: "20%" },
  { label: "TARGET", width: "35%" },
  { label: "OPERATOR", width: "15%", centered: true },
  { label: "VALUE", width: "15%", centered: true },
  { label: "TYPE", width: "15%", centered: true },
];

const REQUIREMENT_COLUMNS: DiagnosticColumn[] = [
  { label: "LEVEL", width: "15%" },
  { label: "TARGET", width: "35%" },
  { label: "OPERATOR", width: "15%", centered: true },
  { label: "VALUE", width: "15%", centered: true },
  { label: "CHAINING OP", width: "20%", centered: true },
];

/** The diagnostics page's counts above a section's tables. */
function DiagnosticCounts({ counts }: { counts: { color: string; label: string }[] }) {
  return (
    <View style={{ marginBottom: 10, flexDirection: "row", justifyContent: "space-between" }}>
      {counts.map(({ label, color }) => (
        <Text key={label} style={{ fontSize: FONT_SIZE.md, color }}>
          {label}
        </Text>
      ))}
    </View>
  );
}

/** The sheet's diagnostics page: what its modifiers and requirements did, and what its validation found. */
function DiagnosticsPage({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) {
  const identity = detailedCharacter.components.identity;
  const requirements = detailedCharacter.requirementEvaluator;
  const identityData = identity.getIdentity();
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} label="System Data" />

      {/* Requirements System Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Requirements System Status</Text>
        {(() => {
          const { invalidRequirements, unmetRequirementGroups, fulfilledRequirementGroups } =
            requirements.getRequirements();
          const requirementRow = (requirement: Requirement) => [
            requirement.level,
            requirement.target,
            requirement.operator,
            requirement.value,
            requirement.chainingOperator,
          ];

          return (
            <View>
              <DiagnosticCounts
                counts={[
                  {
                    label: `Total Requirement Groups: ${fulfilledRequirementGroups.length + unmetRequirementGroups.length}`,
                    color: "#333",
                  },
                  { label: `Fulfilled: ${fulfilledRequirementGroups.length}`, color: "#008800" },
                  { label: `Unmet: ${unmetRequirementGroups.length}`, color: "#cc0000" },
                  { label: `Invalid: ${invalidRequirements.length}`, color: "#cc9900" },
                ]}
              />
              <DiagnosticTable
                title="Unmet Requirements"
                columns={REQUIREMENT_COLUMNS}
                rows={unmetRequirementGroups.flat().map(requirementRow)}
                max={15}
                noun="unmet requirements"
              />
              <DiagnosticTable
                title="Fulfilled Requirements"
                columns={REQUIREMENT_COLUMNS}
                rows={fulfilledRequirementGroups.flat().map(requirementRow)}
                max={15}
                noun="fulfilled requirements"
              />
              <DiagnosticTable
                title="Invalid Requirements"
                columns={[
                  { label: "LEVEL", width: "20%" },
                  { label: "TARGET", width: "35%" },
                  { label: "WARNING MESSAGE", width: "45%" },
                ]}
                rows={invalidRequirements.map(({ requirement, warning }) => [
                  requirement.level,
                  requirement.target,
                  warning,
                ])}
              />
              {unmetRequirementGroups.length === 0 &&
                fulfilledRequirementGroups.length === 0 &&
                invalidRequirements.length === 0 && <Text style={styles.emptyMessage}>No requirements found</Text>}
            </View>
          );
        })()}
      </View>

      {/* Modifier System Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Modifier System Status</Text>
        {(() => {
          const { appliedModifiers, unappliedModifiers, inactiveModifiers, skippedModifiers } =
            detailedCharacter.modifierEvaluator.getModifiers();
          // Every modifier the evaluation met, once: an applied one can be skipped for another of its targets
          const seen = [...appliedModifiers, ...unappliedModifiers, ...inactiveModifiers];
          const total = new Set([...seen, ...skippedModifiers.map(({ modifier }) => modifier)].map(({ id }) => id))
            .size;
          const modifierRow = (modifier: Modifier) => [
            modifier.sourceType,
            modifier.target,
            modifier.operator,
            modifier.value,
            modifier.valueType,
          ];

          return (
            <View>
              <DiagnosticCounts
                counts={[
                  { label: `Total Modifiers: ${total}`, color: "#333" },
                  { label: `Applied: ${appliedModifiers.length}`, color: "#008800" },
                  { label: `Unapplied: ${unappliedModifiers.length}`, color: "#cc0000" },
                  { label: `Inactive: ${inactiveModifiers.length}`, color: "#666699" },
                  { label: `Skipped: ${skippedModifiers.length}`, color: "#cc9900" },
                ]}
              />
              <DiagnosticTable
                title="Applied Modifiers"
                columns={MODIFIER_COLUMNS}
                rows={appliedModifiers.map(modifierRow)}
                max={10}
                noun="applied modifiers"
              />
              <DiagnosticTable
                title="Unapplied Modifiers"
                columns={MODIFIER_COLUMNS}
                rows={unappliedModifiers.map(modifierRow)}
                max={10}
                noun="unapplied modifiers"
              />
              <DiagnosticTable
                title="Inactive Modifiers"
                columns={MODIFIER_COLUMNS}
                rows={inactiveModifiers.map(modifierRow)}
                max={10}
                noun="inactive modifiers"
              />
              <DiagnosticTable
                title="Skipped Modifiers"
                columns={[
                  { label: "SOURCE TYPE", width: "25%" },
                  { label: "TARGET", width: "35%" },
                  { label: "WARNING MESSAGE", width: "40%" },
                ]}
                rows={skippedModifiers.map(({ modifier, warning }) => [modifier.sourceType, modifier.target, warning])}
              />
              {skippedModifiers.length === 0 &&
                appliedModifiers.length === 0 &&
                unappliedModifiers.length === 0 &&
                inactiveModifiers.length === 0 && <Text style={styles.emptyMessage}>No modifiers found</Text>}
            </View>
          );
        })()}
      </View>
    </Page>
  );
}

/** One of the diagnostics page's tables, when it has rows: the first `max`, and how many more there are. */
function DiagnosticTable({
  title,
  columns,
  rows,
  max = rows.length,
  noun,
}: {
  columns: DiagnosticColumn[];
  max?: number;
  noun?: string;
  rows: (string | null | undefined)[][];
  title: string;
}) {
  if (rows.length === 0) return null;
  const cellStyle = (column: DiagnosticColumn) => ({
    width: column.width,
    paddingHorizontal: 4,
    textAlign: column.centered ? ("center" as const) : undefined,
  });
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: FONT_SIZE.lg, fontWeight: "bold", marginBottom: 5 }}>{title}</Text>
      <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#eee",
            borderBottomWidth: 1,
            borderBottomColor: "#ccc",
            paddingVertical: 4,
          }}
        >
          {columns.map((column) => (
            <Text
              key={column.label}
              style={{ ...cellStyle(column), fontSize: FONT_SIZE.sm, fontWeight: "bold", color: "#333" }}
            >
              {column.label}
            </Text>
          ))}
        </View>
        {rows.slice(0, max).map((row, index) => (
          <View
            key={index}
            style={{ flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#eee", paddingVertical: 3 }}
          >
            {row.map((cell, column) => (
              <Text key={column} style={{ ...cellStyle(columns[column]), fontSize: FONT_SIZE.base }}>
                {cell || "—"}
              </Text>
            ))}
          </View>
        ))}
        {rows.length > max && (
          <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
            <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
              ... and {rows.length - max} more {noun}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default DiagnosticsPage;
