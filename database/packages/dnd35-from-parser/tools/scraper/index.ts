import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class.ts";
import { parseFeatListingHtml, parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import { parseSpellListingHtml, parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";
import { parseDomainsHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/domain.ts";
import { parseRaceListingHtml, parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { parseWeaponsHtml, parseArmorHtml, parseGoodsHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/item.ts";
import { parseMagicArmorHtml, parseMagicShieldsHtml, parseMagicWeaponsHtml, parseWondrousItemsHtml, parseRingsHtml, parseRodsHtml, parseStaffsHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/magicItem.ts";
import { buildDetected, buildInitialMapping, buildOccurrenceMap } from "@/database/packages/dnd35-from-parser/tools/scraper/detectClass.ts";
import { buildFeatDetected, buildFeatMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectFeat.ts";
import { buildDomainDetected, buildDomainMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectDomain.ts";
import { buildRaceDetected, buildRaceMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectRace.ts";
import { buildItemDetected, buildItemMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectItem.ts";
import { buildMagicItemDetected, buildMagicItemMapping } from "@/database/packages/dnd35-from-parser/tools/scraper/detectMagicItem.ts";
import type { ClassReference, DomainReference, FeatReference, ItemReference, MagicItemReference, RaceReference, SpellReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { sanitizeJsonValues, stableStringify } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { toCamelCase, sortKeysDeep } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { fetchHtml, fetchAllPages, configureHttp } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { buildListingUrl, buildRaceListingUrl, getBookSlug, BASE_URL } from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";

// ---------------------------------------------------------------------------
// Write helper — only updates scrapedAt when content actually changed
// ---------------------------------------------------------------------------

function writeIfChanged(outPath: string, data: Record<string, unknown>): void {
  const newJson = stableStringify(data);
  if (existsSync(outPath)) {
    const oldData = sortKeysDeep(JSON.parse(readFileSync(outPath, "utf-8")));
    const stripTimestamp = (d: unknown) => {
      const copy = structuredClone(d) as Record<string, Record<string, unknown>>;
      delete copy._meta.scrapedAt;
      return JSON.stringify(copy);
    };
    if (stripTimestamp(sortKeysDeep(data)) === stripTimestamp(oldData)) {
      return;
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, newJson);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const BASE_DIR = join(import.meta.dirname!, "../../");

async function main() {
  const args = process.argv.slice(2);

  // Parse global options
  const noCacheIdx = args.indexOf("--no-cache");
  const noCache = noCacheIdx >= 0;
  if (noCache) args.splice(noCacheIdx, 1);

  const delayIdx = args.indexOf("--delay");
  const delay = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : undefined;
  if (delayIdx >= 0) args.splice(delayIdx, 2);

  configureHttp({ noCache, ...(delay ? { delay } : {}) });

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const type = args[0];
  const urlIdx = args.indexOf("--url");
  const url = urlIdx >= 0 ? args[urlIdx + 1] : undefined;
  const bookIdx = args.indexOf("--book");
  const book = bookIdx >= 0 ? args[bookIdx + 1] : "srd";

  if (type === "class") {
    if (url) {
      await scrapeClass(url, book);
    } else {
      await scrapeAllClasses(book);
    }
  } else if (type === "feat") {
    if (url) {
      await scrapeSingleFeat(url);
    } else {
      await scrapeAllFeats(book);
    }
  } else if (type === "spell") {
    if (url) {
      await scrapeSingleSpell(url);
    } else {
      await scrapeAllSpells(book);
    }
  } else if (type === "domain") {
    await scrapeAllDomains();
  } else if (type === "race") {
    if (url) {
      await scrapeSingleRace(url);
    } else {
      await scrapeAllRaces(book);
    }
  } else if (type === "item") {
    await scrapeAllItems(book);
  } else if (type === "magicItem") {
    await scrapeAllMagicItems(book);
  } else if (type === "wizardSchool") {
    console.log(`Skipping wizardSchool — no HTML parser (reference is manually maintained)`);
  } else {
    console.error(`Unknown type: ${type}. Supported: class, feat, spell, domain, race, item, magicItem, wizardSchool`);
    process.exit(1);
  }
}

function printUsage() {
  console.error("Usage: bun scraper/index.ts <type> [options]");
  console.error("");
  console.error("  Types:");
  console.error("    class              Scrape class(es)");
  console.error("    feat               Scrape feat(s)");
  console.error("    spell              Scrape spell(s)");
  console.error("    domain             Scrape domains");
  console.error("    race               Scrape race(s)");
  console.error("    item               Scrape items (d20srd.org)");
  console.error("    magicItem          Scrape magic items (d20srd.org)");
  console.error("");
  console.error("  Options:");
  console.error("    --book <slug>      Source book slug (default: srd)");
  console.error("    --url <url>        Scrape a single entity by URL");
  console.error("    --filter <mode>    Domain filter: core|non-core|all (default: core)");
  console.error("    --no-cache         Disable disk cache");
  console.error("    --delay <ms>       Delay between requests (default: 200)");
  console.error("");
  console.error("  Examples:");
  console.error("    bun scraper/index.ts class --book srd");
  console.error("    bun scraper/index.ts class --url https://dndtools.net/classes/.../barbarian/ --book srd");
  console.error("    bun scraper/index.ts feat --book srd");
  console.error("    bun scraper/index.ts domain");
  console.error("    bun scraper/index.ts spell --book srd");
  console.error("    bun scraper/index.ts race --book srd");
}

// ---------------------------------------------------------------------------
// Class scraping
// ---------------------------------------------------------------------------

async function scrapeAllClasses(book: string) {
  // dndtools.net doesn't support /classes/{book}/ URLs — use the full listing
  // and filter by book slug in the class URL path
  const bookSlug = getBookSlug(book);
  const listingUrl = `${BASE_URL}/classes/`;
  console.log(`Discovering classes from ${listingUrl} (filtering for ${bookSlug})...`);

  const pages = await fetchAllPages(listingUrl);
  const classUrls: { name: string; url: string }[] = [];

  for (const pageHtml of pages) {
    const $ = (await import("cheerio")).load(pageHtml);
    $("table tr").each((_, row) => {
      const firstCell = $(row).find("td").first();
      if (firstCell.length === 0) return;
      const link = firstCell.find("a").first();
      if (link.length === 0) return;
      const name = link.text().trim();
      const href = link.attr("href");
      if (!name || !href || !href.includes("/classes/")) return;
      // Filter by book slug in URL path
      if (!href.includes(`/${bookSlug}/`)) return;
      classUrls.push({ name, url: href.startsWith("http") ? href : `${BASE_URL}${href}` });
    });
  }

  console.log(`Found ${classUrls.length} classes`);

  for (const entry of classUrls) {
    console.log(`\n--- Scraping: ${entry.name} ---`);
    await scrapeClass(entry.url, book);
  }
}

async function scrapeClass(url: string, book: string) {
  console.log(`Fetching ${url}...`);
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    // If 404 and URL includes a book slug, try without it
    // e.g. /classes/complete-divine--52/spirit-shaman/ → /classes/spirit-shaman/
    if (err instanceof Error && err.message.includes("404")) {
      const slugMatch = url.match(/\/classes\/[^/]+\/([^/]+)\/?$/);
      if (slugMatch) {
        const fallbackUrl = `${BASE_URL}/classes/${slugMatch[1]}/`;
        console.log(`  404 — trying fallback: ${fallbackUrl}`);
        html = await fetchHtml(fallbackUrl);
        url = fallbackUrl; // Update for _meta.sourceUrl
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  console.log(`Parsing class HTML (${html.length} bytes)...`);

  const { _meta, ...raw } = parseClassHtml(html, url, book);

  console.log(`Detected class: ${raw.name}`);
  console.log(`  Levels: ${raw.progression.length}`);
  console.log(`  Features: ${raw.classFeatures.length}`);

  const slug = toCamelCase(raw.name);
  const outPath = join(BASE_DIR, "reference", book, "classes", `${slug}.json`);

  let existingOverrides: ClassReference["mapping"]["overrides"] | undefined;

  if (existsSync(outPath)) {
    const existing: ClassReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    existingOverrides = existing.mapping.overrides;
    console.log(`  Preserving existing overrides from ${outPath}`);
  }

  if (existingOverrides?.alignment && !raw.prerequisites.parsed.alignment) {
    raw.prerequisites.parsed.alignment = existingOverrides.alignment;
  }

  const detected = buildDetected(raw);
  console.log(`  BAB: ${detected.bab}`);
  console.log(`  Saves: fort=${detected.saves.fortitude} ref=${detected.saves.reflex} will=${detected.saves.will}`);
  if (detected.casterLevelAdvancement) {
    console.log(`  Caster advancement: ${detected.casterLevelAdvancement.type} at levels ${detected.casterLevelAdvancement.levels.join(", ")}`);
  }

  const mapping = buildInitialMapping(raw, detected);
  if (existingOverrides) mapping.overrides = existingOverrides;

  if (mapping.overrides?.noSpells) {
    delete mapping.spells;
    delete mapping.bonusSpellAbility;
  }

  if (mapping.overrides?.features) {
    for (const [name, overrideFields] of Object.entries(mapping.overrides.features)) {
      if (name in mapping.features) {
        Object.assign(mapping.features[name], overrideFields);
        for (const [k, v] of Object.entries(mapping.features[name])) {
          if (v === null) delete (mapping.features[name] as Record<string, unknown>)[k];
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mapping.features[name] = overrideFields as any;
      }
    }
  }

  mapping.occurrenceMap = buildOccurrenceMap(mapping.features, detected.featureOccurrences);

  const reference: ClassReference = sanitizeJsonValues({ _meta, raw, detected, mapping });
  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);

  console.log(`Written: ${outPath}`);
}

// ---------------------------------------------------------------------------
// Feat scraping
// ---------------------------------------------------------------------------

async function scrapeAllFeats(book: string) {
  const listingUrl = buildListingUrl("feats", book);
  console.log(`Discovering feats from ${listingUrl}...`);

  const pages = await fetchAllPages(listingUrl);
  const featUrls: { name: string; url: string }[] = [];

  for (const pageHtml of pages) {
    const entries = parseFeatListingHtml(pageHtml);
    for (const entry of entries) {
      featUrls.push({
        name: entry.name,
        url: entry.url.startsWith("http") ? entry.url : `${BASE_URL}${entry.url}`,
      });
    }
  }

  console.log(`Found ${featUrls.length} feats, fetching detail pages...`);

  const raw: FeatReference["raw"] = [];
  for (const entry of featUrls) {
    const html = await fetchHtml(entry.url);
    const feat = parseFeatDetailHtml(html);
    if (feat) {
      raw.push(feat);
      console.log(`  ${feat.name} [${feat.featType}]`);
    } else {
      console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} feats`);

  const outPath = join(BASE_DIR, "reference", book, "feats.json");

  let overrides: FeatReference["mapping"]["overrides"] = {};
  if (existsSync(outPath)) {
    const existing: FeatReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    overrides = existing.mapping?.overrides ?? {};
    console.log(`  Preserving existing overrides from ${outPath}`);
  }

  const sanitizedRaw = sanitizeJsonValues(raw) as FeatReference["raw"];
  const detected = buildFeatDetected(sanitizedRaw);
  const mapping = buildFeatMapping(sanitizedRaw, detected, overrides, book);
  const reference: FeatReference = sanitizeJsonValues({
    _meta: {
      type: "feat",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
    detected,
    mapping,
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`Written: ${outPath}`);
}

async function scrapeSingleFeat(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
  const feat = parseFeatDetailHtml(html);
  if (!feat) {
    console.error(`Could not parse feat from ${url}`);
    process.exit(1);
  }
  console.log(`Parsed: ${feat.name} [${feat.featType}]`);
  console.log(`  Prerequisite: ${feat.prerequisiteText || "(none)"}`);
  console.log(`  Benefit: ${feat.benefit.substring(0, 100)}...`);
  console.log(JSON.stringify(feat, null, 2));
}

// ---------------------------------------------------------------------------
// Spell scraping
// ---------------------------------------------------------------------------

async function scrapeAllSpells(book: string) {
  const listingUrl = buildListingUrl("spells", book);
  console.log(`Discovering spells from ${listingUrl}...`);

  const pages = await fetchAllPages(listingUrl);
  const spellUrls: { name: string; url: string }[] = [];

  for (const pageHtml of pages) {
    const entries = parseSpellListingHtml(pageHtml);
    for (const entry of entries) {
      spellUrls.push({
        name: entry.name,
        url: entry.url.startsWith("http") ? entry.url : `${BASE_URL}${entry.url}`,
      });
    }
  }

  console.log(`Found ${spellUrls.length} spells, fetching detail pages...`);

  const raw: SpellReference["raw"] = [];
  for (const entry of spellUrls) {
    const html = await fetchHtml(entry.url);
    const spell = parseSpellDetailHtml(html, entry.url);
    if (spell) {
      raw.push(spell);
    } else {
      console.warn(`  SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} spells`);

  const schools = new Map<string, number>();
  for (const spell of raw) {
    schools.set(spell.school, (schools.get(spell.school) ?? 0) + 1);
  }
  for (const [school, count] of [...schools.entries()].sort()) {
    console.log(`  ${school}: ${count}`);
  }

  const outPath = join(BASE_DIR, "reference", book, "spells.json");

  let spellOverrides: SpellReference["mapping"] | undefined;
  if (existsSync(outPath)) {
    const existing: SpellReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    spellOverrides = existing.mapping;
    if (spellOverrides) console.log(`  Preserving existing overrides from ${outPath}`);
  }

  const reference: SpellReference = sanitizeJsonValues({
    _meta: {
      type: "spell",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
    ...(spellOverrides ? { mapping: spellOverrides } : {}),
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`Written: ${outPath}`);
}

async function scrapeSingleSpell(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
  const spell = parseSpellDetailHtml(html, url);
  if (!spell) {
    console.error(`Could not parse spell from ${url}`);
    process.exit(1);
  }
  console.log(`Parsed: ${spell.name} (${spell.school})`);
  console.log(`  Level: ${spell.levelEntries.map((e) => `${e.className} ${e.level}`).join(", ")}`);
  console.log(JSON.stringify(spell, null, 2));
}

// ---------------------------------------------------------------------------
// Domain scraping
// ---------------------------------------------------------------------------

const DOMAIN_SOURCE_URL = "https://srd.dndtools.org/srd/magic/spells/classSpellLists/domains.html";

async function scrapeAllDomains() {
  console.log(`Scraping all domains from ${DOMAIN_SOURCE_URL}...`);

  const response = await fetch(DOMAIN_SOURCE_URL);
  if (!response.ok) {
    console.error(`Failed to fetch domain source: ${response.status}`);
    process.exit(1);
  }
  const html = await response.text();
  const result = parseDomainsHtml(html, DOMAIN_SOURCE_URL, "all-domains", "all");

  console.log(`Parsed ${result.raw.length} domains`);
  for (const d of result.raw) {
    console.log(`  ${d.name}: ${d.spells.length} spells`);
  }

  const outPath = join(BASE_DIR, "reference", "domains.json");

  // Load existing overrides
  let overrides: DomainReference["mapping"]["overrides"] = {};
  if (existsSync(outPath)) {
    const existing: DomainReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    overrides = existing.mapping?.overrides ?? {};
  }

  const detected = buildDomainDetected(result.raw);
  const mapping = buildDomainMapping(result.raw, detected, overrides);
  const reference: DomainReference = sanitizeJsonValues({
    _meta: {
      type: "domain",
      sourceUrl: DOMAIN_SOURCE_URL,
      book: "all-domains",
      filter: "all",
      scrapedAt: new Date().toISOString(),
    },
    raw: result.raw,
    detected,
    mapping,
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`Written: ${outPath}`);
}

// ---------------------------------------------------------------------------
// Race scraping
// ---------------------------------------------------------------------------

async function scrapeAllRaces(book: string) {
  const bookSlug = getBookSlug(book);
  const listingUrl = buildRaceListingUrl(book);
  console.log(`Discovering races from ${listingUrl} (filtering for ${bookSlug})...`);

  const pages = await fetchAllPages(listingUrl);
  const raceUrls: { name: string; url: string }[] = [];

  for (const pageHtml of pages) {
    const entries = parseRaceListingHtml(pageHtml);
    for (const entry of entries) {
      // Filter by book slug in URL path
      if (!entry.url.includes(`/${bookSlug}/`)) continue;
      raceUrls.push({
        name: entry.name,
        url: entry.url.startsWith("http") ? entry.url : `${BASE_URL}${entry.url}`,
      });
    }
  }

  console.log(`Found ${raceUrls.length} races`);

  const raw: RaceReference["raw"] = [];
  for (const entry of raceUrls) {
    console.log(`  Fetching: ${entry.name}...`);
    const html = await fetchHtml(entry.url);
    const race = parseRaceDetailHtml(html);
    if (race) {
      raw.push(race);
      const adjStr = race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)";
      console.log(`    ${race.name}: ${race.size}, speed ${race.baseSpeed}, ${adjStr}`);
    } else {
      console.warn(`    SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} races`);

  const outPath = join(BASE_DIR, "reference", book, "races.json");

  let overrides: RaceReference["mapping"]["overrides"] = {};
  if (existsSync(outPath)) {
    const existing: RaceReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    overrides = existing.mapping?.overrides ?? {};
    console.log(`  Preserving existing overrides from ${outPath}`);
  }

  const sanitizedRaw = sanitizeJsonValues(raw) as RaceReference["raw"];
  const detected = buildRaceDetected(sanitizedRaw);
  const mapping = buildRaceMapping(sanitizedRaw, detected, overrides);
  const reference: RaceReference = sanitizeJsonValues({
    _meta: {
      type: "race",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
    detected,
    mapping,
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`Written: ${outPath}`);
}

async function scrapeSingleRace(url: string) {
  console.log(`Fetching ${url}...`);
  const html = await fetchHtml(url);
  const race = parseRaceDetailHtml(html);
  if (!race) {
    console.error(`Could not parse race from ${url}`);
    process.exit(1);
  }
  console.log(`Parsed: ${race.name} (${race.size}, speed ${race.baseSpeed})`);
  console.log(`  Abilities: ${race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)"}`);
  if (race.favoredClass) console.log(`  Favored class: ${race.favoredClass}`);
  console.log(`  Features: ${race.features.length}`);
  console.log(JSON.stringify(race, null, 2));
}

// ---------------------------------------------------------------------------
// Item scraping (d20srd.org — static pages, not book-parameterized)
// ---------------------------------------------------------------------------

const D20SRD_URLS = {
  weapons: "https://www.d20srd.org/srd/equipment/weapons.htm",
  armor: "https://www.d20srd.org/srd/equipment/armor.htm",
  goods: "https://www.d20srd.org/srd/equipment/goodsAndServices.htm",
};

async function scrapeAllItems(book: string) {
  console.log(`Fetching item pages from d20srd.org...`);

  const [weaponsHtml, armorHtml, goodsHtml] = await Promise.all([
    fetchHtml(D20SRD_URLS.weapons),
    fetchHtml(D20SRD_URLS.armor),
    fetchHtml(D20SRD_URLS.goods),
  ]);

  console.log(`Parsing weapons (${weaponsHtml.length} bytes)...`);
  const rawWeapons = parseWeaponsHtml(weaponsHtml);
  console.log(`  Found ${rawWeapons.length} weapons`);

  console.log(`Parsing armor (${armorHtml.length} bytes)...`);
  const rawArmor = parseArmorHtml(armorHtml);
  console.log(`  Found ${rawArmor.length} armor/shield entries`);

  console.log(`Parsing goods (${goodsHtml.length} bytes)...`);
  const rawGoods = parseGoodsHtml(goodsHtml);
  console.log(`  Found ${rawGoods.length} goods`);

  const raw: ItemReference["raw"] = {
    weapons: rawWeapons,
    armor: rawArmor,
    goods: rawGoods,
  };

  const outPath = join(BASE_DIR, "reference", book, "items.json");

  // Preserve existing overrides
  let overrides: ItemReference["mapping"]["overrides"] | undefined;
  if (existsSync(outPath)) {
    const existing: ItemReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    overrides = existing.mapping?.overrides;
    console.log(`  Preserving existing overrides from ${outPath}`);
  }

  const nameMap = overrides?.nameMap;
  const detected = buildItemDetected(raw, nameMap);

  console.log(`\nDetection results:`);
  const matchedWeapons = Object.values(detected.weapons).filter((w) => w.generatorName).length;
  const matchedArmor = Object.values(detected.armor).filter((a) => a.generatorName).length;
  console.log(`  Weapons: ${matchedWeapons}/${Object.keys(detected.weapons).length} matched`);
  console.log(`  Armor/Shields: ${matchedArmor}/${Object.keys(detected.armor).length} matched`);
  console.log(`  Goods: ${Object.keys(detected.goods).length}`);
  if (detected.unresolved.length > 0) {
    console.log(`  Unresolved (${detected.unresolved.length}):`);
    for (const u of detected.unresolved) console.log(`    ${u}`);
  }

  const mapping = buildItemMapping(detected, overrides);
  const reference: ItemReference = sanitizeJsonValues({
    _meta: {
      type: "item",
      sourceUrls: D20SRD_URLS,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
    detected,
    mapping,
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`\nWritten: ${outPath}`);
}

// ---------------------------------------------------------------------------
// Magic item scraping (d20srd.org — 6 pages for specific/named magic items)
// ---------------------------------------------------------------------------

const D20SRD_MAGIC_URLS = {
  magicArmor: "https://www.d20srd.org/srd/magicItems/magicArmor.htm",
  magicWeapons: "https://www.d20srd.org/srd/magicItems/magicWeapons.htm",
  wondrousItems: "https://www.d20srd.org/srd/magicItems/wondrousItems.htm",
  rings: "https://www.d20srd.org/srd/magicItems/rings.htm",
  rods: "https://www.d20srd.org/srd/magicItems/rods.htm",
  staffs: "https://www.d20srd.org/srd/magicItems/staffs.htm",
};

async function scrapeAllMagicItems(book: string) {
  console.log(`Fetching magic item pages from d20srd.org...`);

  const [armorHtml, weaponsHtml, wondrousHtml, ringsHtml, rodsHtml, staffsHtml] = await Promise.all([
    fetchHtml(D20SRD_MAGIC_URLS.magicArmor),
    fetchHtml(D20SRD_MAGIC_URLS.magicWeapons),
    fetchHtml(D20SRD_MAGIC_URLS.wondrousItems),
    fetchHtml(D20SRD_MAGIC_URLS.rings),
    fetchHtml(D20SRD_MAGIC_URLS.rods),
    fetchHtml(D20SRD_MAGIC_URLS.staffs),
  ]);

  // magicArmor.htm contains both specific armors and specific shields
  console.log(`Parsing specific armors (${armorHtml.length} bytes)...`);
  const rawArmor = parseMagicArmorHtml(armorHtml);
  console.log(`  Found ${rawArmor.length} specific armors`);

  const rawShields = parseMagicShieldsHtml(armorHtml);
  console.log(`  Found ${rawShields.length} specific shields`);

  console.log(`Parsing specific weapons (${weaponsHtml.length} bytes)...`);
  const rawWeapons = parseMagicWeaponsHtml(weaponsHtml);
  console.log(`  Found ${rawWeapons.length} specific weapons`);

  console.log(`Parsing wondrous items (${wondrousHtml.length} bytes)...`);
  const rawWondrous = parseWondrousItemsHtml(wondrousHtml);
  console.log(`  Found ${rawWondrous.length} wondrous items`);

  console.log(`Parsing rings (${ringsHtml.length} bytes)...`);
  const rawRings = parseRingsHtml(ringsHtml);
  console.log(`  Found ${rawRings.length} rings`);

  console.log(`Parsing rods (${rodsHtml.length} bytes)...`);
  const rawRods = parseRodsHtml(rodsHtml);
  console.log(`  Found ${rawRods.length} rods`);

  console.log(`Parsing staffs (${staffsHtml.length} bytes)...`);
  const rawStaffs = parseStaffsHtml(staffsHtml);
  console.log(`  Found ${rawStaffs.length} staffs`);

  const raw: MagicItemReference["raw"] = [
    ...rawArmor,
    ...rawShields,
    ...rawWeapons,
    ...rawWondrous,
    ...rawRings,
    ...rawRods,
    ...rawStaffs,
  ];

  console.log(`\nTotal raw entries: ${raw.length}`);

  const outPath = join(BASE_DIR, "reference", book, "magicItems.json");

  // Preserve existing overrides
  let overrides: MagicItemReference["mapping"]["overrides"] | undefined;
  if (existsSync(outPath)) {
    const existing: MagicItemReference = sanitizeJsonValues(JSON.parse(readFileSync(outPath, "utf-8")));
    overrides = existing.mapping?.overrides;
    console.log(`  Preserving existing overrides from ${outPath}`);
  }

  const detected = buildMagicItemDetected(raw);
  const mapping = buildMagicItemMapping(detected, overrides);

  const categoryCounts: Record<string, number> = {};
  for (const entry of raw) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1;
  }
  console.log(`\nDetection results:`);
  for (const [cat, count] of Object.entries(categoryCounts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  const reference: MagicItemReference = sanitizeJsonValues({
    _meta: {
      type: "magicItem",
      sourceUrls: D20SRD_MAGIC_URLS,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
    detected,
    mapping,
  });

  writeIfChanged(outPath, reference as unknown as Record<string, unknown>);
  console.log(`\nWritten: ${outPath}`);
}

// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
