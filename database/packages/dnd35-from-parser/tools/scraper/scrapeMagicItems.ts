/** Scrapes the SRD's specific magic items (d20srd.org) into the magic item reference. */

import { join } from "node:path";

import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import {
  parseMagicArmorHtml,
  parseMagicShieldsHtml,
  parseMagicWeaponsHtml,
  parseRingsHtml,
  parseRodsHtml,
  parseStaffsHtml,
  parseWondrousItemsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/magicItem.ts";
import { saveReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { type MagicItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

/** The SRD's pages of specific magic items (d20srd.org). */
const D20SRD_MAGIC_URLS = {
  magicArmor: "https://www.d20srd.org/srd/magicItems/magicArmor.htm",
  magicWeapons: "https://www.d20srd.org/srd/magicItems/magicWeapons.htm",
  wondrousItems: "https://www.d20srd.org/srd/magicItems/wondrousItems.htm",
  rings: "https://www.d20srd.org/srd/magicItems/rings.htm",
  rods: "https://www.d20srd.org/srd/magicItems/rods.htm",
  staffs: "https://www.d20srd.org/srd/magicItems/staffs.htm",
};

export async function scrapeAllMagicItems(book: string) {
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
