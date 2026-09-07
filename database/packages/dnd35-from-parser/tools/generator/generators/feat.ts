import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { autoCompanionGrantModifiers, toCamelCase, collectImportsFromReq, expandTemplateDescription, normalizeName } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import {
  escapeString,
  truncateDesc,
  stringifyRequirement,
} from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";

// ---------------------------------------------------------------------------
// Generate FeatSeed[] TypeScript file from a FeatReference
// ---------------------------------------------------------------------------

type ExpandedFeat = {
  name: string;
  description: string;
  aptitudes: string[];
  requirements: RequirementEntry[];
  modifiers: ModifierSeed[];
  properties: { type: string; value: string }[];
  stackable?: boolean;
  selectable?: boolean;
  featNameMap: Record<string, string>;
};

export function generateFeatSeeds(ref: FeatReference): string {
  const lines: string[] = [];
  const imports = new Set<string>();
  const extraImports: string[] = [];
  // Separate template vs non-template feats
  const templateFeats: { entry: FeatReference["raw"][number]; detected: FeatReference["detected"][string]; mapped: FeatReference["mapping"][string] }[] = [];
  const regularFeats: { entry: FeatReference["raw"][number]; detected: FeatReference["detected"][string]; mapped: FeatReference["mapping"][string] }[] = [];

  const overrides = ref.mapping.overrides ?? {};
  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (!mapped || mapped.skip) continue;
    const ovr = overrides[entry.name];
    if (entry.featType === "epic" && ovr?.skip !== false) continue;
    const detected = ref.detected[entry.name];

    if (mapped.template) {
      templateFeats.push({ entry, detected, mapped });
    } else {
      regularFeats.push({ entry, detected, mapped });
    }
  }

  // Collect imports from all feats
  for (const { mapped } of [...regularFeats, ...templateFeats]) {
    const reqs = mapped.requirements ?? [];
    for (const req of reqs) collectImportsFromReq(req, imports);
  }

  // Check which template types we need
  const templateTypes = new Set(templateFeats.map(({ mapped }) => mapped.template!.type));
  const weaponFamilies = new Set(templateFeats.filter(({ mapped }) => mapped.template!.type === "weapon").map(({ mapped }) => mapped.template!.familyName));
  const needsProficiencyReqs = weaponFamilies.has("Improved Critical") || weaponFamilies.has("Weapon Focus");
  const needsSimpleWeapons = weaponFamilies.has("Simple Weapon Proficiency");
  const needsMartialWeapons = weaponFamilies.has("Martial Weapon Proficiency");
  const needsExoticWeapons = weaponFamilies.has("Exotic Weapon Proficiency");
  const needsMartialProfNe = needsMartialWeapons;
  // Only include stripSeparators when an emitted modifier actually uses it.
  // School templates only need it when their explicit modifiers reference a
  // `powers.groups.<placeholder>` path that the emitter rewrites per school.
  const schoolTemplatesNeedStripSeparators = templateFeats.some(({ mapped }) =>
    mapped.template?.type === "school"
    && mapped.modifiers?.some((m) => /^powers\.groups\.[^.]+\./.test(m.target))
  );
  const needsStripSeparators = templateTypes.has("skill") || schoolTemplatesNeedStripSeparators
    || templateFeats.some(({ mapped }) => mapped.modifiers?.some((m) => m.target.includes("items.weapons.")));

  // `feat` helper is needed when templates emit feat() calls: proficiency checks,
  // martial weapon NE check, or feat-referencing requirements that resolve via featNameMap
  const templateHasFeatReqs = templateFeats.some(({ detected, mapped }) => {
    if (mapped.template?.type !== "weapon" && mapped.template?.type !== "school") return false;
    const featNameMap = { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) };
    return (mapped.requirements ?? []).some((r) => {
      if ("chainingOperator" in r || !r.target.startsWith("feats.")) return false;
      const slug = r.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
      return !!featNameMap[slug];
    });
  });
  const needsFeatHelper = needsProficiencyReqs || needsMartialProfNe || templateHasFeatReqs;

  if (templateTypes.has("weapon") || templateTypes.has("crossbow")) {
    const weaponImports = ["ALL_WEAPONS"];
    if (needsProficiencyReqs || needsSimpleWeapons || needsMartialWeapons) weaponImports.push("SIMPLE_WEAPONS", "MARTIAL_WEAPONS");
    if (needsExoticWeapons) weaponImports.push("EXOTIC_WEAPONS");
    extraImports.push(`import { ${weaponImports.join(", ")} } from "@/database/packages/dnd35/v1/feats/weapons.ts";`);
    imports.add("eq");
    if (needsFeatHelper) imports.add("feat");
    if (needsProficiencyReqs) { imports.add("or"); imports.add("gte"); }
    if (needsMartialProfNe) imports.add("ne");
  }
  if (templateTypes.has("skill")) {
    extraImports.push(`import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";`);
  }
  if (templateTypes.has("school")) {
    extraImports.push(`import { MAGIC_SCHOOLS } from "@/shared/dnd3.5/spells.ts";`);
    if (needsFeatHelper) { imports.add("eq"); imports.add("feat"); }
  }
  if (needsStripSeparators) {
    extraImports.push(`import { stripSeparators } from "@/shared/utils.ts";`);
  }

  // System feats (wizard schools, caster level, weapon prof) use gte for class level reqs
  if (ref._meta.book === "srd") {
    imports.add("gte");
  }

  // Write imports
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  if (imports.size > 0) {
    const importList = Array.from(imports).sort().join(", ");
    lines.push(`import { ${importList} } from "@/database/packages/dnd35/seed-utils.ts";`);
  }
  for (const imp of extraImports) lines.push(imp);
  lines.push("");

  // Helper references for template weapon feats
  if (needsProficiencyReqs) {
    lines.push(`const SIMPLE_SET = new Set(SIMPLE_WEAPONS);`);
    lines.push(`const MARTIAL_SET = new Set(MARTIAL_WEAPONS);`);
    lines.push("");
    lines.push(`function proficiencyReqs(w: string) {`);
    lines.push(`  if (SIMPLE_SET.has(w)) return [or(eq(feat("Simple Weapon Proficiency")), eq(feat(\`Simple Weapon Proficiency: \${w}\`)))];`);
    lines.push(`  if (MARTIAL_SET.has(w)) return [or(eq(feat("Martial Weapon Proficiency")), eq(feat(\`Martial Weapon Proficiency: \${w}\`)))];`);
    lines.push(`  return [eq(feat(\`Exotic Weapon Proficiency: \${w}\`))];`);
    lines.push(`}`);
    lines.push("");
  }
  if (templateTypes.has("crossbow")) {
    lines.push(`const CROSSBOW_WEAPONS = ALL_WEAPONS.filter((w) => w.toLowerCase().includes("crossbow"));`);
    lines.push("");
  }

  // Generate regular feats by type
  const byType = new Map<string, typeof regularFeats>();
  for (const feat of regularFeats) {
    const type = feat.entry.featType;
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(feat);
  }

  for (const [type, feats] of byType) {
    const constName = `${type.toUpperCase().replace(/\s+/g, "_")}_FEATS`;
    lines.push(`export const ${constName}: FeatSeed[] = [`);

    for (const { entry, detected, mapped } of feats) {
      const expanded = buildExpandedFeat(entry, detected, mapped);
      emitFeatBlock(lines, expanded, "  ");
    }

    lines.push(`];`);
    lines.push("");
  }

  // Generate template feats
  const allTemplateNames = new Set(templateFeats.map(({ entry }) => entry.name));
  for (const { entry, detected, mapped } of templateFeats) {
    const template = mapped.template!;
    emitTemplateFeat(lines, entry, detected, mapped, template, allTemplateNames);
  }

  // System feats are only generated for the SRD — other books reuse them
  if (ref._meta.book === "srd") {
    emitWizardSchoolFeats(lines);
    emitWeaponProficiencyFeats(lines);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Build an expanded feat object from raw + mapping
// ---------------------------------------------------------------------------

function buildExpandedFeat(
  entry: FeatReference["raw"][number],
  detected: FeatReference["detected"][string],
  mapped: FeatReference["mapping"][string],
): ExpandedFeat {
  const name = normalizeName(entry.name);
  const baseModifiers = mapped.modifiers ?? [];
  const autoModifiers = autoCompanionGrantModifiers(name, mapped.description ?? entry.benefit ?? "");
  return {
    name,
    description: truncateDesc(mapped.description ?? entry.benefit),
    aptitudes: mapped.aptitudes ?? [],
    requirements: mapped.requirements ?? [],
    modifiers: [...baseModifiers, ...autoModifiers],
    properties: mapped.properties ?? [],
    stackable: mapped.stackable,
    selectable: mapped.selectable,
    featNameMap: detected?.featNameMap ?? {},
  };
}

// ---------------------------------------------------------------------------
// Emit a single feat block
// ---------------------------------------------------------------------------

function emitFeatBlock(lines: string[], feat: ExpandedFeat, indent: string): void {
  lines.push(`${indent}{`);
  lines.push(`${indent}  name: "${escapeString(feat.name)}",`);
  lines.push(`${indent}  description: "${escapeString(feat.description)}",`);
  if (feat.stackable) lines.push(`${indent}  stackable: true,`);
  if (feat.selectable === false) lines.push(`${indent}  selectable: false,`);
  lines.push(`${indent}  aptitudes: [${feat.aptitudes.map((a) => `"${escapeString(a)}"`).join(", ")}],`);

  if (feat.requirements.length > 0) {
    lines.push(`${indent}  requirements: [`);
    for (const req of feat.requirements) {
      lines.push(`${indent}    ${stringifyRequirement(req, 3)},`);
    }
    lines.push(`${indent}  ],`);
  }

  if (feat.modifiers.length > 0) {
    lines.push(`${indent}  modifiers: [`);
    for (const m of feat.modifiers) {
      lines.push(`${indent}    { target: "${escapeString(m.target)}", operator: "${escapeString(m.operator)}", value: "${escapeString(m.value)}", valueType: "${escapeString(m.valueType)}" },`);
    }
    lines.push(`${indent}  ],`);
  }

  if (feat.properties.length > 0) {
    lines.push(`${indent}  properties: [`);
    for (const p of feat.properties) {
      lines.push(`${indent}    { type: "${escapeString(p.type)}", value: "${escapeString(p.value)}" },`);
    }
    lines.push(`${indent}  ],`);
  }

  lines.push(`${indent}},`);
}

// ---------------------------------------------------------------------------
// Emit template feat expansion
// ---------------------------------------------------------------------------

function emitTemplateFeat(
  lines: string[],
  entry: FeatReference["raw"][number],
  detected: FeatReference["detected"][string],
  mapped: FeatReference["mapping"][string],
  template: NonNullable<FeatReference["mapping"][string]["template"]>,
  allTemplateNames: Set<string>,
): void {
  const familyName = template.familyName;
  const constName = toCamelCase(familyName);
  const aptitudes = mapped.aptitudes ?? [];
  const aptStr = aptitudes.map((a) => `"${escapeString(a)}"`).join(", ");
  const modifiers = mapped.modifiers ?? [];
  const requirements = mapped.requirements ?? [];
  const featNameMap = { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) };
  const description = mapped.description ?? entry.benefit;

  switch (template.type) {
    case "weapon":
      emitWeaponTemplate(lines, constName, familyName, aptStr, requirements, featNameMap, modifiers, allTemplateNames, description);
      break;
    case "crossbow":
      emitCrossbowTemplate(lines, constName, familyName, aptStr, description);
      break;
    case "skill":
      emitSkillTemplate(lines, constName, familyName, aptStr, modifiers);
      break;
    case "school":
      emitSchoolTemplate(lines, constName, familyName, aptStr, requirements, featNameMap, modifiers, allTemplateNames, description);
      break;
  }
}

function emitWeaponTemplate(
  lines: string[],
  constName: string,
  familyName: string,
  aptStr: string,
  requirements: RequirementEntry[],
  featNameMap: Record<string, string>,
  modifiers: ModifierSeed[],
  allTemplateNames: Set<string>,
  description: string,
): void {
  // Proficiency feats expand over their specific weapon list, not ALL_WEAPONS
  let weaponList = "ALL_WEAPONS";
  if (familyName === "Simple Weapon Proficiency") weaponList = "SIMPLE_WEAPONS";
  else if (familyName === "Martial Weapon Proficiency") weaponList = "MARTIAL_WEAPONS";
  else if (familyName === "Exotic Weapon Proficiency") weaponList = "EXOTIC_WEAPONS";

  const descTemplate = escapeString(expandTemplateDescription(truncateDesc(description), "weapon", "${w}"));

  lines.push(`export const ${constName}: FeatSeed[] = ${weaponList}.map((w) => ({`);
  lines.push(`  name: \`${familyName}: \${w}\`,`);
  lines.push(`  description: \`${descTemplate}\`,`);
  lines.push(`  aptitudes: [${aptStr}],`);

  // Requirements: expand generic "selected weapon" prereqs
  const staticReqs = requirements.filter((r) =>
    !("chainingOperator" in r) || !isSelectedWeaponReq(r),
  );
  const hasBabReq = staticReqs.some((r) => !("chainingOperator" in r) && r.target === "combat.bab");

  // Build requirements
  const reqLines: string[] = [];
  // Add proficiency requirement for combat feats that need it
  if (familyName === "Improved Critical" || familyName === "Weapon Focus") {
    reqLines.push(`    ...proficiencyReqs(w),`);
  }
  if (hasBabReq) {
    const bab = staticReqs.find((r) => !("chainingOperator" in r) && r.target === "combat.bab");
    if (bab && !("chainingOperator" in bab)) {
      reqLines.push(`    gte("combat.bab", ${bab.value}),`);
    }
  }
  // Martial Weapon Proficiency: individual feats require NOT having the blanket proficiency
  if (familyName === "Martial Weapon Proficiency") {
    reqLines.push(`    ne(feat("Martial Weapon Proficiency")),`);
  }
  // Add feat family prereqs (e.g. Weapon Specialization requires Weapon Focus)
  for (const req of staticReqs) {
    if ("chainingOperator" in req) continue;
    if (req.target === "combat.bab") continue; // already handled
    if (req.target.startsWith("classes.")) {
      reqLines.push(`    ${stringifyRequirement(req, 2)},`);
      continue;
    }
    if (req.target.startsWith("feats.")) {
      const featSlug = req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
      const featName = featNameMap[featSlug];
      if (featName && allTemplateNames.has(featName)) {
        reqLines.push(`    eq(feat(\`${featName}: \${w}\`)),`);
      } else if (featName) {
        reqLines.push(`    eq(feat("${escapeString(featName)}")),`);
      }
    }
  }

  if (reqLines.length > 0) {
    lines.push(`  requirements: [`);
    lines.push(...reqLines);
    lines.push(`  ],`);
  }

  // Modifiers: replace combat.X self-targeting paths with items.weapons.${slug}.X
  if (modifiers.length > 0) {
    lines.push(`  modifiers: [`);
    for (const m of modifiers) {
      const target = m.target.replace(/^combat\./, "items.weapons.${stripSeparators(w)}.");
      lines.push(`    { target: \`${target}\`, operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
    }
    lines.push(`  ],`);
  }

  lines.push(`  properties: [{ type: "FEAT_FAMILY", value: "${familyName}" }],`);
  lines.push(`}));`);
  lines.push("");
}

function emitCrossbowTemplate(
  lines: string[],
  constName: string,
  familyName: string,
  aptStr: string,
  description: string,
): void {
  const descTemplate = escapeString(expandTemplateDescription(truncateDesc(description), "crossbow", "${w}"));

  lines.push(`export const ${constName}: FeatSeed[] = CROSSBOW_WEAPONS.map((w) => ({`);
  lines.push(`  name: \`${familyName}: \${w}\`,`);
  lines.push(`  description: \`${descTemplate}\`,`);
  lines.push(`  aptitudes: [${aptStr}],`);
  lines.push(`  properties: [{ type: "FEAT_FAMILY", value: "${familyName}" }],`);
  lines.push(`}));`);
  lines.push("");
}

function emitSkillTemplate(
  lines: string[],
  constName: string,
  familyName: string,
  aptStr: string,
  modifiers: ModifierSeed[],
): void {
  lines.push(`export const ${constName}: FeatSeed[] = SKILL_NAMES.map((s) => ({`);
  lines.push(`  name: \`${familyName}: \${s}\`,`);
  lines.push(`  description: \`You get a +3 bonus on all \${s} checks.\`,`);
  lines.push(`  aptitudes: [${aptStr}],`);

  if (modifiers.length > 0) {
    lines.push(`  modifiers: [`);
    for (const m of modifiers) {
      // Replace generic skill path with per-skill
      const target = m.target.replace(/skills\.[^.]+/, "skills.${stripSeparators(s)}");
      lines.push(`    { target: \`${target}\`, operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
    }
    lines.push(`  ],`);
  } else {
    lines.push(`  modifiers: [`);
    lines.push(`    { target: \`skills.\${stripSeparators(s)}.misc\`, operator: "add", value: "3", valueType: "number" },`);
    lines.push(`  ],`);
  }

  lines.push(`  properties: [{ type: "FEAT_FAMILY", value: "${familyName}" }],`);
  lines.push(`}));`);
  lines.push("");
}

function emitSchoolTemplate(
  lines: string[],
  constName: string,
  familyName: string,
  aptStr: string,
  requirements: RequirementEntry[],
  featNameMap: Record<string, string>,
  modifiers: ModifierSeed[],
  allTemplateNames: Set<string>,
  description: string,
): void {
  const descTemplate = escapeString(expandTemplateDescription(truncateDesc(description), "school", "${s}"));
  lines.push(`export const ${constName}: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({`);
  lines.push(`  name: \`${familyName}: \${s}\`,`);
  lines.push(`  description: \`${descTemplate}\`,`);
  lines.push(`  aptitudes: [${aptStr}],`);

  // Requirements: for Greater Spell Focus, require Spell Focus of same school
  const focalReqs = requirements.filter((r) =>
    !("chainingOperator" in r) && r.target.startsWith("feats."),
  );
  if (focalReqs.length > 0) {
    const reqLines: string[] = [];
    for (const req of focalReqs) {
      if (!("chainingOperator" in req)) {
        const featSlug = req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
        const featName = featNameMap[featSlug];
        if (featName && allTemplateNames.has(featName)) {
          reqLines.push(`    eq(feat(\`${featName}: \${s}\`)),`);
        } else if (featName) {
          // Cross-book school template family (e.g. Spell Focus from SRD)
          reqLines.push(`    eq(feat(\`${featName}: \${s}\`)),`);
        }
      }
    }
    if (reqLines.length > 0) {
      lines.push(`  requirements: [`);
      lines.push(...reqLines);
      lines.push(`  ],`);
    }
  }

  if (modifiers.length > 0) {
    // Use the explicit modifiers from the reference JSON. Re-write any
    // `powers.groups.<placeholder>.` segment to the per-school slug. Other
    // targets (e.g. `skills.spellcraft.misc`) are kept verbatim — schools
    // don't parameterize skill names the way SKILL_NAMES does.
    lines.push(`  modifiers: [`);
    for (const m of modifiers) {
      const target = m.target.replace(
        /powers\.groups\.[^.]+\./,
        "powers.groups.${stripSeparators(s)}.",
      );
      lines.push(`    { target: \`${target}\`, operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
    }
    lines.push(`  ],`);
  }
  lines.push(`  properties: [{ type: "FEAT_FAMILY", value: "${familyName}" }],`);
  lines.push(`}));`);
  lines.push("");
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isSelectedWeaponReq(req: RequirementEntry): boolean {
  if ("chainingOperator" in req) return req.children.some(isSelectedWeaponReq);
  return req.target.includes("selectedweapon") || req.target.includes("chosen");
}

// ---------------------------------------------------------------------------
// Wizard school system feats
// ---------------------------------------------------------------------------

function emitWizardSchoolFeats(lines: string[]): void {
  lines.push(`// ---------------------------------------------------------------------------`);
  lines.push(`// Wizard School feats (system-generated)`);
  lines.push(`// ---------------------------------------------------------------------------`);
  lines.push(``);
  lines.push(`import { WIZARD_SCHOOLS, WIZARD_PROHIBITED_SCHOOL } from "@/database/packages/dnd35/v1/wizard-schools/data.ts";`);
  lines.push(``);
  lines.push(`const SPEC = "Wizard Specialization";`);
  lines.push(`const PROHIB = "Prohibited School";`);
  lines.push(``);
  lines.push(`export const WIZARD_SCHOOL_FEATS: FeatSeed[] = [`);
  lines.push(`  ...WIZARD_SCHOOLS.map((s) => ({`);
  lines.push(`    name: \`\${s.name} Specialist\`,`);
  lines.push(`    description: s.description,`);
  lines.push(`    aptitudes: [SPEC],`);
  lines.push(`    requirements: [gte("classes.wizard.level", 1)],`);
  lines.push(`    modifiers: [{`);
  lines.push(`      target: "aptitudes.prohibitedschool.allowed",`);
  lines.push(`      operator: "add",`);
  lines.push(`      value: String(s.prohibitedSchoolCount),`);
  lines.push(`      valueType: "number",`);
  lines.push(`    }],`);
  lines.push(`  })),`);
  lines.push(`  {`);
  lines.push(`    name: "Generalist",`);
  lines.push(`    description: "A generalist wizard does not specialize in any school of magic. They have no prohibited schools and gain no bonus spell slots, but can freely learn spells from all schools.",`);
  lines.push(`    aptitudes: [SPEC],`);
  lines.push(`    requirements: [gte("classes.wizard.level", 1)],`);
  lines.push(`  },`);
  lines.push(`  ...WIZARD_SCHOOLS.map((s) => ({`);
  lines.push(`    name: \`Prohibit \${s.name}\`,`);
  lines.push(`    description: \`You cannot learn, prepare, or cast spells from the school of \${s.name}. All spells from this school are removed from your spell list.\`,`);
  lines.push(`    aptitudes: [PROHIB],`);
  lines.push(`    requirements: [gte("classes.wizard.level", 1)],`);
  lines.push(`    properties: [{ type: WIZARD_PROHIBITED_SCHOOL, value: s.name }],`);
  lines.push(`  })),`);
  lines.push(`];`);
  lines.push(``);
}

// ---------------------------------------------------------------------------
// Weapon proficiency system feats
// ---------------------------------------------------------------------------

function emitWeaponProficiencyFeats(lines: string[]): void {
  lines.push(`// ---------------------------------------------------------------------------`);
  lines.push(`// Weapon proficiency feats (system-generated)`);
  lines.push(`// ---------------------------------------------------------------------------`);
  lines.push(``);
  lines.push(`export const WEAPON_PROFICIENCY_FEATS: FeatSeed[] = [`);
  lines.push(`  ...SIMPLE_WEAPONS.map((w) => ({`);
  lines.push(`    name: \`Simple Weapon Proficiency: \${w}\`,`);
  lines.push(`    description: \`You are proficient with the \${w.toLowerCase()}.\`,`);
  lines.push(`    aptitudes: ["General"],`);
  lines.push(`    selectable: false as const,`);
  lines.push(`  })),`);
  lines.push(`  ...MARTIAL_WEAPONS.map((w) => ({`);
  lines.push(`    name: \`Martial Weapon Proficiency: \${w}\`,`);
  lines.push(`    description: \`You are proficient with the \${w.toLowerCase()}.\`,`);
  lines.push(`    aptitudes: ["General"],`);
  lines.push(`    selectable: false as const,`);
  lines.push(`  })),`);
  lines.push(`];`);
  lines.push(``);
}
