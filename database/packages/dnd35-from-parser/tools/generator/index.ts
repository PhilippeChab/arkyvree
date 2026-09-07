import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ClassReference, DomainReference, FeatReference, ItemReference, MagicItemReference, RaceReference, SpellReference, WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { toCamelCase, discoverRefs, parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";
import { generateClassSeed, generateFeatSeeds as generateClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/generators/class.ts";
import { generateFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/generators/feat.ts";
import { generateSpellFiles } from "@/database/packages/dnd35-from-parser/tools/generator/generators/spell.ts";
import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { buildDomainSeeds, buildDomainFeatPoolSeeds, buildFavoredEnemyFeats, buildFeatSeeds, buildItemSeeds, buildMagicItemSeeds, buildRaceSeeds, buildSpellSeeds, buildWizardSchoolSeeds, collectAptitudes } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { getArmorDefinition, getShieldDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/armorGenerator.ts";

// ---------------------------------------------------------------------------
// CLI: bun database/packages/dnd35-from-parser/tools/generator/index.ts <json-path>
// ---------------------------------------------------------------------------

const BASE_DIR = join(import.meta.dirname!, "../../");
let quiet = false;

function generateRef(jsonPath: string, bookOverride?: string) {
  const raw = readFileSync(jsonPath, "utf-8");
  const ref = JSON.parse(raw);

  const meta = ref._meta;
  if (!meta) {
    console.error(`Invalid reference file: missing _meta in ${jsonPath}`);
    return;
  }

  const book = bookOverride ?? meta.book;

  switch (meta.type) {
    case "class":
      generateClass(ref as ClassReference, book);
      break;
    case "feat":
      generateFeat(ref as FeatReference, book);
      break;
    case "spell":
      generateSpell(ref as SpellReference, book);
      break;
    case "wizardSchool":
      generateWizardSchool(ref as WizardSchoolReference, book);
      break;
    case "domain":
      generateDomain(ref as DomainReference, book);
      break;
    case "race":
      generateRace(ref as RaceReference, book);
      break;
    case "item":
      generateItem(ref as ItemReference, book);
      break;
    case "magicItem":
      generateMagicItem(ref as MagicItemReference, book);
      break;
    default:
      console.error(`Unknown type: ${meta.type}. Supported: class, feat, spell, wizardSchool, domain, race, item, magicItem`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length >= 1 && !args[0].startsWith("--")) {
    // Single file mode
    const jsonPath = args[0];
    const bookIdx = args.indexOf("--book");
    const bookOverride = bookIdx >= 0 ? args[bookIdx + 1] : undefined;
    generateRef(jsonPath, bookOverride);
  } else {
    // Generate all: discover every reference and regenerate
    const { bookFilter, typeFilter } = parseCliArgs();
    const refDir = join(BASE_DIR, "reference");
    let refs = discoverRefs(refDir);
    if (bookFilter) refs = refs.filter((r) => r.book === bookFilter);
    if (typeFilter) refs = refs.filter((r) => r.type === typeFilter);

    quiet = true;
    for (const ref of refs) {
      generateRef(ref.path);
    }
  }
}

function generateClass(ref: ClassReference, book: string) {
  const slug = toCamelCase(ref.raw.name);

  // Generate class seed .ts
  const classCode = generateClassSeed(ref);
  const classPath = join(BASE_DIR, "generated", book, "classes", `${slug}.ts`);
  mkdirSync(dirname(classPath), { recursive: true });
  writeFileSync(classPath, classCode);
  if (!quiet) console.log(`Generated class seed: ${classPath}`);

  // Generate class feature seeds .ts
  const featCode = generateClassFeatSeeds(ref);
  const featPath = join(BASE_DIR, "generated", book, "feats", "classes", `${slug}.ts`);
  mkdirSync(dirname(featPath), { recursive: true });
  writeFileSync(featPath, featCode);
  if (!quiet) console.log(`Generated feat seeds: ${featPath}`);

  regenerateFavoredEnemyFeats(book);

  // Regenerate aptitudes.ts for this book (covers books with no standalone feats file)
  regenerateAptitudes(book);

  // Regenerate cowFeats.ts for this book (bonus feat pools from bonusFeatLists)
  regenerateCowFeats(book);

  // Regenerate cowSpells.ts for this book (cross-book spells needing COW)
  regenerateCowSpells(book);

  // Regenerate aggregate index files
  regenerateClassIndex(book);
  regenerateClassFeatIndex(book);
  regenerateFeatIndex(book);

  if (!quiet) console.log(`\nDone! Review the generated files and copy to database/packages/dnd35/ when ready.`);
}

function generateFeat(ref: FeatReference, book: string) {
  const featCode = generateFeatSeeds(ref);
  const featPath = join(BASE_DIR, "generated", book, "feats", "feats.ts");
  mkdirSync(dirname(featPath), { recursive: true });
  writeFileSync(featPath, featCode);
  if (!quiet) console.log(`Generated feat seeds: ${featPath}`);

  regenerateFavoredEnemyFeats(book);
  regenerateAptitudes(book);
  regenerateFeatIndex(book);

  if (!quiet) console.log(`\nDone! Review the generated file and copy to database/packages/dnd35/ when ready.`);
}

function generateSpell(ref: SpellReference, book: string) {
  const { spells } = buildSpellSeeds(ref, book);
  if (!quiet) console.log(`Built ${spells.length} spell seeds`);

  // Generate .ts files per level
  const files = generateSpellFiles(spells, book);
  const spellDir = join(BASE_DIR, "generated", book, "spells");
  mkdirSync(spellDir, { recursive: true });

  // Remove stale level files that won't be regenerated (e.g. cantrips.ts when no level-0 spells)
  const LEVEL_FILES = ["cantrips.ts", ...Array.from({ length: 9 }, (_, i) => `level${i + 1}.ts`)];
  for (const f of LEVEL_FILES) {
    if (!files.has(f)) {
      try { unlinkSync(join(spellDir, f)); } catch { /* doesn't exist */ }
    }
  }

  for (const [filename, code] of files) {
    const filePath = join(spellDir, filename);
    writeFileSync(filePath, code);
    if (!quiet) console.log(`Generated: ${filePath}`);
  }

  regenerateSpellIndex(book);

  // Regenerate cowSpells.ts for ALL books (new spells in this book may change COW entries elsewhere)
  regenerateCowSpellsAllBooks();

  if (!quiet) console.log(`\nDone! Review the generated files and copy to database/packages/dnd35/ when ready.`);
}

function generateWizardSchool(ref: WizardSchoolReference, book: string) {
  const seeds = buildWizardSchoolSeeds(ref);
  if (!quiet) console.log(`Built ${seeds.length} wizard school seeds`);

  // Generate data.ts
  const lines: string[] = [];
  lines.push(`import type { WizardSchoolDefinition } from "@/database/packages/dnd35/v1/wizard-schools/types.ts";`);
  lines.push(``);
  lines.push(`export const WIZARD_PROHIBITED_SCHOOL = "WIZARD_PROHIBITED_SCHOOL";`);
  lines.push(``);
  lines.push(`export const WIZARD_SCHOOLS: WizardSchoolDefinition[] = [`);
  for (const s of seeds) {
    lines.push(`  {`);
    lines.push(`    name: "${s.name}",`);
    lines.push(`    description: "${s.description.replace(/"/g, '\\"')}",`);
    lines.push(`    prohibitedSchoolCount: ${s.prohibitedSchoolCount},`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  const outDir = join(BASE_DIR, "generated", book, "wizard-schools");
  mkdirSync(outDir, { recursive: true });

  const dataPath = join(outDir, "data.ts");
  writeFileSync(dataPath, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${dataPath}`);

  if (!quiet) console.log(`\nDone!`);
}

function generateDomain(_ref: DomainReference, book: string) {
  // Load master domain reference (all domains from srd.dndtools.org)
  const masterPath = join(BASE_DIR, "reference", "domains.json");
  if (!existsSync(masterPath)) {
    console.error(`Master domain reference not found: ${masterPath}`);
    console.error(`Run: bun run parser:scrape -- domain`);
    process.exit(1);
  }
  const masterRef: DomainReference = JSON.parse(readFileSync(masterPath, "utf-8"));

  // Collect all available spell names from this book + SRD (ancestor)
  // Also build canonical name map (lowercase → exact name from spell reference)
  const availableSpells = new Set<string>();
  const canonicalSpellName = new Map<string, string>();
  const booksToCheck = book === "srd" ? ["srd"] : ["srd", book];
  for (const b of booksToCheck) {
    const spellsPath = join(BASE_DIR, "reference", b, "spells.json");
    if (!existsSync(spellsPath)) continue;
    const spellRef: SpellReference = JSON.parse(readFileSync(spellsPath, "utf-8"));
    for (const spell of spellRef.raw) {
      availableSpells.add(spell.name.toLowerCase());
      canonicalSpellName.set(spell.name.toLowerCase(), spell.name);
    }
  }
  if (!quiet) console.log(`Available spells: ${availableSpells.size} (from ${booksToCheck.join(" + ")})`);

  // For extensions, also collect SRD-only spells to determine which domains are already complete in the ancestor
  const srdOnlySpells = new Set<string>();
  if (book !== "srd") {
    const srdSpellsPath = join(BASE_DIR, "reference", "srd", "spells.json");
    if (existsSync(srdSpellsPath)) {
      const srdRef: SpellReference = JSON.parse(readFileSync(srdSpellsPath, "utf-8"));
      for (const spell of srdRef.raw) {
        srdOnlySpells.add(spell.name.toLowerCase());
      }
    }
  }

  // Build seeds from master ref, filtering to domains where ALL spells are available
  // For extensions, exclude domains already complete in the SRD (ancestor)
  const allSeeds = buildDomainSeeds(masterRef);
  const seeds = allSeeds.filter((d) => {
    const allAvailable = d.spells.every((s) => availableSpells.has(s.name.toLowerCase()));
    if (!allAvailable) return false;

    // For extensions, skip domains that were already complete with just SRD spells
    if (book !== "srd") {
      const alreadyInSrd = d.spells.every((s) => srdOnlySpells.has(s.name.toLowerCase()));
      if (alreadyInSrd) return false;
    }

    return true;
  });

  // Normalize domain spell names to match canonical names from spell references
  for (const d of seeds) {
    for (const s of d.spells) {
      s.name = canonicalSpellName.get(s.name.toLowerCase()) ?? s.name;
    }
  }
  if (!quiet) console.log(`Built ${seeds.length} domain seeds (${allSeeds.length - seeds.length} skipped — missing spells)`);

  const outDir = join(BASE_DIR, "generated", book, "domains");
  const dataPath = join(outDir, "data.ts");

  if (seeds.length === 0) {
    // No domains for this book — generate empty array
    mkdirSync(outDir, { recursive: true });
    writeFileSync(dataPath, [
      `// Auto-generated by the SRD pipeline — do not edit manually`,
      `import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";`,
      ``,
      `export const ALL_DOMAINS: DomainDefinition[] = [];`,
      ``,
    ].join("\n"));
    if (!quiet) console.log(`Generated empty: ${dataPath}`);
    const domainFeatsPath = join(BASE_DIR, "generated", book, "feats", "domainFeats.ts");
    if (existsSync(domainFeatsPath)) {
      unlinkSync(domainFeatsPath);
      if (!quiet) console.log(`Removed: ${domainFeatsPath}`);
    }
    regenerateAptitudes(book);
    regenerateFeatIndex(book);
    if (!quiet) console.log(`\nDone!`);
    return;
  }

  // Generate data.ts
  const lines: string[] = [];
  lines.push(`import type { DomainDefinition } from "@/database/packages/dnd35/v1/domains/types.ts";`);
  lines.push(``);
  lines.push(`export const ALL_DOMAINS: DomainDefinition[] = [`);
  for (const d of seeds) {
    lines.push(`  {`);
    lines.push(`    name: "${d.name}",`);
    lines.push(`    description: "${d.description.replace(/"/g, '\\"')}",`);
    if (d.modifiers && d.modifiers.length > 0) {
      lines.push(`    modifiers: [`);
      for (const m of d.modifiers) {
        lines.push(`      { target: "${m.target}", operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
      }
      lines.push(`    ],`);
    }
    lines.push(`    spells: [`);
    for (const s of d.spells) {
      lines.push(`      { name: "${s.name.replace(/"/g, '\\"')}", level: ${s.level} },`);
    }
    lines.push(`    ],`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(dataPath, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${dataPath}`);

  // Generate feat pool feats (e.g. War Domain Weapon) — only for domains in this book
  const seedNames = new Set(seeds.map((d) => d.name));
  const filteredRef: DomainReference = { ...masterRef, raw: masterRef.raw.filter((d) => seedNames.has(d.name)) };
  const poolFeats = buildDomainFeatPoolSeeds(filteredRef);
  const domainFeatsPath = join(BASE_DIR, "generated", book, "feats", "domainFeats.ts");
  if (poolFeats.length > 0) {
    generateDomainFeatPool(poolFeats, book);
  } else if (existsSync(domainFeatsPath)) {
    unlinkSync(domainFeatsPath);
    if (!quiet) console.log(`Removed: ${domainFeatsPath}`);
  }

  // Regenerate aptitudes (domain feat pools contribute aptitude names)
  regenerateAptitudes(book);
  regenerateFeatIndex(book);

  if (!quiet) console.log(`\nDone!`);
}

function regenerateFavoredEnemyFeats(book: string) {
  if (book !== "srd") return;

  const outDir = join(BASE_DIR, "generated", book, "feats");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "favoredEnemy.ts");

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  lines.push(`import {`);
  lines.push(`  favoredEnemy as variants,`);
  lines.push(`  favoredEnemySpecializationVariants as specVariants,`);
  lines.push(`} from "@/database/packages/dnd35/v1/feats/creatureTypes.ts";`);
  lines.push(``);
  lines.push(`export const favoredEnemy: FeatSeed[] = [...variants, ...specVariants];`);
  lines.push(``);

  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated favored-enemy variants: ${outPath}`);
}

function generateDomainFeatPool(feats: FeatSeed[], book: string) {
  // Group feats by pool aptitude to produce one array per pool
  const byAptitude = new Map<string, typeof feats>();
  for (const feat of feats) {
    const apt = feat.aptitudes[0];
    if (!byAptitude.has(apt)) byAptitude.set(apt, []);
    byAptitude.get(apt)!.push(feat);
  }

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  lines.push(``);

  for (const [_apt, poolFeats] of byAptitude) {
    lines.push(`export const DOMAIN_POOL_FEATS: FeatSeed[] = [`);
    for (const feat of poolFeats) {
      lines.push(`  {`);
      lines.push(`    name: "${feat.name}",`);
      lines.push(`    description: "${feat.description.replace(/"/g, '\\"')}",`);
      lines.push(`    aptitudes: [${feat.aptitudes.map((a) => `"${a}"`).join(", ")}],`);
      if (feat.modifiers?.length) {
        lines.push(`    modifiers: [`);
        for (const m of feat.modifiers) {
          lines.push(`      { target: "${m.target}", operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
        }
        lines.push(`    ],`);
      }
      if (feat.properties?.length) {
        lines.push(`    properties: [`);
        for (const p of feat.properties) {
          lines.push(`      { type: "${p.type}", value: "${p.value}" },`);
        }
        lines.push(`    ],`);
      }
      lines.push(`  },`);
    }
    lines.push(`];`);
    lines.push(``);
  }

  const outDir = join(BASE_DIR, "generated", book, "feats");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "domainFeats.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated domain feat pool: ${outPath}`);
}

function generateRace(ref: RaceReference, book: string) {
  const seeds = buildRaceSeeds(ref);
  if (!quiet) console.log(`Built ${seeds.length} race seeds`);

  // Generate data.ts
  const lines: string[] = [];
  lines.push(`import type { RaceDefinition } from "@/database/packages/dnd35/v1/races/types.ts";`);
  lines.push(``);
  lines.push(`export const ALL_RACES: RaceDefinition[] = [`);
  for (const r of seeds) {
    lines.push(`  {`);
    lines.push(`    name: "${r.name}",`);
    lines.push(`    description: "${r.description.replace(/"/g, '\\"')}",`);
    lines.push(`    size: "${r.size}",`);
    lines.push(`    baseSpeed: ${r.baseSpeed},`);
    if (r.modifiers && r.modifiers.length > 0) {
      lines.push(`    modifiers: [`);
      for (const m of r.modifiers) {
        lines.push(`      { target: "${m.target}", operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
      }
      lines.push(`    ],`);
    }
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  const outDir = join(BASE_DIR, "generated", book, "races");
  mkdirSync(outDir, { recursive: true });

  const dataPath = join(outDir, "data.ts");
  writeFileSync(dataPath, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${dataPath}`);

  if (!quiet) console.log(`\nDone!`);
}

function generateItem(ref: ItemReference, book: string) {
  const seeds = buildItemSeeds(ref);
  const outDir = join(BASE_DIR, "generated", book, "items");
  mkdirSync(outDir, { recursive: true });

  // --- weapons.ts ---
  generateWeaponFile(join(outDir, "weapons.ts"), "SIMPLE_WEAPONS", seeds.simpleWeapons, "simple");
  generateWeaponFile(join(outDir, "martial.ts"), "MARTIAL_WEAPONS", seeds.martialWeapons, "martial");
  generateWeaponFile(join(outDir, "exotic.ts"), "EXOTIC_WEAPONS", seeds.exoticWeapons, "exotic");

  // --- armor.ts ---
  generateArmorFile(join(outDir, "armor.ts"), "ARMOR", seeds.armor);

  // --- shields.ts ---
  generateShieldFile(join(outDir, "shields.ts"), "SHIELDS", seeds.shields);

  // --- goods.ts ---
  generateGoodsFile(join(outDir, "goods.ts"), "GOODS", seeds.goods);

  // --- index.ts ---
  generateItemIndex(outDir);

  if (!quiet) console.log(`\nDone! Generated ${seeds.simpleWeapons.length} simple, ${seeds.martialWeapons.length} martial, ${seeds.exoticWeapons.length} exotic weapons`);
  if (!quiet) console.log(`  ${seeds.armor.length} armor, ${seeds.shields.length} shields, ${seeds.goods.length} goods`);
}

function escStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function generateWeaponFile(path: string, constName: string, weapons: ReturnType<typeof buildItemSeeds>["simpleWeapons"], profFn: string) {
  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(`import { ${profFn}, weaponProperties } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: ItemDef[] = [`);
  for (const w of weapons) {
    lines.push(`  {`);
    lines.push(`    name: "${escStr(w.name)}",`);
    lines.push(`    description: "${escStr(w.description)}",`);
    lines.push(`    weight: "${w.weight}", costGp: "${w.costGp}", type: "Weapon",`);
    lines.push(`    requirements: ${profFn}("${escStr(w.name)}"),`);
    lines.push(`    properties: weaponProperties("${escStr(w.name)}"),`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${path}`);
}

function generateArmorFile(path: string, constName: string, items: ReturnType<typeof buildItemSeeds>["armor"]) {
  // Collect which proficiency constants are actually used
  const usedProfs = new Set<string>();
  for (const a of items) {
    // Look up the raw data to find the category
    const prof = getArmorProf(a.name);
    if (prof) usedProfs.add(prof);
  }

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";`);
  const imports = [...usedProfs].sort();
  lines.push(`import { armorProperties, ${imports.join(", ")} } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: ItemDef[] = [`);
  for (const a of items) {
    const prof = getArmorProf(a.name);
    lines.push(`  {`);
    lines.push(`    name: "${escStr(a.name)}",`);
    lines.push(`    description: "${escStr(a.description)}",`);
    lines.push(`    weight: "${a.weight}", costGp: "${a.costGp}", type: "Armor", slot: "Torso",`);
    lines.push(`    requirements: ${prof},`);
    lines.push(`    properties: armorProperties("${escStr(a.name)}"),`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${path}`);
}

function getArmorProf(generatorName: string): string {
  const def = getArmorDefinition(generatorName);
  if (def) {
    if (def.armorType === "Light") return "LIGHT_ARMOR_PROF";
    if (def.armorType === "Medium") return "MEDIUM_ARMOR_PROF";
    if (def.armorType === "Heavy") return "HEAVY_ARMOR_PROF";
  }
  return "LIGHT_ARMOR_PROF";
}

function generateShieldFile(path: string, constName: string, items: ReturnType<typeof buildItemSeeds>["shields"]) {
  // Collect which proficiency constants are actually used
  const usedProfs = new Set<string>();
  for (const s of items) {
    const prof = getShieldProf(s.name);
    usedProfs.add(prof);
  }

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";`);
  const imports = [...usedProfs].sort();
  lines.push(`import { shieldProperties, ${imports.join(", ")} } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: ItemDef[] = [`);
  for (const s of items) {
    const prof = getShieldProf(s.name);
    lines.push(`  {`);
    lines.push(`    name: "${escStr(s.name)}",`);
    lines.push(`    description: "${escStr(s.description)}",`);
    lines.push(`    weight: "${s.weight}", costGp: "${s.costGp}", type: "Shield", slot: "Off Hand",`);
    lines.push(`    requirements: ${prof},`);
    lines.push(`    properties: shieldProperties("${escStr(s.name)}"),`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${path}`);
}

function getShieldProf(generatorName: string): string {
  const def = getShieldDefinition(generatorName);
  if (def?.shieldType === "Tower") return "TOWER_SHIELD_PROF";
  return "SHIELD_PROF";
}

function generateGoodsFile(path: string, constName: string, items: ReturnType<typeof buildItemSeeds>["goods"]) {
  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: ItemDef[] = [`);
  for (const g of items) {
    lines.push(`  {`);
    lines.push(`    name: "${escStr(g.name)}",`);
    lines.push(`    description: "${escStr(g.description)}",`);
    lines.push(`    weight: "${g.weight}", costGp: "${g.costGp}", type: "Other", slot: "Other",`);
    lines.push(`    properties: [],`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${path}`);
}

function generateItemIndex(outDir: string) {
  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`export { SIMPLE_WEAPONS } from "./weapons.ts";`);
  lines.push(`export { MARTIAL_WEAPONS } from "./martial.ts";`);
  lines.push(`export { EXOTIC_WEAPONS } from "./exotic.ts";`);
  lines.push(`export { ARMOR } from "./armor.ts";`);
  lines.push(`export { SHIELDS } from "./shields.ts";`);
  lines.push(`export { GOODS } from "./goods.ts";`);
  lines.push(``);
  const outPath = join(outDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${outPath}`);
}

function generateMagicItem(ref: MagicItemReference, book: string) {
  const seeds = buildMagicItemSeeds(ref);
  const outDir = join(BASE_DIR, "generated", book, "items");
  mkdirSync(outDir, { recursive: true });

  const files: [string, string, ReturnType<typeof buildMagicItemSeeds>[keyof ReturnType<typeof buildMagicItemSeeds>]][] = [
    ["magic-armor.ts", "MAGIC_ARMOR", seeds.magicArmor],
    ["magic-shields.ts", "MAGIC_SHIELDS", seeds.magicShields],
    ["magic-weapons.ts", "MAGIC_WEAPONS", seeds.magicWeapons],
    ["wondrous-items.ts", "WONDROUS_ITEMS", seeds.wondrousItems],
    ["rings.ts", "RINGS", seeds.rings],
    ["rods.ts", "RODS", seeds.rods],
    ["staffs.ts", "STAFFS", seeds.staffs],
  ];

  for (const [filename, constName, items] of files) {
    generateMagicItemFile(join(outDir, filename), constName, items);
  }

  // Update index.ts to include magic item re-exports
  generateItemIndexWithMagic(outDir);

  if (!quiet) console.log(`\nDone! Generated ${seeds.magicArmor.length} magic armor, ${seeds.magicShields.length} magic shields, ${seeds.magicWeapons.length} magic weapons`);
  if (!quiet) console.log(`  ${seeds.wondrousItems.length} wondrous items, ${seeds.rings.length} rings, ${seeds.rods.length} rods, ${seeds.staffs.length} staffs`);
}

function generateMagicItemFile(path: string, constName: string, items: ReturnType<typeof buildMagicItemSeeds>[keyof ReturnType<typeof buildMagicItemSeeds>]) {
  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ItemDef } from "@/database/packages/dnd35/v1/items/types.ts";`);
  lines.push(``);
  lines.push(`export const ${constName}: ItemDef[] = [`);
  for (const item of items) {
    lines.push(`  {`);
    lines.push(`    name: "${escStr(item.name)}",`);
    lines.push(`    description: "${escStr(item.description)}",`);
    lines.push(`    weight: "${item.weight}", costGp: "${item.costGp}", type: "${item.type}",${item.slot ? ` slot: "${item.slot}",` : ""}`);
    if (item.sourceItem) {
      lines.push(`    sourceItem: "${escStr(item.sourceItem)}",`);
    }
    if (item.properties.length > 0) {
      lines.push(`    properties: [`);
      for (const p of item.properties) {
        lines.push(`      { type: "${p.type}", value: "${escStr(p.value)}" },`);
      }
      lines.push(`    ],`);
    } else {
      lines.push(`    properties: [],`);
    }
    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`    modifiers: [`);
      for (const m of item.modifiers) {
        lines.push(`      { target: "${m.target}", operator: "${m.operator}", value: "${m.value}", valueType: "${m.valueType}" },`);
      }
      lines.push(`    ],`);
    }
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  writeFileSync(path, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${path}`);
}

function generateItemIndexWithMagic(outDir: string) {
  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  // Mundane items
  if (existsSync(join(outDir, "weapons.ts"))) lines.push(`export { SIMPLE_WEAPONS } from "./weapons.ts";`);
  if (existsSync(join(outDir, "martial.ts"))) lines.push(`export { MARTIAL_WEAPONS } from "./martial.ts";`);
  if (existsSync(join(outDir, "exotic.ts"))) lines.push(`export { EXOTIC_WEAPONS } from "./exotic.ts";`);
  if (existsSync(join(outDir, "armor.ts"))) lines.push(`export { ARMOR } from "./armor.ts";`);
  if (existsSync(join(outDir, "shields.ts"))) lines.push(`export { SHIELDS } from "./shields.ts";`);
  if (existsSync(join(outDir, "goods.ts"))) lines.push(`export { GOODS } from "./goods.ts";`);
  // Magic items
  if (existsSync(join(outDir, "magic-armor.ts"))) lines.push(`export { MAGIC_ARMOR } from "./magic-armor.ts";`);
  if (existsSync(join(outDir, "magic-shields.ts"))) lines.push(`export { MAGIC_SHIELDS } from "./magic-shields.ts";`);
  if (existsSync(join(outDir, "magic-weapons.ts"))) lines.push(`export { MAGIC_WEAPONS } from "./magic-weapons.ts";`);
  if (existsSync(join(outDir, "wondrous-items.ts"))) lines.push(`export { WONDROUS_ITEMS } from "./wondrous-items.ts";`);
  if (existsSync(join(outDir, "rings.ts"))) lines.push(`export { RINGS } from "./rings.ts";`);
  if (existsSync(join(outDir, "rods.ts"))) lines.push(`export { RODS } from "./rods.ts";`);
  if (existsSync(join(outDir, "staffs.ts"))) lines.push(`export { STAFFS } from "./staffs.ts";`);
  lines.push(``);
  const outPath = join(outDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated: ${outPath}`);
}

/** Regenerate aptitudes.ts for a book from reference JSONs. */
function regenerateAptitudes(book: string) {
  const featRefPath = join(BASE_DIR, "reference", book, "feats.json");
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let feats: import("@/database/packages/dnd35/v1/feats/types.ts").FeatSeed[] = [];
  try {
    const ref: FeatReference = JSON.parse(readFileSync(featRefPath, "utf-8"));
    feats = buildFeatSeeds(ref, book);
  } catch { /* no standalone feats for this book */ }

  if (book === "srd") feats = [...feats, ...buildFavoredEnemyFeats()];

  const aptitudes = collectAptitudes(feats, book);

  const aptLines: string[] = [];
  aptLines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  aptLines.push(``);
  aptLines.push(`export const ALL_APTITUDES: string[] = [`);
  for (const apt of aptitudes) {
    aptLines.push(`  "${apt}",`);
  }
  aptLines.push(`];`);
  aptLines.push(``);
  const aptPath = join(BASE_DIR, "generated", book, "aptitudes.ts");
  mkdirSync(dirname(aptPath), { recursive: true });
  writeFileSync(aptPath, aptLines.join("\n"));
  if (!quiet) console.log(`Generated aptitudes: ${aptPath}`);
}

/** Regenerate cowFeats.ts for a book from bonusFeatLists in class reference JSONs.
 *  Only emits entries for feats that don't already exist in the book's own feat pool
 *  (i.e. cross-book references that actually need COW). Same-book feats already get
 *  their aptitudes added directly by the feat generator. */
function regenerateCowFeats(book: string) {
  const classDir = join(BASE_DIR, "reference", book, "classes");
  let classFiles: string[];
  try {
    classFiles = readdirSync(classDir).filter((f) => f.endsWith(".json"));
  } catch {
    return; // no classes for this book
  }

  // Load the book's own raw feat names — these already get aptitudes via the feat generator
  const bookFeats = new Set<string>();
  const bookFeatsPath = join(BASE_DIR, "reference", book, "feats.json");
  if (existsSync(bookFeatsPath)) {
    const ref: FeatReference = JSON.parse(readFileSync(bookFeatsPath, "utf-8"));
    for (const feat of ref.raw) bookFeats.add(feat.name);
  }

  // Also collect class feature seed names — these are generated as feats by the class feat generator
  const classFeatureNames = new Set<string>();
  for (const file of classFiles) {
    const ref: ClassReference = JSON.parse(readFileSync(join(classDir, file), "utf-8"));
    const features = ref.mapping?.overrides?.features ?? {};
    for (const [, feat] of Object.entries(features)) {
      if (feat.seedName) classFeatureNames.add(feat.seedName);
    }
    for (const [, feat] of Object.entries(ref.mapping?.features ?? {})) {
      if (feat.seedName) classFeatureNames.add(feat.seedName);
    }
  }

  type CowEntry = { feat: string; requirements: { className: string; level: number }[]; aptitudes: string[] };
  const entries: CowEntry[] = [];

  for (const file of classFiles) {
    const ref: ClassReference = JSON.parse(readFileSync(join(classDir, file), "utf-8"));
    const bonusFeatLists = ref.mapping?.overrides?.bonusFeatLists ?? ref.detected?.bonusFeatLists;
    if (!bonusFeatLists?.length) continue;

    for (const list of bonusFeatLists) {
      for (const feat of list.feats) {
        // Skip feats that exist in this book's own feat pool or as class features —
        // the feat generator already adds the aptitude directly
        if (bookFeats.has(feat) || classFeatureNames.has(feat)) continue;
        entries.push({ feat, requirements: [], aptitudes: [list.aptitude] });
      }
    }
  }

  const outPath = join(BASE_DIR, "generated", book, "cowFeats.ts");

  // Deduplicate: a feat might appear in multiple lists
  const deduped = new Map<string, CowEntry>();
  for (const entry of entries) {
    const existing = deduped.get(entry.feat);
    if (existing) {
      for (const apt of entry.aptitudes) {
        if (!existing.aptitudes.includes(apt)) existing.aptitudes.push(apt);
      }
    } else {
      deduped.set(entry.feat, { ...entry });
    }
  }

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { CowFeatEntry } from "@/database/packages/dnd35/seed-utils.ts";`);
  lines.push(``);
  lines.push(`export const COW_FEATS: CowFeatEntry[] = [`);
  for (const entry of deduped.values()) {
    const aptStr = entry.aptitudes.map((a) => `"${a}"`).join(", ");
    lines.push(`  { feat: "${entry.feat}", requirements: [], aptitudes: [${aptStr}] },`);
  }
  lines.push(`];`);
  lines.push(``);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated COW feats: ${outPath}`);
}

/** Regenerate cowSpells.ts for ALL books that have casting classes. Called after spell generation
 *  since new spells in any book may change COW entries in other books. */
function regenerateCowSpellsAllBooks() {
  const refBase = join(BASE_DIR, "reference");
  let books: string[];
  try {
    books = readdirSync(refBase).filter((f) => {
      try { return readdirSync(join(refBase, f, "classes")).some((c) => c.endsWith(".json")); } catch { return false; }
    });
  } catch { return; }

  for (const book of books) {
    regenerateCowSpells(book);
  }
}

/** Regenerate cowSpells.ts for a book. Scans all OTHER books' spell references for spells that
 *  have levelEntries matching this book's casting classes. Produces per-class-level entries
 *  so the seed uses the correct level for each class (not the global minimum). */
function regenerateCowSpells(book: string) {
  const classDir = join(BASE_DIR, "reference", book, "classes");
  let classFiles: string[];
  try {
    classFiles = readdirSync(classDir).filter((f) => f.endsWith(".json"));
  } catch {
    return; // no classes for this book
  }

  // Build map: className → aptitude name for classes that have spell lists
  const classToApt = new Map<string, string>();
  // Build map: parentClassName → [{ aptitude, className }] for classes that inherit another class's spell list
  const inheritedApts = new Map<string, { aptitude: string }[]>();
  for (const file of classFiles) {
    const ref: ClassReference = JSON.parse(readFileSync(join(classDir, file), "utf-8"));
    const spells = ref.mapping?.overrides?.spells ?? ref.mapping?.spells;
    if (spells && ref.raw?.name) {
      classToApt.set(ref.raw.name, `${ref.raw.name} Spells`);
      if (spells.inheritsFrom) {
        const aptName = `${ref.raw.name} Spells`;
        const existing = inheritedApts.get(spells.inheritsFrom) ?? [];
        existing.push({ aptitude: aptName });
        inheritedApts.set(spells.inheritsFrom, existing);
      }
    }
  }

  // Load this book's own spell names (these don't need COW — they're seeded directly)
  const bookSpellNames = new Set<string>();
  const bookSpellPath = join(BASE_DIR, "reference", book, "spells.json");
  if (existsSync(bookSpellPath)) {
    const ref: SpellReference = JSON.parse(readFileSync(bookSpellPath, "utf-8"));
    for (const spell of ref.raw) bookSpellNames.add(spell.name);
  }

  // Scan ALL other books' spell references
  type CowEntry = { spell: string; aptitudes: { aptitude: string; level: number }[] };
  const entries = new Map<string, CowEntry>();

  const refBase = join(BASE_DIR, "reference");

  // Find the base book (the one defining core classes like Wizard).
  // COW only makes sense for spells from the base book, not siblings.
  let baseBook: string | null = null;
  for (const b of readdirSync(refBase)) {
    try {
      for (const f of readdirSync(join(refBase, b, "classes")).filter((f) => f.endsWith(".json"))) {
        const r: ClassReference = JSON.parse(readFileSync(join(refBase, b, "classes", f), "utf-8"));
        if (r.raw?.name === "Wizard") { baseBook = b; break; }
      }
    } catch { /* no classes dir */ }
    if (baseBook) break;
  }
  const isBaseBook = book === baseBook;
  const allBooks = readdirSync(refBase);
  for (const otherBook of allBooks) {
    const spellPath = join(refBase, otherBook, "spells.json");
    if (!existsSync(spellPath)) continue;

    const ref: SpellReference = JSON.parse(readFileSync(spellPath, "utf-8"));
    for (const spell of ref.raw) {
      const isSameBook = bookSpellNames.has(spell.name);
      const isFromBase = otherBook === baseBook;
      const matchedApts: { aptitude: string; level: number }[] = [];
      const overrideLe = ref.mapping?.overrides?.[spell.name]?.levelEntries ?? [];
      for (const le of [...spell.levelEntries, ...overrideLe]) {
        // Direct class matches: only from the base book (not siblings).
        // Same-book spells are seeded by seedPowers directly.
        // The base book itself never needs COW entries (extensions link via seedPowers).
        if (!isSameBook && !isBaseBook && isFromBase) {
          const aptName = classToApt.get(le.className);
          if (aptName) {
            matchedApts.push({ aptitude: aptName, level: le.level });
          }
        }
        // Inherited spell lists: from the base book + current book only
        const inherited = inheritedApts.get(le.className);
        if (inherited && (isSameBook || isFromBase)) {
          for (const { aptitude } of inherited) {
            matchedApts.push({ aptitude, level: le.level });
          }
        }
      }

      if (matchedApts.length === 0) continue;

      const existing = entries.get(spell.name);
      if (existing) {
        // Merge aptitudes (deduplicate by aptitude name)
        for (const apt of matchedApts) {
          if (!existing.aptitudes.some((a) => a.aptitude === apt.aptitude)) {
            existing.aptitudes.push(apt);
          }
        }
      } else {
        entries.set(spell.name, { spell: spell.name, aptitudes: matchedApts });
      }
    }
  }

  const outPath = join(BASE_DIR, "generated", book, "cowSpells.ts");

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { CowSpellEntry } from "@/database/packages/dnd35/seed-utils.ts";`);
  lines.push(``);
  lines.push(`export const COW_SPELLS: CowSpellEntry[] = [`);
  for (const entry of entries.values()) {
    const aptStr = entry.aptitudes.map((a) => `{ aptitude: "${a.aptitude}", level: ${a.level} }`).join(", ");
    lines.push(`  { spell: "${entry.spell}", aptitudes: [${aptStr}] },`);
  }
  lines.push(`];`);
  lines.push(``);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated COW spells: ${outPath} (${entries.size} entries)`);
}

/** Regenerate classes/index.ts for a book from class reference JSONs. */
function regenerateClassIndex(book: string) {
  const refDir = join(BASE_DIR, "reference", book, "classes");
  let refFiles: string[];
  try {
    refFiles = readdirSync(refDir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return; // no classes for this book
  }

  if (refFiles.length === 0) return;

  type ClassEntry = { slug: string; constName: string; isBase: boolean };
  const entries: ClassEntry[] = [];

  for (const file of refFiles) {
    const ref: ClassReference = JSON.parse(readFileSync(join(refDir, file), "utf-8"));
    if (!ref.raw?.name) continue;
    const slug = toCamelCase(ref.raw.name);
    const levels = ref.detected?.levels ?? 0;
    entries.push({
      slug,
      constName: toConstName(ref.raw.name),
      isBase: levels === 20,
    });
  }

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { ClassSeed } from "@/database/packages/dnd35/seed-utils.ts";`);
  lines.push(``);

  for (const e of entries) {
    lines.push(`import { ${e.constName} } from "./${e.slug}.ts";`);
  }
  lines.push(``);

  const baseEntries = entries.filter((e) => e.isBase);
  const prestigeEntries = entries.filter((e) => !e.isBase);

  lines.push(`export const ALL_CLASSES: ClassSeed[] = [`);
  for (const e of entries) {
    lines.push(`  ${e.constName},`);
  }
  lines.push(`];`);
  lines.push(``);

  if (baseEntries.length > 0) {
    lines.push(`export const ALL_BASE_CLASSES: ClassSeed[] = [`);
    for (const e of baseEntries) {
      lines.push(`  ${e.constName},`);
    }
    lines.push(`];`);
    lines.push(``);
  }

  if (prestigeEntries.length > 0) {
    lines.push(`export const ALL_PRESTIGE_CLASSES: ClassSeed[] = [`);
    for (const e of prestigeEntries) {
      lines.push(`  ${e.constName},`);
    }
    lines.push(`];`);
    lines.push(``);
  }

  const genClassDir = join(BASE_DIR, "generated", book, "classes");
  const outPath = join(genClassDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated class index: ${outPath}`);
}

/** Regenerate feats/classes/index.ts for a book from all generated class feat .ts files. */
function regenerateClassFeatIndex(book: string) {
  const classFeatDir = join(BASE_DIR, "generated", book, "feats", "classes");
  let tsFiles: string[];
  try {
    tsFiles = readdirSync(classFeatDir).filter((f) => f.endsWith(".ts") && f !== "index.ts").sort();
  } catch {
    return; // no class feat files for this book
  }

  if (tsFiles.length === 0) return;

  type FeatEntry = { slug: string; constName: string };
  const entries: FeatEntry[] = [];

  for (const file of tsFiles) {
    const slug = file.replace(".ts", "");
    const content = readFileSync(join(classFeatDir, file), "utf-8");
    const match = content.match(/export const (\w+_FEATS)/);
    if (match) {
      entries.push({ slug, constName: match[1] });
    }
  }

  if (entries.length === 0) return;

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  lines.push(``);

  for (const e of entries) {
    lines.push(`import { ${e.constName} } from "./${e.slug}.ts";`);
  }
  lines.push(``);

  // Deduplicate: a feat like "Familiar" may appear in multiple class feat files
  lines.push(`const _allClassFeats: FeatSeed[] = [`);
  for (const e of entries) {
    lines.push(`  ...${e.constName},`);
  }
  lines.push(`];`);
  lines.push(`const _seen = new Set<string>();`);
  lines.push(`export const ALL_CLASS_FEATS: FeatSeed[] = _allClassFeats.filter((f) => {`);
  lines.push(`  if (_seen.has(f.name)) return false;`);
  lines.push(`  _seen.add(f.name);`);
  lines.push(`  return true;`);
  lines.push(`});`);
  lines.push(``);

  // Re-export individual arrays for consumers that need them
  for (const e of entries) {
    lines.push(`export { ${e.constName} };`);
  }
  lines.push(``);

  const outPath = join(classFeatDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated class feat index: ${outPath}`);
}

/** Regenerate feats/index.ts for a book from all .ts files in feats/ and classes/index.ts. */
function regenerateFeatIndex(book: string) {
  const featDir = join(BASE_DIR, "generated", book, "feats");

  // Discover all .ts files in feats/ (excluding index.ts and classes/)
  type FeatFileExport = { file: string; exports: string[] };
  const featFiles: FeatFileExport[] = [];
  try {
    for (const file of readdirSync(featDir)) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;
      const content = readFileSync(join(featDir, file), "utf-8");
      const exports: string[] = [];
      for (const m of content.matchAll(/export const (\w+): FeatSeed\[\]/g)) {
        exports.push(m[1]);
      }
      if (exports.length > 0) featFiles.push({ file, exports });
    }
  } catch { /* dir doesn't exist */ }

  const allFeatExports = featFiles.flatMap((f) => f.exports);

  // Check if class feat index exists
  const classFeatIndexPath = join(featDir, "classes", "index.ts");
  const hasClassFeats = existsSync(classFeatIndexPath);

  if (allFeatExports.length === 0 && !hasClassFeats) return;

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";`);
  lines.push(``);

  // Re-exports from each feat file
  for (const { file, exports } of featFiles) {
    const slug = file.replace(".ts", "");
    lines.push(`export {`);
    for (const name of exports) {
      lines.push(`  ${name},`);
    }
    lines.push(`} from "./${slug}.ts";`);
    lines.push(``);
  }

  if (hasClassFeats) {
    lines.push(`export { ALL_CLASS_FEATS } from "./classes/index.ts";`);
    lines.push(``);
  }

  // Build aggregate exports
  if (allFeatExports.length > 0 || hasClassFeats) {
    // Need direct imports for spreading
    for (const { file, exports } of featFiles) {
      const slug = file.replace(".ts", "");
      lines.push(`import {`);
      for (const name of exports) {
        lines.push(`  ${name} as _${name},`);
      }
      lines.push(`} from "./${slug}.ts";`);
    }
    if (hasClassFeats) {
      lines.push(`import { ALL_CLASS_FEATS as _ALL_CLASS_FEATS } from "./classes/index.ts";`);
    }
    lines.push(``);

    // ALL_STANDALONE_FEATS: all non-class feats (empty array if none)
    lines.push(`export const ALL_STANDALONE_FEATS: FeatSeed[] = [`);
    for (const name of allFeatExports) {
      lines.push(`  ..._${name},`);
    }
    lines.push(`];`);
    lines.push(``);

    // ALL_FEATS: everything (standalone + class feats)
    lines.push(`export const ALL_FEATS: FeatSeed[] = [`);
    for (const name of allFeatExports) {
      lines.push(`  ..._${name},`);
    }
    if (hasClassFeats) {
      lines.push(`  ..._ALL_CLASS_FEATS,`);
    }
    lines.push(`];`);
    lines.push(``);
  }

  const outPath = join(featDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated feat index: ${outPath}`);
}

/** Regenerate spells/index.ts for a book from existing level .ts files. */
function regenerateSpellIndex(book: string) {
  const spellDir = join(BASE_DIR, "generated", book, "spells");
  let allFiles: string[];
  try {
    allFiles = readdirSync(spellDir);
  } catch {
    return; // no spells for this book
  }

  // Match cantrips.ts and level*.ts (the standard spell level files)
  const levelFiles: { file: string; level: number; constName: string }[] = [];

  if (allFiles.includes("cantrips.ts")) {
    levelFiles.push({ file: "cantrips.ts", level: 0, constName: "CANTRIPS" });
  }
  for (let i = 1; i <= 9; i++) {
    const fname = `level${i}.ts`;
    if (allFiles.includes(fname)) {
      levelFiles.push({ file: fname, level: i, constName: `LEVEL_${i}_SPELLS` });
    }
  }

  if (levelFiles.length === 0) return;

  const lines: string[] = [];
  lines.push(`// Auto-generated by the SRD pipeline — do not edit manually`);
  lines.push(`import type { PowerSeed } from "@/database/packages/dnd35/v1/spells/types.ts";`);
  lines.push(``);

  for (const lf of levelFiles) {
    lines.push(`import { ${lf.constName} } from "./${lf.file.replace(".ts", "")}.ts";`);
  }
  lines.push(``);

  // Re-export individual level arrays
  lines.push(`export {`);
  for (const lf of levelFiles) {
    lines.push(`  ${lf.constName},`);
  }
  lines.push(`};`);
  lines.push(``);

  lines.push(`export type PowerSeedWithLevel = PowerSeed & { level: number };`);
  lines.push(``);

  lines.push(`export const ALL_SPELLS: PowerSeedWithLevel[] = [`);
  for (const lf of levelFiles) {
    lines.push(`  ...${lf.constName}.map((p) => ({ ...p, level: ${lf.level} })),`);
  }
  lines.push(`];`);
  lines.push(``);

  const outPath = join(spellDir, "index.ts");
  writeFileSync(outPath, lines.join("\n"));
  if (!quiet) console.log(`Generated spell index: ${outPath}`);
}

main();
