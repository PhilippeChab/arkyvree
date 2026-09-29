import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type { ClassReference, DomainReference, FeatReference, ItemReference, MagicItemReference, RaceReference, SpellReference, WizardSchoolReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { toCamelCase, discoverRefs, parseCliArgs, REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { featLines, listField, quote, requirementImports, stringifyModifier, stringifyProperty, toConstName } from "@/database/packages/dnd35-from-parser/tools/generator/codegen.ts";
import { generateClassSeed, generateFeatSeeds as generateClassFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/generators/class.ts";
import { coreSystemFeats, featAptitudeSources, generateFavoredEnemyFeats, generateFeatSeeds } from "@/database/packages/dnd35-from-parser/tools/generator/generators/feat.ts";
import { generateSpellFiles } from "@/database/packages/dnd35-from-parser/tools/generator/generators/spell.ts";
import type { DomainDefinition, FeatSeed } from "@/database/packages/dnd35/content/types.ts";
import { buildDomainSeeds, classSpells, buildDomainFeatPoolSeeds, buildItemSeeds, buildMagicItemSeeds, buildRaceSeeds, buildSpellSeeds, buildWizardSchoolSeeds, collectAptitudes } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { getArmorDefinition, getShieldDefinition } from "@/server/rulesets/dnd3.5/hooks/generators/armorGenerator.ts";
import { classReferences, loadReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";

// ---------------------------------------------------------------------------
// CLI: bun database/packages/dnd35-from-parser/tools/generator/index.ts [<json-path> [--book <book>] | [book [name]] [--type <type>]]
// ---------------------------------------------------------------------------

const BASE_DIR = join(import.meta.dirname!, "../../");
let quiet = false;

function generateRef(jsonPath: string, bookOverride?: string) {
  const meta = JSON.parse(readFileSync(jsonPath, "utf-8"))._meta;
  if (!meta) {
    console.error(`Invalid reference file: missing _meta in ${jsonPath}`);
    return;
  }

  if (meta.type === "domain" && !bookOverride) {
    console.error(`The domains reference is generated for a book: pass --book <book>`);
    process.exit(1);
  }
  const book = bookOverride ?? meta.book;

  switch (meta.type) {
    case "class":
      generateClass(loadReference(jsonPath, "class"), book);
      break;
    case "feat":
      generateFeat(loadReference(jsonPath, "feat"), book);
      break;
    case "spell":
      generateSpell(loadReference(jsonPath, "spell"), book);
      break;
    case "wizardSchool":
      generateWizardSchool(loadReference(jsonPath, "wizardSchool"), book);
      break;
    case "domain":
      generateDomain(loadReference(jsonPath, "domain"), book);
      break;
    case "race":
      generateRace(loadReference(jsonPath, "race"), book);
      break;
    case "item":
      generateItem(loadReference(jsonPath, "item"), book);
      break;
    case "magicItem":
      generateMagicItem(loadReference(jsonPath, "magicItem"), book);
      break;
    default:
      console.error(`Unknown type: ${meta.type}. Supported: class, feat, spell, wizardSchool, domain, race, item, magicItem`);
      return;
  }
  if (book !== "srd") regenerateBookIndex(book);
}

/** Regenerate index.ts for an extension's book: its content, as the extension seeds it. */
function regenerateBookIndex(book: string) {
  const dir = join(BASE_DIR, "generated", book);
  const parts: { key: string; file: string; name: string }[] = [
    { key: "aptitudes", file: "aptitudes.ts", name: "ALL_APTITUDES" },
    { key: "standaloneFeats", file: "feats/index.ts", name: "ALL_STANDALONE_FEATS" },
    { key: "classFeats", file: "feats/index.ts", name: "ALL_CLASS_FEATS" },
    { key: "cowFeats", file: "cowFeats.ts", name: "COW_FEATS" },
    { key: "spells", file: "spells/index.ts", name: "ALL_SPELLS" },
    { key: "cowSpells", file: "cowSpells.ts", name: "COW_SPELLS" },
    { key: "domains", file: "domains/data.ts", name: "ALL_DOMAINS" },
    { key: "classes", file: "classes/index.ts", name: "ALL_CLASSES" },
  ];
  const present = parts.filter((part) => existsSync(join(dir, part.file)));
  const files = [...new Set(present.map((part) => part.file))].sort();

  const lines: string[] = [];
  lines.push(GENERATED_HEADER);
  lines.push(`import type { BookContent } from "@/database/packages/dnd35/content/types.ts";`);
  for (const file of files) {
    const names = present.filter((part) => part.file === file).map((part) => part.name).sort();
    lines.push(`import { ${names.join(", ")} } from "./${file}";`);
  }
  lines.push(``);
  lines.push(`export const BOOK: BookContent = {`);
  for (const part of parts) {
    lines.push(`  ${part.key}: ${present.includes(part) ? part.name : "[]"},`);
  }
  lines.push(`};`);
  lines.push(``);

  writeGenerated(join(dir, "index.ts"), lines.join("\n"));
}

/** The first line of an index or data file the generator writes. */
const GENERATED_HEADER = `// Auto-generated by the SRD pipeline — do not edit manually`;

/** An index file's head: its header, the seed type's import, and the import of each file's list. */
function indexHead(seedType: string, lists: { constName: string; file: string }[]): string[] {
  return [
    GENERATED_HEADER,
    `import type { ${seedType} } from "@/database/packages/dnd35/content/types.ts";`,
    ``,
    ...lists.map(({ constName, file }) => `import { ${constName} } from "./${file}";`),
    ``,
  ];
}

/** An exported list of `seedType`, an item per line. */
function listExport(name: string, seedType: string, items: string[]): string[] {
  return [`export const ${name}: ${seedType}[] = [`, ...items.map((item) => `  ${item},`), `];`, ``];
}

/** Writes a generated file, creating its folder. */
function writeGenerated(path: string, code: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, code);
  if (!quiet) console.log(`Generated: ${path}`);
}

/**
 * Regenerates every reference (of a book, type or name, when given), then each book's domains unless a name picks
 * one reference. A reference that fails doesn't stop the others: the failures are listed at the end.
 */
function generateAll({ bookFilter, typeFilter, nameFilter }: ReturnType<typeof parseCliArgs>) {
  const refs = discoverRefs().filter((r) =>
    (!bookFilter || r.book === bookFilter) && (!typeFilter || r.type === typeFilter) && (!nameFilter || basename(r.path, ".json").toLowerCase() === nameFilter));

  quiet = true;
  const failures: string[] = [];
  const generate = (path: string, book?: string) => {
    try {
      generateRef(path, book);
    } catch (error) {
      failures.push(`${relative(REFERENCE_DIR, path)}${book ? ` (${book})` : ""}: ${error instanceof Error ? error.message : error}`);
    }
  };
  // The domains reference lists every domain: each book with spells gets the domains they complete.
  for (const ref of refs.filter((r) => r.type !== "domain")) generate(ref.path);
  if (typeFilter === "domain" || (!typeFilter && !nameFilter)) {
    for (const book of readdirSync(REFERENCE_DIR, { withFileTypes: true })) {
      if (!book.isDirectory() || !existsSync(join(REFERENCE_DIR, book.name, "spells.json")) || (bookFilter && book.name !== bookFilter)) continue;
      generate(join(REFERENCE_DIR, "domains.json"), book.name);
    }
  }

  if (failures.length > 0) {
    console.error(`${failures.length} reference(s) failed:\n${failures.map((f) => `  ${f}`).join("\n")}`);
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0]?.endsWith(".json")) {
    const bookIdx = args.indexOf("--book");
    generateRef(args[0], bookIdx >= 0 ? args[bookIdx + 1] : undefined);
  } else {
    generateAll(parseCliArgs());
  }
}

function generateClass(ref: ClassReference, book: string) {
  const slug = toCamelCase(ref.raw.name);

  // Generate class seed .ts
  const classCode = generateClassSeed(ref);
  const classPath = join(BASE_DIR, "generated", book, "classes", `${slug}.ts`);
  writeGenerated(classPath, classCode);

  // Generate class feature seeds .ts
  const featCode = generateClassFeatSeeds(ref);
  const featPath = join(BASE_DIR, "generated", book, "feats", "classes", `${slug}.ts`);
  writeGenerated(featPath, featCode);

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
  writeGenerated(featPath, featCode);

  regenerateFavoredEnemyFeats(book);
  regenerateAptitudes(book);
  regenerateFeatIndex(book);

  if (!quiet) console.log(`\nDone! Review the generated file and copy to database/packages/dnd35/ when ready.`);
}

function generateSpell(ref: SpellReference, book: string) {
  const { spells } = buildSpellSeeds(ref, book);
  if (!quiet) console.log(`Built ${spells.length} spell seeds`);

  // Generate .ts files per level
  const files = generateSpellFiles(spells);
  const spellDir = join(BASE_DIR, "generated", book, "spells");

  // Remove stale level files that won't be regenerated (e.g. cantrips.ts when no level-0 spells)
  const LEVEL_FILES = ["cantrips.ts", ...Array.from({ length: 9 }, (_, i) => `level${i + 1}.ts`)];
  for (const f of LEVEL_FILES) {
    if (!files.has(f)) {
      try { unlinkSync(join(spellDir, f)); } catch { /* doesn't exist */ }
    }
  }

  for (const [filename, code] of files) {
    const filePath = join(spellDir, filename);
    writeGenerated(filePath, code);
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
  lines.push(`import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/types.ts";`);
  lines.push(``);
  lines.push(`export const WIZARD_SCHOOLS: WizardSchoolDefinition[] = [`);
  for (const s of seeds) {
    lines.push(`  {`);
    lines.push(`    name: ${quote(s.name)},`);
    lines.push(`    description: ${quote(s.description)},`);
    lines.push(`    prohibitedSchoolCount: ${s.prohibitedSchoolCount},`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  writeGenerated(join(BASE_DIR, "generated", book, "wizard-schools", "data.ts"), lines.join("\n"));

  if (!quiet) console.log(`\nDone!`);
}

/** A book's domains file (data.ts). */
function domainsCode(seeds: DomainDefinition[]): string {
  const lines: string[] = [];
  lines.push(`export const ALL_DOMAINS: DomainDefinition[] = [`);
  for (const d of seeds) {
    lines.push(`  {`);
    lines.push(`    name: ${quote(d.name)},`);
    lines.push(`    description: ${quote(d.description)},`);
    lines.push(...listField("modifiers", (d.modifiers ?? []).map(stringifyModifier), "    "));
    lines.push(`    spells: [`);
    for (const s of d.spells) {
      lines.push(`      { name: ${quote(s.name)}, level: ${s.level} },`);
    }
    lines.push(`    ],`);
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);
  return [`import type { DomainDefinition } from "@/database/packages/dnd35/content/types.ts";`, ``, ...lines].join("\n");
}

function generateDomain(_ref: DomainReference, book: string) {
  // Load master domain reference (all domains from srd.dndtools.org)
  const masterPath = join(REFERENCE_DIR, "domains.json");
  if (!existsSync(masterPath)) {
    console.error(`Master domain reference not found: ${masterPath}`);
    console.error(`Run: bun run parser:scrape -- domain`);
    process.exit(1);
  }
  const masterRef = loadReference(masterPath, "domain");

  // Collect all available spell names from this book + SRD (ancestor)
  // Also build canonical name map (lowercase → exact name from spell reference)
  const availableSpells = new Set<string>();
  const canonicalSpellName = new Map<string, string>();
  const booksToCheck = book === "srd" ? ["srd"] : ["srd", book];
  for (const b of booksToCheck) {
    const spellsPath = join(REFERENCE_DIR, b, "spells.json");
    if (!existsSync(spellsPath)) continue;
    const spellRef = loadReference(spellsPath, "spell");
    for (const spell of spellRef.raw) {
      availableSpells.add(spell.name.toLowerCase());
      canonicalSpellName.set(spell.name.toLowerCase(), spell.name);
    }
  }
  if (!quiet) console.log(`Available spells: ${availableSpells.size} (from ${booksToCheck.join(" + ")})`);

  // For extensions, also collect SRD-only spells to determine which domains are already complete in the ancestor
  const srdOnlySpells = new Set<string>();
  if (book !== "srd") {
    const srdSpellsPath = join(REFERENCE_DIR, "srd", "spells.json");
    if (existsSync(srdSpellsPath)) {
      const srdRef = loadReference(srdSpellsPath, "spell");
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
    writeGenerated(dataPath, [
      GENERATED_HEADER,
      `import type { DomainDefinition } from "@/database/packages/dnd35/content/types.ts";`,
      ``,
      `export const ALL_DOMAINS: DomainDefinition[] = [];`,
      ``,
    ].join("\n"));
  } else {
    writeGenerated(dataPath, domainsCode(seeds));
  }

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

  writeGenerated(join(BASE_DIR, "generated", book, "feats", "favoredEnemy.ts"), generateFavoredEnemyFeats());
}

function generateDomainFeatPool(feats: FeatSeed[], book: string) {
  // Group feats by pool aptitude to produce one array per pool
  const byAptitude = new Map<string, typeof feats>();
  for (const feat of feats) {
    const apt = feat.aptitudes[0];
    if (!byAptitude.has(apt)) byAptitude.set(apt, []);
    byAptitude.get(apt)!.push(feat);
  }

  const uses = new Set<string>();
  const lines: string[] = [];
  for (const [_apt, poolFeats] of byAptitude) {
    lines.push(`export const DOMAIN_POOL_FEATS: FeatSeed[] = [`);
    for (const feat of poolFeats) lines.push(...featLines(feat, uses));
    lines.push(`];`);
    lines.push(``);
  }

  const head = [GENERATED_HEADER, `import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";`, ...requirementImports(uses), ``];
  writeGenerated(join(BASE_DIR, "generated", book, "feats", "domainFeats.ts"), [...head, ...lines].join("\n"));
}

function generateRace(ref: RaceReference, book: string) {
  const seeds = buildRaceSeeds(ref);
  if (!quiet) console.log(`Built ${seeds.length} race seeds`);

  // Generate data.ts
  const lines: string[] = [];
  lines.push(`export const ALL_RACES: RaceDefinition[] = [`);
  for (const r of seeds) {
    lines.push(`  {`);
    lines.push(`    name: ${quote(r.name)},`);
    lines.push(`    description: ${quote(r.description)},`);
    lines.push(`    size: ${quote(r.size)},`);
    lines.push(`    baseSpeed: ${r.baseSpeed},`);
    lines.push(...listField("modifiers", (r.modifiers ?? []).map(stringifyModifier), "    "));
    lines.push(`  },`);
  }
  lines.push(`];`);
  lines.push(``);

  const head = [`import type { RaceDefinition } from "@/database/packages/dnd35/content/types.ts";`, ``];
  writeGenerated(join(BASE_DIR, "generated", book, "races", "data.ts"), [...head, ...lines].join("\n"));

  if (!quiet) console.log(`\nDone!`);
}

function generateItem(ref: ItemReference, book: string) {
  const seeds = buildItemSeeds(ref);
  const outDir = join(BASE_DIR, "generated", book, "items");

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

/**
 * Writes a file of items, `constName`: each its name and description, then the lines `fields` gives. `imports`
 * are the builders it takes from content/items.ts.
 */
function writeItemFile<T extends { name: string; description: string }>(path: string, constName: string, imports: string[], items: T[], fields: (item: T) => string[]) {
  const lines = [
    GENERATED_HEADER,
    `import type { ItemDef } from "@/database/packages/dnd35/content/types.ts";`,
    ...imports.length > 0 ? [`import { ${imports.join(", ")} } from "@/database/packages/dnd35/content/items.ts";`] : [],
    ``,
    `export const ${constName}: ItemDef[] = [`,
    ...items.flatMap((item) => [
      `  {`,
      `    name: ${quote(item.name)},`,
      `    description: ${quote(item.description)},`,
      ...fields(item).map((line) => `    ${line}`),
      `  },`,
    ]),
    `];`,
    ``,
  ];
  writeGenerated(path, lines.join("\n"));
}

function generateWeaponFile(path: string, constName: string, weapons: ReturnType<typeof buildItemSeeds>["simpleWeapons"], profFn: string) {
  writeItemFile(path, constName, [profFn, "weaponProperties"], weapons, (w) => [
    `weight: ${quote(w.weight)}, costGp: ${quote(w.costGp)}, type: "Weapon",`,
    `requirements: ${profFn}(${quote(w.name)}),`,
    `properties: weaponProperties(${quote(w.name)}),`,
  ]);
}

function generateArmorFile(path: string, constName: string, items: ReturnType<typeof buildItemSeeds>["armor"]) {
  const profs = [...new Set(items.map((a) => getArmorProf(a.name)))].sort();
  writeItemFile(path, constName, ["armorProperties", ...profs], items, (a) => [
    `weight: ${quote(a.weight)}, costGp: ${quote(a.costGp)}, type: "Armor", slot: "Torso",`,
    `requirements: ${getArmorProf(a.name)},`,
    `properties: armorProperties(${quote(a.name)}),`,
  ]);
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
  const profs = [...new Set(items.map((s) => getShieldProf(s.name)))].sort();
  writeItemFile(path, constName, ["shieldProperties", ...profs], items, (s) => [
    `weight: ${quote(s.weight)}, costGp: ${quote(s.costGp)}, type: "Shield", slot: "Off Hand",`,
    `requirements: ${getShieldProf(s.name)},`,
    `properties: shieldProperties(${quote(s.name)}),`,
  ]);
}

function getShieldProf(generatorName: string): string {
  const def = getShieldDefinition(generatorName);
  if (def?.shieldType === "Tower") return "TOWER_SHIELD_PROF";
  return "SHIELD_PROF";
}

function generateGoodsFile(path: string, constName: string, items: ReturnType<typeof buildItemSeeds>["goods"]) {
  writeItemFile(path, constName, [], items, (g) => [
    `weight: ${quote(g.weight)}, costGp: ${quote(g.costGp)}, type: "Other", slot: "Other",`,
    `properties: [],`,
  ]);
}

function generateItemIndex(outDir: string) {
  const lines: string[] = [];
  lines.push(GENERATED_HEADER);
  lines.push(`export { SIMPLE_WEAPONS } from "./weapons.ts";`);
  lines.push(`export { MARTIAL_WEAPONS } from "./martial.ts";`);
  lines.push(`export { EXOTIC_WEAPONS } from "./exotic.ts";`);
  lines.push(`export { ARMOR } from "./armor.ts";`);
  lines.push(`export { SHIELDS } from "./shields.ts";`);
  lines.push(`export { GOODS } from "./goods.ts";`);
  lines.push(``);
  const outPath = join(outDir, "index.ts");
  writeGenerated(outPath, lines.join("\n"));
}

function generateMagicItem(ref: MagicItemReference, book: string) {
  const seeds = buildMagicItemSeeds(ref);
  const outDir = join(BASE_DIR, "generated", book, "items");

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
  writeItemFile(path, constName, [], items, (item) => [
    `weight: ${quote(item.weight)}, costGp: ${quote(item.costGp)}, type: ${quote(item.type)},${item.slot ? ` slot: ${quote(item.slot)},` : ""}`,
    ...item.sourceItem ? [`sourceItem: ${quote(item.sourceItem)},`] : [],
    ...item.properties.length > 0
      ? [`properties: [`, ...item.properties.map((p) => `  ${stringifyProperty(p)},`), `],`]
      : [`properties: [],`],
    ...listField("modifiers", (item.modifiers ?? []).map(stringifyModifier), ""),
  ]);
}

function generateItemIndexWithMagic(outDir: string) {
  const lines: string[] = [];
  lines.push(GENERATED_HEADER);
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
  writeGenerated(outPath, lines.join("\n"));
}

/** Regenerate aptitudes.ts for a book from reference JSONs: its feats', and the core rules' system feats. */
function regenerateAptitudes(book: string) {
  const featRefPath = join(REFERENCE_DIR, book, "feats.json");
  const feats = [
    ...existsSync(featRefPath) ? featAptitudeSources(loadReference(featRefPath, "feat")) : [],
    ...book === "srd" ? coreSystemFeats(buildWizardSchoolSeeds(loadReference(join(REFERENCE_DIR, "srd", "wizardSchools.json"), "wizardSchool"))) : [],
  ];

  const aptitudes = collectAptitudes(feats, book);

  const aptLines: string[] = [];
  aptLines.push(GENERATED_HEADER);
  aptLines.push(``);
  aptLines.push(`export const ALL_APTITUDES: string[] = [`);
  for (const apt of aptitudes) {
    aptLines.push(`  ${quote(apt)},`);
  }
  aptLines.push(`];`);
  aptLines.push(``);
  writeGenerated(join(BASE_DIR, "generated", book, "aptitudes.ts"), aptLines.join("\n"));
}

/** Regenerate cowFeats.ts for a book from bonusFeatLists in class reference JSONs.
 *  Only emits entries for feats that don't already exist in the book's own feat pool
 *  (i.e. cross-book references that actually need COW). Same-book feats already get
 *  their aptitudes added directly by the feat generator. */
function regenerateCowFeats(book: string) {
  if (book === "srd") return; // the core rules are what extensions copy from
  const classes = classReferences(book);
  if (classes.length === 0) return;

  // Load the book's own raw feat names — these already get aptitudes via the feat generator
  const bookFeats = new Set<string>();
  const bookFeatsPath = join(REFERENCE_DIR, book, "feats.json");
  if (existsSync(bookFeatsPath)) {
    const ref = loadReference(bookFeatsPath, "feat");
    for (const feat of ref.raw) bookFeats.add(feat.name);
  }

  // Also collect class feature seed names — these are generated as feats by the class feat generator
  const classFeatureNames = new Set<string>();
  for (const { ref } of classes) {
    for (const feat of Object.values(ref.mapping.features)) {
      if (feat.seedName) classFeatureNames.add(feat.seedName);
    }
  }

  type CowEntry = { feat: string; requirements: { className: string; level: number }[]; aptitudes: string[] };
  const entries: CowEntry[] = [];

  for (const { ref } of classes) {
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
  lines.push(GENERATED_HEADER);
  lines.push(`import type { CowFeatEntry } from "@/database/packages/dnd35/content/types.ts";`);
  lines.push(``);
  lines.push(`export const COW_FEATS: CowFeatEntry[] = [`);
  for (const entry of deduped.values()) {
    const aptStr = entry.aptitudes.map((a) => `${quote(a)}`).join(", ");
    lines.push(`  { feat: ${quote(entry.feat)}, requirements: [], aptitudes: [${aptStr}] },`);
  }
  lines.push(`];`);
  lines.push(``);

  writeGenerated(outPath, lines.join("\n"));
}

/** Regenerate cowSpells.ts for ALL books that have casting classes. Called after spell generation
 *  since new spells in any book may change COW entries in other books. */
function regenerateCowSpellsAllBooks() {
  for (const book of readdirSync(REFERENCE_DIR)) {
    regenerateCowSpells(book);
  }
}

/** Regenerate cowSpells.ts for a book. Scans all OTHER books' spell references for spells that
 *  have levelEntries matching this book's casting classes. Produces per-class-level entries
 *  so the seed uses the correct level for each class (not the global minimum). */
function regenerateCowSpells(book: string) {
  if (book === "srd") return; // the core rules are what extensions copy from
  const classes = classReferences(book);
  if (classes.length === 0) return;

  // Build map: className → aptitude name for classes that have spell lists
  const classToApt = new Map<string, string>();
  // Build map: parentClassName → [{ aptitude, className }] for classes that inherit another class's spell list
  const inheritedApts = new Map<string, { aptitude: string }[]>();
  for (const { ref } of classes) {
    const spells = classSpells(ref);
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
  const bookSpellPath = join(REFERENCE_DIR, book, "spells.json");
  if (existsSync(bookSpellPath)) {
    const ref = loadReference(bookSpellPath, "spell");
    for (const spell of ref.raw) bookSpellNames.add(spell.name);
  }

  // Scan ALL other books' spell references
  type CowEntry = { spell: string; aptitudes: { aptitude: string; level: number }[] };
  const entries = new Map<string, CowEntry>();

  // Find the base book (the one defining core classes like Wizard).
  // COW only makes sense for spells from the base book, not siblings.
  const baseBook = readdirSync(REFERENCE_DIR).find((b) => classReferences(b).some(({ ref }) => ref.raw?.name === "Wizard"));
  const isBaseBook = book === baseBook;
  const allBooks = readdirSync(REFERENCE_DIR);
  for (const otherBook of allBooks) {
    const spellPath = join(REFERENCE_DIR, otherBook, "spells.json");
    if (!existsSync(spellPath)) continue;

    const ref = loadReference(spellPath, "spell");
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
  lines.push(GENERATED_HEADER);
  lines.push(`import type { CowSpellEntry } from "@/database/packages/dnd35/content/types.ts";`);
  lines.push(``);
  lines.push(`export const COW_SPELLS: CowSpellEntry[] = [`);
  for (const entry of entries.values()) {
    const aptStr = entry.aptitudes.map((a) => `{ aptitude: ${quote(a.aptitude)}, level: ${a.level} }`).join(", ");
    lines.push(`  { spell: ${quote(entry.spell)}, aptitudes: [${aptStr}] },`);
  }
  lines.push(`];`);
  lines.push(``);

  writeGenerated(outPath, lines.join("\n"));
}

/** Regenerate classes/index.ts for a book from class reference JSONs. */
function regenerateClassIndex(book: string) {
  const classes = classReferences(book).sort((a, b) => (a.file < b.file ? -1 : 1));
  if (classes.length === 0) return; // no classes for this book

  type ClassEntry = { slug: string; constName: string; isBase: boolean };
  const entries: ClassEntry[] = [];

  for (const { ref } of classes) {
    if (!ref.raw?.name) continue;
    const slug = toCamelCase(ref.raw.name);
    const levels = ref.detected?.levels ?? 0;
    entries.push({
      slug,
      constName: toConstName(ref.raw.name),
      isBase: levels === 20,
    });
  }

  const names = (list: ClassEntry[]) => list.map((e) => e.constName);
  const baseEntries = entries.filter((e) => e.isBase);
  const prestigeEntries = entries.filter((e) => !e.isBase);
  const lines = [
    ...indexHead("ClassSeed", entries.map((e) => ({ constName: e.constName, file: `${e.slug}.ts` }))),
    ...listExport("ALL_CLASSES", "ClassSeed", names(entries)),
    ...baseEntries.length > 0 ? listExport("ALL_BASE_CLASSES", "ClassSeed", names(baseEntries)) : [],
    ...prestigeEntries.length > 0 ? listExport("ALL_PRESTIGE_CLASSES", "ClassSeed", names(prestigeEntries)) : [],
  ];

  const genClassDir = join(BASE_DIR, "generated", book, "classes");
  const outPath = join(genClassDir, "index.ts");
  writeGenerated(outPath, lines.join("\n"));
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

  const lines = indexHead("FeatSeed", entries.map((e) => ({ constName: e.constName, file: `${e.slug}.ts` })));

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
  writeGenerated(outPath, lines.join("\n"));
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
  lines.push(GENERATED_HEADER);
  lines.push(`import type { FeatSeed } from "@/database/packages/dnd35/content/types.ts";`);
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
    const standalone = allFeatExports.map((name) => `..._${name}`);
    lines.push(...listExport("ALL_STANDALONE_FEATS", "FeatSeed", standalone));
    // ALL_FEATS: everything (standalone + class feats)
    lines.push(...listExport("ALL_FEATS", "FeatSeed", hasClassFeats ? [...standalone, "..._ALL_CLASS_FEATS"] : standalone));
  }

  const outPath = join(featDir, "index.ts");
  writeGenerated(outPath, lines.join("\n"));
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

  const lines = [
    ...indexHead("SpellSeed", levelFiles),
    ...listExport("ALL_SPELLS", "SpellSeed", levelFiles.map((lf) => `...${lf.constName}.map((p) => ({ ...p, level: ${lf.level} }))`)),
  ];

  const outPath = join(spellDir, "index.ts");
  writeGenerated(outPath, lines.join("\n"));
}

main();
