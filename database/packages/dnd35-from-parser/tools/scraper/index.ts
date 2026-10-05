import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  type ReferenceType,
  resolveReference,
  storedOverrides,
  type StoredReference,
} from "@/database/packages/dnd35-from-parser/tools/references.ts";
import {
  sanitizeJsonValues,
  sortKeysDeep,
  stableStringify,
} from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import {
  BASE_URL,
  buildListingUrl,
  buildRaceListingUrl,
  getBookSlug,
} from "@/database/packages/dnd35-from-parser/tools/scraper/books.ts";
import { configureHttp, fetchAllPages, fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class.ts";
import {
  domainBookCode,
  domainName,
  type DomainPageSpell,
  parseDomainIndexHtml,
  parseDomainPageHtml,
  parseSpellDomainLevelsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/domain.ts";
import { parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import {
  parseArmorHtml,
  parseGoodsHtml,
  parseWeaponsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/item.ts";
import {
  parseMagicArmorHtml,
  parseMagicShieldsHtml,
  parseMagicWeaponsHtml,
  parseRingsHtml,
  parseRodsHtml,
  parseStaffsHtml,
  parseWondrousItemsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/magicItem.ts";
import { parseListingHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/page.ts";
import { parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";
import { REFERENCE_DIR, toCamelCase } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import type {
  FeatReference,
  ItemReference,
  MagicItemReference,
  RaceReference,
  SpellReference,
} from "@/database/packages/dnd35-from-parser/tools/types.ts";
import { isRecord } from "@/shared/isRecord.ts";

// ---------------------------------------------------------------------------
// Domain scraping
// ---------------------------------------------------------------------------

/** dndtools' domains as its copy at dnd.arkalseif.info keeps them: a page per book's version (`parsers/domain.ts`). */
const DOMAIN_SITE = "https://dnd.arkalseif.info/spells";
const DOMAIN_INDEX_URL = `${DOMAIN_SITE}/domains/index.html`;

// ---------------------------------------------------------------------------
// Item scraping (d20srd.org — static pages, not book-parameterized)
// ---------------------------------------------------------------------------

const D20SRD_URLS = {
  weapons: "https://www.d20srd.org/srd/equipment/weapons.htm",
  armor: "https://www.d20srd.org/srd/equipment/armor.htm",
  goods: "https://www.d20srd.org/srd/equipment/goodsAndServices.htm",
};

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

// ---------------------------------------------------------------------------
// Write helper — only updates scrapedAt when content actually changed
// ---------------------------------------------------------------------------

function writeIfChanged(outPath: string, data: StoredReference): void {
  const newJson = stableStringify(data);
  if (existsSync(outPath)) {
    const oldData = sortKeysDeep(JSON.parse(readFileSync(outPath, "utf-8")));
    const stripTimestamp = (d: unknown) => {
      const copy = structuredClone(d);
      if (isRecord(copy) && isRecord(copy._meta)) delete copy._meta.scrapedAt;
      return JSON.stringify(copy);
    };
    if (stripTimestamp(sortKeysDeep(data)) === stripTimestamp(oldData)) {
      return;
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, newJson);
}

/** A reference as scraped (its `_meta` and `raw`), with the overrides its file had. */
function scrapedReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
): StoredReference<T> {
  const overrides = storedOverrides(outPath, _meta.type);
  if (overrides) console.log(`  Preserving existing overrides from ${outPath}`);
  return sanitizeJsonValues({ _meta, raw, ...(overrides ? { overrides } : {}) });
}

/** Writes a reference to its file, when it changed. */
function writeReference(outPath: string, reference: StoredReference) {
  writeIfChanged(outPath, reference);
  console.log(`Written: ${outPath}`);
}

/** Saves a reference as scraped (its `_meta` and `raw`), keeping the overrides its file had. */
function saveReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
) {
  writeReference(outPath, scrapedReference(outPath, _meta, raw));
}

/**
 * Saves a reference as scraped (`saveReference`), and returns it with what the generator reads derived from it. A
 * reference that can't be derived isn't written.
 */
function saveResolvedReference<T extends ReferenceType>(
  outPath: string,
  _meta: StoredReference<T>["_meta"] & { type: T },
  raw: StoredReference<T>["raw"],
) {
  const reference = scrapedReference(outPath, _meta, raw);
  const resolved = resolveReference(_meta.type, reference);
  writeReference(outPath, reference);
  return resolved;
}

/** A listing's entries across its pages, with absolute URLs: only `bookSlug`'s, when given. */
async function discover(listingUrl: string, section: string, bookSlug?: string) {
  const entries: { name: string; url: string }[] = [];
  for (const pageHtml of await fetchAllPages(listingUrl)) {
    for (const { name, url } of parseListingHtml(pageHtml, section)) {
      if (bookSlug && !url.includes(`/${bookSlug}/`)) continue;
      entries.push({ name, url: url.startsWith("http") ? url : `${BASE_URL}${url}` });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Class scraping
// ---------------------------------------------------------------------------

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
  const outPath = join(REFERENCE_DIR, book, "classes", `${slug}.json`);

  const { detected } = saveResolvedReference(outPath, _meta, raw);
  console.log(`  BAB: ${detected.bab}`);
  console.log(`  Saves: fort=${detected.saves.fortitude} ref=${detected.saves.reflex} will=${detected.saves.will}`);
  if (detected.casterLevelAdvancement) {
    console.log(
      `  Caster advancement: ${detected.casterLevelAdvancement.type} at levels ${detected.casterLevelAdvancement.levels.join(", ")}`,
    );
  }
}

async function scrapeAllClasses(book: string) {
  // dndtools.net doesn't support /classes/{book}/ URLs — use the full listing
  // and filter by book slug in the class URL path
  const bookSlug = getBookSlug(book);
  const listingUrl = `${BASE_URL}/classes/`;
  console.log(`Discovering classes from ${listingUrl} (filtering for ${bookSlug})...`);

  const classUrls = await discover(listingUrl, "classes", bookSlug);

  console.log(`Found ${classUrls.length} classes`);

  for (const entry of classUrls) {
    console.log(`\n--- Scraping: ${entry.name} ---`);
    await scrapeClass(entry.url, book);
  }
}

// ---------------------------------------------------------------------------
// Feat scraping
// ---------------------------------------------------------------------------

async function scrapeAllFeats(book: string) {
  const listingUrl = buildListingUrl("feats", book);
  console.log(`Discovering feats from ${listingUrl}...`);

  const featUrls = await discover(listingUrl, "feats");

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

  const outPath = join(REFERENCE_DIR, book, "feats.json");

  saveReference(
    outPath,
    {
      type: "feat",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
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

  const spellUrls = await discover(listingUrl, "spells");

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

  const outPath = join(REFERENCE_DIR, book, "spells.json");

  saveReference(
    outPath,
    {
      type: "spell",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
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

/** A page of the domain index: the copy keeps page N as `index.html?page=N`, its `?` escaped. */
function domainIndexPageUrl(page: number) {
  return page === 1 ? DOMAIN_INDEX_URL : `${DOMAIN_INDEX_URL}%3Fpage=${page}`;
}

/** Every domain version of the index, with its page. */
async function fetchDomainPages() {
  const first = parseDomainIndexHtml(await fetchHtml(domainIndexPageUrl(1)));
  const entries = [...first.entries];
  for (let page = 2; entries.length < first.total; page++) {
    const { entries: more } = parseDomainIndexHtml(await fetchHtml(domainIndexPageUrl(page)));
    if (more.length === 0) break;
    entries.push(...more);
  }
  const pages = [];
  for (const entry of entries) {
    pages.push({
      ...entry,
      ...parseDomainPageHtml(await fetchHtml(`${DOMAIN_SITE}/domains/${entry.slug}/index.html`)),
    });
  }
  return pages;
}

/**
 * A book's domains as it prints them: each version whose page names the book, with its granted power and its 3.5
 * spells at their level there. Its spells are those its page lists and those of the domain's other versions (a page
 * of the copy can miss some), each kept at the level its own page gives this version.
 */
async function scrapeBookDomains(book: string) {
  const bookSlug = getBookSlug(book);
  const pages = await fetchDomainPages();
  // A version whose page names no book (Glory (CD)'s) is the book's when its label ends with the book's code, the
  // code ("CD") the versions that name the book end with
  const codes = new Set(pages.filter((page) => page.bookSlug === bookSlug).map((page) => domainBookCode(page.label)));
  codes.delete(undefined);
  const versions = pages.filter(
    (page) => page.bookSlug === bookSlug || (!page.bookSlug && codes.has(domainBookCode(page.label))),
  );
  const bookless = pages.filter((page) => !page.bookSlug && !versions.includes(page)).length;
  console.log(`${versions.length} of ${pages.length} domain versions are ${book}'s; ${bookless} others name no book`);

  const raw = [];
  for (const version of versions) {
    const name = domainName(version.label);
    const candidates = new Map<string, DomainPageSpell>();
    for (const page of pages.filter((p) => domainName(p.label) === name)) {
      for (const spell of page.spells) if (spell.edition.includes("3.5")) candidates.set(spell.path, spell);
    }
    const spells = [];
    for (const spell of candidates.values()) {
      const levels = parseSpellDomainLevelsHtml(await fetchHtml(`${DOMAIN_SITE}/${spell.path}/index.html`));
      const level = levels.get(version.slug);
      if (level !== undefined) spells.push({ name: spell.name, level });
    }
    spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    raw.push({ name, ...(version.page ? { page: version.page } : {}), description: version.description, spells });
    console.log(`  ${version.label}: ${spells.length} spells`);
  }
  if (raw.length === 0) {
    console.log(`No domain of ${book}: no reference written`);
    return;
  }

  saveReference(
    join(REFERENCE_DIR, book, "domains.json"),
    { type: "domain", sourceUrl: DOMAIN_INDEX_URL, book, scrapedAt: new Date().toISOString() },
    raw,
  );
}

// ---------------------------------------------------------------------------
// Race scraping
// ---------------------------------------------------------------------------

async function scrapeAllRaces(book: string) {
  const bookSlug = getBookSlug(book);
  const listingUrl = buildRaceListingUrl(book);
  console.log(`Discovering races from ${listingUrl} (filtering for ${bookSlug})...`);

  const raceUrls = await discover(listingUrl, "races", bookSlug);

  console.log(`Found ${raceUrls.length} races`);

  const raw: RaceReference["raw"] = [];
  for (const entry of raceUrls) {
    console.log(`  Fetching: ${entry.name}...`);
    const html = await fetchHtml(entry.url);
    const race = parseRaceDetailHtml(html);
    if (race) {
      raw.push(race);
      const adjStr =
        race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)";
      console.log(`    ${race.name}: ${race.size}, speed ${race.baseSpeed}, ${adjStr}`);
    } else {
      console.warn(`    SKIP: Could not parse ${entry.name} at ${entry.url}`);
    }
  }

  console.log(`Parsed ${raw.length} races`);

  const outPath = join(REFERENCE_DIR, book, "races.json");

  saveReference(
    outPath,
    {
      type: "race",
      sourceUrl: listingUrl,
      book,
      scrapedAt: new Date().toISOString(),
    },
    raw,
  );
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
  console.log(
    `  Abilities: ${race.abilityAdjustments.map((a) => `${a.ability} ${a.value > 0 ? "+" : ""}${a.value}`).join(", ") || "(none)"}`,
  );
  if (race.favoredClass) console.log(`  Favored class: ${race.favoredClass}`);
  console.log(`  Features: ${race.features.length}`);
  console.log(JSON.stringify(race, null, 2));
}

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

  const outPath = join(REFERENCE_DIR, book, "items.json");

  const { detected } = saveResolvedReference(
    outPath,
    { type: "item", sourceUrls: D20SRD_URLS, book, scrapedAt: new Date().toISOString() },
    raw,
  );
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
}

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

  const outPath = join(REFERENCE_DIR, book, "magicItems.json");

  const categoryCounts: Record<string, number> = {};
  for (const entry of raw) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1;
  }
  console.log(`\nDetection results:`);
  for (const [cat, count] of Object.entries(categoryCounts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  saveReference(
    outPath,
    { type: "magicItem", sourceUrls: D20SRD_MAGIC_URLS, book, scrapedAt: new Date().toISOString() },
    raw,
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printUsage() {
  console.error("Usage: bun scraper/index.ts <type> [options]");
  console.error("");
  console.error("  Types:");
  console.error("    class              Scrape class(es)");
  console.error("    feat               Scrape feat(s)");
  console.error("    spell              Scrape spell(s)");
  console.error("    domain             Scrape a book's domains (dndtools' copy at dnd.arkalseif.info)");
  console.error("    race               Scrape race(s)");
  console.error("    item               Scrape items (d20srd.org)");
  console.error("    magicItem          Scrape magic items (d20srd.org)");
  console.error("");
  console.error("  Options:");
  console.error("    --book <slug>      Source book slug (default: srd)");
  console.error("    --url <url>        Scrape a single entity by URL");
  console.error("    --no-cache         Disable disk cache");
  console.error("    --delay <ms>       Delay between requests (default: 200)");
  console.error("");
  console.error("  Examples:");
  console.error("    bun scraper/index.ts class --book srd");
  console.error("    bun scraper/index.ts class --url https://dndtools.net/classes/.../barbarian/ --book srd");
  console.error("    bun scraper/index.ts feat --book srd");
  console.error("    bun scraper/index.ts domain --book complete-divine");
  console.error("    bun scraper/index.ts spell --book srd");
  console.error("    bun scraper/index.ts race --book srd");
}

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
    await scrapeBookDomains(book);
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

// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
