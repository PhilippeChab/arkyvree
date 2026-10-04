import { StyleSheet } from "@react-pdf/renderer";

export const FONT_SIZE = {
  xs: 6,
  sm: 7,
  base: 8,
  md: 9,
  lg: 10,
  xl: 11,
  xxl: 12,
  xxxl: 13,
  title: 16,
} as const;

// Canonical display order for spell properties, matching D&D 3.5 stat-block convention.
// Keys not in this list are appended alphabetically.

export const styles = StyleSheet.create({
  page: {
    padding: 20,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
    fontSize: FONT_SIZE.md,
  },
  header: {
    marginBottom: 10,
    borderBottom: "1px solid #000",
    paddingBottom: 5,
    flexDirection: "column",
    width: "100%",
  },
  headerLeft: {
    width: "60%",
  },
  portrait: {
    width: 90,
    height: 80,
    objectFit: "cover",
    borderRadius: 4,
  },
  portraitPlaceholder: {
    width: 90,
    height: 80,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#bbb",
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  portraitPlaceholderText: {
    fontSize: FONT_SIZE.sm,
    color: "#999",
  },
  firstHeaderRight: {
    width: "40%",
    flexDirection: "column",
  },
  secondHeaderRight: {
    width: "40%",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    textAlign: "right",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    width: "100%",
  },
  headerLabel: {
    fontSize: FONT_SIZE.md,
    color: "#666",
  },
  headerValue: {
    fontSize: FONT_SIZE.md,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: FONT_SIZE.lg,
    marginTop: 2,
    color: "#444",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "bold",
    marginBottom: 4,
    borderBottom: "1px solid #888",
    paddingBottom: 2,
    color: "#333",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
  },
  column: {
    flexDirection: "column",
  },
  twoColumn: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  halfWidth: {
    width: "49%",
  },
  thirdWidth: {
    width: "32%",
  },
  abilityBox: {
    width: "16%",
    padding: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  abilityName: {
    fontWeight: "bold",
    fontSize: FONT_SIZE.md,
    marginBottom: 2,
  },
  abilityScore: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: "bold",
    marginVertical: 2,
  },
  abilityMod: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "bold",
  },
  statBox: {
    width: "18%",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 4,
    alignItems: "center",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    marginBottom: 2,
    color: "#666",
    textAlign: "center",
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: "bold",
  },
  savingThrowBox: {
    width: "32%",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 4,
    alignItems: "center",
    backgroundColor: "#f0f8ff",
  },
  skillsContainer: {
    flexDirection: "column",
    width: "100%",
  },
  skillsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 2,
    marginBottom: 1,
    borderBottom: "1px solid #333",
    backgroundColor: "#ddd",
  },
  skillHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
  },
  skillItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1,
    paddingHorizontal: 2,
    borderBottom: "0.5px solid #eee",
  },
  skillNameContainer: {
    width: "32%",
    flexDirection: "row",
  },
  skillCheck: {
    width: "5%",
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    fontWeight: "bold",
  },
  skillName: {
    fontSize: FONT_SIZE.base,
    width: "40%",
  },
  skillNameUntrained: {
    fontSize: FONT_SIZE.base,
    width: "40%",
    color: "#888",
  },
  skillAbility: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillAbilityUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillRank: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillRankUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillMod: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillModUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillOther: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillOtherUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillWeight: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillWeightUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillBonus: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    fontWeight: "bold",
  },
  skillBonusUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    fontWeight: "bold",
    color: "#888",
  },
  equipmentSection: {
    marginBottom: 4,
  },
  equipmentTitle: {
    fontWeight: "bold",
    fontSize: FONT_SIZE.md,
    marginBottom: 3,
    color: "#444",
    borderBottom: "0.5px solid #ccc",
    paddingBottom: 1,
  },
  equipmentItem: {
    fontSize: FONT_SIZE.base,
    marginBottom: 2,
  },
  featSection: {
    marginBottom: 5,
  },
  featName: {
    fontSize: FONT_SIZE.md,
    fontWeight: "bold",
  },
  featDesc: {
    fontSize: FONT_SIZE.sm,
    color: "#555",
    marginBottom: 3,
  },
  classInfo: {
    fontSize: FONT_SIZE.md,
    marginBottom: 2,
    padding: 3,
    borderBottom: "0.5px solid #ddd",
  },
  emptyMessage: {
    fontSize: FONT_SIZE.md,
    fontStyle: "italic",
    color: "#888",
    textAlign: "center",
    padding: 5,
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 20,
    right: 20,
    padding: 5,
    borderTop: "0.5px solid #ccc",
    fontSize: FONT_SIZE.sm,
    color: "#888",
    textAlign: "center",
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 6,
  },
  tableHeader: {
    backgroundColor: "#eee",
    padding: 3,
    fontSize: FONT_SIZE.base,
    fontWeight: "bold",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    padding: 2,
  },
  tableCell: {
    fontSize: FONT_SIZE.base,
    padding: 2,
  },
  inventoryTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    marginTop: 5,
  },
  inventoryTableHeader: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 4,
  },
  inventoryTableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingVertical: 3,
  },
  inventoryItemCell: {
    width: "38%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
  },
  inventoryQuantityCell: {
    width: "10%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
  },
  inventoryWeightCell: {
    width: "12%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryValueCell: {
    width: "12%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryTotalValueCell: {
    width: "14%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryChargesCell: {
    width: "14%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
  },
  inventoryTableFooter: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderTopColor: "#aaa",
    paddingVertical: 4,
    fontWeight: "bold",
  },
  inventoryHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
  },
  inventoryFooterText: {
    fontSize: FONT_SIZE.base,
    fontWeight: "bold",
  },
  inventoryCategory: {
    fontSize: FONT_SIZE.md,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaa",
  },
  equippedItem: {
    fontWeight: "bold",
  },
  spellTableHeader: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 2,
  },
  spellHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
    paddingHorizontal: 4,
  },
  spellRow: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  spellRowInner: {
    flexDirection: "row",
    paddingVertical: 1,
  },
  spellName: {
    fontSize: FONT_SIZE.base,
    width: "40%",
    paddingHorizontal: 4,
    fontWeight: "bold",
  },
  spellSchool: {
    fontSize: FONT_SIZE.base,
    width: "20%",
    paddingHorizontal: 4,
  },
  spellSave: {
    fontSize: FONT_SIZE.base,
    width: "30%",
    paddingHorizontal: 4,
  },
  spellDc: {
    fontSize: FONT_SIZE.base,
    width: "10%",
    paddingHorizontal: 4,
    textAlign: "center",
  },
  spellDetails: {
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  spellProperties: {
    fontSize: FONT_SIZE.sm,
    color: "#666",
  },
  spellDescription: {
    fontSize: FONT_SIZE.sm,
    color: "#444",
    marginTop: 2,
  },
});

/** The header of the sheet's pages after the first: the character's name, and what the page holds. */
