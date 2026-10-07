import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { normalizeWs } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { ArmorRow, WeaponRow } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";

const GOODS_TABLE_IDS = [
  "tableAdventuringGear",
  "tableSpecialSubstancesAndItems",
  "tableToolsAndSkillKits",
  "tableClothing",
  "tableFoodDrinkAndLodging",
  "tableMountsAndRelatedGear",
  "tableTransport",
  // Skip "tableSpellcastingAndServices" — services, not physical items
];

/** A table cell's text, without its footnote markers (<sup>). */
function cellText(cell: cheerio.Cheerio<AnyNode>): string {
  const copy = cell.clone();
  copy.find("sup").remove();
  return normalizeWs(copy.text());
}

export function parseArmorHtml(html: string): ArmorRow[] {
  const $ = cheerio.load(html);
  const table = $("table#tableArmorandShields");
  if (!table.length) return [];

  const items: ArmorRow[] = [];
  let currentCategory = "";

  table.find("tbody tr").each((_, row) => {
    const $row = $(row);

    // Category header rows: <tr class="h2">
    if ($row.hasClass("h2")) {
      currentCategory = normalizeWs($row.find("th").text());
      return;
    }

    // Skip non-data rows (header rows with <th>)
    if ($row.find("th").length > 0) return;

    const cells = $row.find("td");
    if (cells.length < 9) return;

    const text = (i: number) => cellText($(cells[i]));

    const name = text(0);
    if (!name || !currentCategory) return;

    items.push({
      name,
      category: currentCategory,
      cost: text(1),
      acBonus: text(2),
      maxDexBonus: text(3),
      armorCheckPenalty: text(4),
      arcaneSpellFailure: text(5),
      speed30: text(6),
      speed20: text(7),
      weight: text(8),
    });
  });

  return items;
}

export function parseGoodsHtml(html: string): {
  cost: string;
  name: string;
  tableId: string;
  weight: string;
}[] {
  const $ = cheerio.load(html);
  const items: ReturnType<typeof parseGoodsHtml> = [];

  for (const tableId of GOODS_TABLE_IDS) {
    const table = $(`table#${tableId}`);
    if (!table.length) continue;

    table.find("tbody tr, tr").each((_, row) => {
      const $row = $(row);
      // Skip header rows
      if ($row.find("th").length > 0) return;

      const cells = $row.find("td");
      if (cells.length < 2) return;

      const text = (i: number) => cellText($(cells[i]));

      const name = text(0);
      const cost = text(1);
      const weight = cells.length >= 3 ? text(2) : "—";

      if (!name) return;

      items.push({ name, tableId, cost, weight });
    });
  }

  return items;
}

export function parseWeaponsHtml(html: string): WeaponRow[] {
  const $ = cheerio.load(html);
  const table = $("table#tableWeapons");
  if (!table.length) return [];

  const weapons: WeaponRow[] = [];
  let currentProficiency = "";
  let currentCategory = "";

  table.find("tbody tr").each((_, row) => {
    const $row = $(row);

    // Proficiency header rows: contain <th id="simpleWeapons|martialWeapons|exoticWeapons">
    const proficiencyTh = $row.find("th[id]");
    if (proficiencyTh.length) {
      const id = proficiencyTh.attr("id") ?? "";
      if (id === "simpleWeapons") currentProficiency = "Simple";
      else if (id === "martialWeapons") currentProficiency = "Martial";
      else if (id === "exoticWeapons") currentProficiency = "Exotic";
      return;
    }

    // Category header rows: <tr class="h2"><th colspan="8">Category</th></tr>
    if ($row.hasClass("h2")) {
      currentCategory = normalizeWs($row.find("th").text());
      return;
    }

    // Data rows: 8 <td> cells
    const cells = $row.find("td");
    if (cells.length < 8) return;

    const text = (i: number) => cellText($(cells[i]));
    const name = text(0);
    if (!name || !currentProficiency) return;

    weapons.push({
      name,
      proficiency: currentProficiency,
      category: currentCategory,
      cost: text(1),
      dmgSmall: text(2),
      dmgMedium: text(3),
      critical: text(4),
      rangeIncrement: text(5),
      weight: text(6),
      damageType: text(7),
    });
  });

  return weapons;
}
