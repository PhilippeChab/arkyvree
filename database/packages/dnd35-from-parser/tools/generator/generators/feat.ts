import {
  escapeTemplate,
  featLines,
  importLines,
  type ImportTable,
  listField,
  quote,
  REQUIREMENT_IMPORTS,
  stringifyFeatModifier,
  stringifyProperty,
  stringifyRequirement,
  truncateDesc,
} from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";
import {
  autoCompanionGrantModifiers,
  expandTemplateDescription,
  normalizeName,
  toCamelCase,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { favoredEnemyFeats } from "@/database/packages/dnd35/content/creatureTypes.ts";
import { feat } from "@/database/packages/dnd35/content/requirements.ts";
import type {
  FeatSeed,
  ModifierSeed,
  RequirementCondition,
  RequirementEntry,
  WizardSchoolDefinition,
} from "@/database/packages/dnd35/content/types.ts";
import { weaponProficiencyFeats } from "@/database/packages/dnd35/content/weapons.ts";
import { wizardSchoolFeats } from "@/database/packages/dnd35/content/wizardSchools.ts";

// ---------------------------------------------------------------------------
// The feats a feat reference makes
// ---------------------------------------------------------------------------

type FeatEntry = {
  entry: FeatReference["raw"][number];
  detected: FeatReference["detected"][string];
  mapped: FeatReference["mapping"][string];
};
type TemplateType = NonNullable<FeatEntry["mapped"]["template"]>["type"];

/** A template feat's family, which the generated code makes a feat of per item (weapon, skill, school…). */
type TemplateFamily = {
  type: TemplateType;
  constName: string;
  familyName: string;
  aptitudes: string[];
  requirements: RequirementEntry[];
  featNameMap: Record<string, string>;
  modifiers: ModifierSeed[];
  description: string;
};

/**
 * What a feat reference makes: its feats by feat type, and its template families. An epic feat is left out unless an
 * override keeps it.
 */
function referenceFeats(ref: FeatReference) {
  const kept: FeatEntry[] = [];
  for (const entry of ref.raw) {
    const mapped = ref.mapping[entry.name];
    if (!mapped || mapped.skip) continue;
    if (entry.featType === "epic" && ref.overrides?.[entry.name]?.skip !== false) continue;
    kept.push({ entry, detected: ref.detected[entry.name], mapped });
  }

  const byType = new Map<string, FeatSeed[]>();
  const templates: TemplateFamily[] = [];
  for (const { entry, detected, mapped } of kept) {
    if (mapped.template) {
      const { type, familyName } = mapped.template;
      templates.push({
        type,
        constName: toCamelCase(familyName),
        familyName,
        aptitudes: mapped.aptitudes ?? [],
        requirements: mapped.requirements ?? [],
        featNameMap: { ...(detected?.featNameMap ?? {}), ...(mapped.featNameMap ?? {}) },
        modifiers: mapped.modifiers ?? [],
        description: mapped.description ?? entry.benefit,
      });
      continue;
    }
    const name = normalizeName(entry.name);
    const feats = byType.get(entry.featType) ?? [];
    byType.set(entry.featType, feats);
    feats.push({
      name,
      description: truncateDesc(mapped.description ?? entry.benefit),
      ...(mapped.stackable ? { stackable: true } : {}),
      ...(mapped.selectable === false ? { selectable: false } : {}),
      aptitudes: mapped.aptitudes ?? [],
      requirements: mapped.requirements ?? [],
      modifiers: [
        ...(mapped.modifiers ?? []),
        ...autoCompanionGrantModifiers(name, mapped.description ?? entry.benefit ?? ""),
      ],
      properties: mapped.properties ?? [],
    });
  }
  return {
    byType,
    templates,
    templateNames: new Set(kept.filter(({ mapped }) => mapped.template).map(({ entry }) => entry.name)),
  };
}

/**
 * The feats no reference lists that the core rules' feat files add, each: its file and export, the content code the
 * generated file builds it with (and the names that code uses), and the feats that code builds.
 */
const CORE_SYSTEM_FEATS: {
  file: string;
  name: string;
  code: string;
  uses: string[];
  build: (wizardSchools: WizardSchoolDefinition[]) => FeatSeed[];
}[] = [
  {
    file: "feats.ts",
    name: "WIZARD_SCHOOL_FEATS",
    code: "wizardSchoolFeats(WIZARD_SCHOOLS)",
    uses: ["wizardSchoolFeats", "WIZARD_SCHOOLS"],
    build: wizardSchoolFeats,
  },
  {
    file: "feats.ts",
    name: "WEAPON_PROFICIENCY_FEATS",
    code: "weaponProficiencyFeats",
    uses: ["weaponProficiencyFeats"],
    build: () => weaponProficiencyFeats,
  },
  {
    file: "favoredEnemy.ts",
    name: "favoredEnemy",
    code: "favoredEnemyFeats",
    uses: ["favoredEnemyFeats"],
    build: () => favoredEnemyFeats,
  },
];

/** The core rules' system feats (the wizard's school choice, the weapon proficiencies, the favored enemies). */
export function coreSystemFeats(wizardSchools: WizardSchoolDefinition[]): FeatSeed[] {
  return CORE_SYSTEM_FEATS.flatMap(({ build }) => build(wizardSchools));
}

/**
 * A feat reference's feats as the aptitude list reads them (names, aptitudes, modifiers): a template family once, as
 * its feats share their aptitudes and their modifiers only differ in the item they target.
 */
export function featAptitudeSources(ref: FeatReference): Pick<FeatSeed, "name" | "aptitudes" | "modifiers">[] {
  const { byType, templates } = referenceFeats(ref);
  return [
    ...[...byType.values()].flat(),
    ...templates.map(({ familyName, aptitudes, modifiers }) => ({ name: familyName, aptitudes, modifiers })),
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The slug of the feat a `feats.<slug>.possessed` check names. */
function featSlug(req: RequirementCondition): string {
  return req.target.replace(/^feats\./, "").replace(/\.possessed$/, "");
}

// ---------------------------------------------------------------------------
// Emit template feat expansion
// ---------------------------------------------------------------------------

/** Starts a template: its feats over `list`, named and described after each item (`variable`). */
function openTemplate(
  { lines, uses }: FeatFile,
  { constName, familyName, aptitudes }: TemplateFamily,
  list: string,
  variable: string,
  description: string,
): void {
  uses.add(list);
  lines.push(`export const ${constName}: FeatSeed[] = ${list}.map((${variable}) => ({`);
  lines.push(`  name: \`${escapeTemplate(familyName)}: \${${variable}}\`,`);
  lines.push(`  description: \`${description}\`,`);
  lines.push(`  aptitudes: [${aptitudes.map(quote).join(", ")}],`);
}

/** A template's description, each mention of the chosen item made the item (`variable`). */
function templateDescription({ description, type }: TemplateFamily, variable: string): string {
  const ITEM = "\u0000";
  return expandTemplateDescription(truncateDesc(description), type, ITEM)
    .split(ITEM)
    .map(escapeTemplate)
    .join(`\${${variable}}`);
}

/** A template's requirements, when it has some. */
function emitTemplateRequirements({ lines }: FeatFile, reqLines: string[]): void {
  if (reqLines.length === 0) return;
  lines.push(`  requirements: [`, ...reqLines, `  ],`);
}

/**
 * A template's modifiers, each target made the item's by `retarget`. A requirement on one throws: its targets would
 * have to be the item's too.
 */
function emitTemplateModifiers(
  { lines, uses }: FeatFile,
  modifiers: ModifierSeed[],
  retarget: (target: string) => string,
): void {
  lines.push(
    ...listField(
      "modifiers",
      modifiers.map((m) => {
        if (m.requirements?.length) throw new Error(`${m.target}: a template feat's modifier can't have requirements`);
        const target = retarget(escapeTemplate(m.target));
        if (target.includes("${stripSeparators(")) uses.add("stripSeparators");
        return stringifyFeatModifier(m, uses, 2, `\`${target}\``);
      }),
      "  ",
    ),
  );
}

/** Ends a template: its feats' family. */
function closeTemplate({ lines }: FeatFile, familyName: string): void {
  lines.push(`  properties: [${stringifyProperty({ type: "FEAT_FAMILY", value: familyName })}],`);
  lines.push(`}));`);
  lines.push("");
}

/** Having the feat `featName`, or its feat for the item (`variable`) when `perItem`: `eq(feat(...))`. */
function featRequirement({ uses }: FeatFile, featName: string, perItem: boolean, variable: string): string {
  uses.add("eq");
  uses.add("feat");
  return perItem ? `eq(feat(\`${escapeTemplate(featName)}: \${${variable}}\`))` : `eq(feat(${quote(featName)}))`;
}

/** A single martial weapon's proficiency feat is for a character without them all. */
const NOT_MARTIAL_PROFICIENT: RequirementCondition = {
  target: feat("Martial Weapon Proficiency"),
  operator: "not_equal",
  value: "true",
  valueType: "boolean",
};

/** A weapon family's modifier target, made the item's: a combat.X path becomes items.weapons.<weapon>.X. */
const weaponTarget = (target: string) => target.replace(/^combat\./, "items.weapons.${stripSeparators(w)}.");

/** Weapon proficiency families expand over their own weapons, the others over every weapon. */
const WEAPON_LISTS: Record<string, string> = {
  "Simple Weapon Proficiency": "SIMPLE_WEAPONS",
  "Martial Weapon Proficiency": "MARTIAL_WEAPONS",
  "Exotic Weapon Proficiency": "EXOTIC_WEAPONS",
};

function emitWeaponTemplate(file: FeatFile, family: TemplateFamily, templateNames: Set<string>): void {
  const { familyName, requirements, featNameMap, modifiers } = family;
  openTemplate(file, family, WEAPON_LISTS[familyName] ?? "ALL_WEAPONS", "w", templateDescription(family, "w"));

  // Requirements: expand generic "selected weapon" prereqs
  const staticReqs = requirements.filter((r): r is RequirementCondition => !("chainingOperator" in r));
  const reqLines: string[] = [];
  // Add proficiency requirement for combat feats that need it
  if (familyName === "Improved Critical" || familyName === "Weapon Focus") {
    file.uses.add("proficiencyRequirements");
    reqLines.push(`    ...proficiencyRequirements(w),`);
  }
  const bab = staticReqs.find((r) => r.target === "combat.bab");
  if (bab) reqLines.push(`    ${stringifyRequirement(bab, file.uses, 2)},`);
  // Martial Weapon Proficiency: individual feats require NOT having the blanket proficiency
  if (familyName === "Martial Weapon Proficiency") {
    reqLines.push(`    ${stringifyRequirement(NOT_MARTIAL_PROFICIENT, file.uses, 2)},`);
  }
  // Add feat family prereqs (e.g. Weapon Specialization requires Weapon Focus)
  for (const req of staticReqs) {
    if (req.target.startsWith("classes.")) {
      reqLines.push(`    ${stringifyRequirement(req, file.uses, 2)},`);
    } else if (req.target.startsWith("feats.")) {
      const featName = featNameMap[featSlug(req)];
      if (featName) reqLines.push(`    ${featRequirement(file, featName, templateNames.has(featName), "w")},`);
    }
  }
  emitTemplateRequirements(file, reqLines);

  emitTemplateModifiers(file, modifiers, weaponTarget);
  closeTemplate(file, familyName);
}

function emitCrossbowTemplate(file: FeatFile, family: TemplateFamily): void {
  openTemplate(file, family, "CROSSBOW_WEAPONS", "w", templateDescription(family, "w"));
  emitTemplateModifiers(file, family.modifiers, weaponTarget);
  closeTemplate(file, family.familyName);
}

/**
 * A skill or school template's requirements, for its item (`variable`): a feat it requires is that feat's for the item
 * (Greater Spell Focus requires Spell Focus in its school), the feat's family a template of this book's or another's
 * (Spell Focus from the SRD); any other requirement as it is.
 */
function itemRequirementLines(
  file: FeatFile,
  { requirements, featNameMap }: TemplateFamily,
  variable: string,
): string[] {
  const lines: string[] = [];
  for (const req of requirements) {
    if (!("chainingOperator" in req) && req.target.startsWith("feats.")) {
      const featName = featNameMap[featSlug(req)];
      if (featName) lines.push(`    ${featRequirement(file, featName, true, variable)},`);
    } else {
      lines.push(`    ${stringifyRequirement(req, file.uses, 2)},`);
    }
  }
  return lines;
}

/** A feat per skill: its description and modifiers name the skill (`{skill}`, `skills.skill.…`). */
function emitSkillTemplate(file: FeatFile, family: TemplateFamily): void {
  openTemplate(file, family, "SKILL_NAMES", "s", templateDescription(family, "s"));
  emitTemplateRequirements(file, itemRequirementLines(file, family, "s"));
  emitTemplateModifiers(file, family.modifiers, (target) =>
    target.replace(/skills\.[^.]+/, "skills.${stripSeparators(s)}"),
  );
  closeTemplate(file, family.familyName);
}

function emitSchoolTemplate(file: FeatFile, family: TemplateFamily): void {
  const { modifiers } = family;
  openTemplate(file, family, "MAGIC_SCHOOLS", "s", templateDescription(family, "s"));
  emitTemplateRequirements(file, itemRequirementLines(file, family, "s"));

  // Use the explicit modifiers from the reference JSON. Re-write any
  // `powers.groups.<placeholder>.` segment to the per-school slug. Other
  // targets (e.g. `skills.spellcraft.misc`) are kept verbatim — schools
  // don't parameterize skill names the way SKILL_NAMES does.
  emitTemplateModifiers(file, modifiers, (target) =>
    target.replace(/powers\.groups\.[^.]+\./, "powers.groups.${stripSeparators(s)}."),
  );
  closeTemplate(file, family.familyName);
}

const TEMPLATE_EMITTERS: Record<
  TemplateType,
  (file: FeatFile, family: TemplateFamily, templateNames: Set<string>) => void
> = {
  weapon: emitWeaponTemplate,
  crossbow: emitCrossbowTemplate,
  skill: emitSkillTemplate,
  school: emitSchoolTemplate,
};

// ---------------------------------------------------------------------------
// Generate FeatSeed[] TypeScript file from a FeatReference
// ---------------------------------------------------------------------------

/** Where each name the generated feats use comes from, in the order the imports are written. */
const IMPORTS: ImportTable = [
  ...REQUIREMENT_IMPORTS,
  [
    "@/database/packages/dnd35/content/weapons.ts",
    [
      "ALL_WEAPONS",
      "SIMPLE_WEAPONS",
      "MARTIAL_WEAPONS",
      "EXOTIC_WEAPONS",
      "CROSSBOW_WEAPONS",
      "proficiencyRequirements",
      "weaponProficiencyFeats",
    ],
  ],
  ["@/database/packages/dnd35/content/skills.ts", ["SKILL_NAMES"]],
  ["@/shared/dnd3.5/spells.ts", ["MAGIC_SCHOOLS"]],
  ["@/shared/utils.ts", ["stripSeparators"]],
  ["@/database/packages/dnd35/content/wizardSchools.ts", ["wizardSchoolFeats"]],
  ["@/database/packages/dnd35/content/creatureTypes.ts", ["favoredEnemyFeats"]],
  ["@/database/packages/dnd35-from-parser/generated/srd/wizard-schools/data.ts", ["WIZARD_SCHOOLS"]],
];

/** The generated file's code, and the names it uses: what its imports are written from. */
type FeatFile = { lines: string[]; uses: Set<string> };

/** The system feats of the core rules' feat file `fileName`. */
function emitSystemFeats(file: FeatFile, fileName: string): void {
  for (const { name, code, uses } of CORE_SYSTEM_FEATS.filter((systemFeats) => systemFeats.file === fileName)) {
    file.lines.push(`export const ${name}: FeatSeed[] = ${code};`);
    for (const used of uses) file.uses.add(used);
  }
  file.lines.push("");
}

/** A feats file's code: its imports, written from the names its code uses, then its code. */
function featFileCode(file: FeatFile): string {
  return [
    `import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";`,
    ...importLines(file.uses, IMPORTS),
    "",
    ...file.lines,
  ].join("\n");
}

export function generateFeatSeeds(ref: FeatReference): string {
  const { byType, templates, templateNames } = referenceFeats(ref);
  const file: FeatFile = { lines: [], uses: new Set() };

  for (const [type, feats] of byType) {
    file.lines.push(`export const ${type.toUpperCase().replace(/\s+/g, "_")}_FEATS: FeatSeed[] = [`);
    for (const feat of feats) file.lines.push(...featLines(feat, file.uses));
    file.lines.push(`];`, "");
  }

  for (const family of templates) TEMPLATE_EMITTERS[family.type](file, family, templateNames);

  // System feats are only generated for the SRD — other books reuse them
  if (ref._meta.book === "srd") {
    file.lines.push(`// The system feats (\`coreSystemFeats\`): no reference lists them.`);
    emitSystemFeats(file, "feats.ts");
  }
  return featFileCode(file);
}

/** The core rules' favored enemy feats file (favoredEnemy.ts). */
export function generateFavoredEnemyFeats(): string {
  const file: FeatFile = { lines: [], uses: new Set() };
  emitSystemFeats(file, "favoredEnemy.ts");
  return featFileCode(file);
}
