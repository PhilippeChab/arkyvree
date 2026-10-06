/** Scrapes the SRD's equipment (d20srd.org) into the item reference. */

import { join } from "node:path";

import { fetchHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/http.ts";
import {
  parseArmorHtml,
  parseGoodsHtml,
  parseWeaponsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/item.ts";
import { saveResolvedReference } from "@/database/packages/dnd35-from-parser/tools/scraper/saveReference.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { type ItemReference } from "@/database/packages/dnd35-from-parser/tools/types.ts";

/** The SRD's equipment pages (d20srd.org): static pages, not a book's. */
const D20SRD_URLS = {
  weapons: "https://www.d20srd.org/srd/equipment/weapons.htm",
  armor: "https://www.d20srd.org/srd/equipment/armor.htm",
  goods: "https://www.d20srd.org/srd/equipment/goodsAndServices.htm",
};

export async function scrapeAllItems(book: string) {
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
