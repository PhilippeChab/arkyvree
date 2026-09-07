import * as cheerio from "cheerio";

function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseWeaponsHtml(html: string): {
  name: string;
  proficiency: string;
  category: string;
  cost: string;
  dmgSmall: string;
  dmgMedium: string;
  critical: string;
  rangeIncrement: string;
  weight: string;
  damageType: string;
}[] {
  const $ = cheerio.load(html);
  const table = $("table#tableWeapons");
  if (!table.length) return [];

  const weapons: ReturnType<typeof parseWeaponsHtml> = [];
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

    // Strip <sup> footnotes from name cell before extracting text
    const nameCell = $(cells[0]).clone();
    nameCell.find("sup").remove();
    const name = normalizeWs(nameCell.text());
    if (!name || !currentProficiency) return;

    // Helper to get cell text with <sup> footnotes stripped
    const cellText = (i: number) => {
      const cell = $(cells[i]).clone();
      cell.find("sup").remove();
      return normalizeWs(cell.text());
    };

    weapons.push({
      name,
      proficiency: currentProficiency,
      category: currentCategory,
      cost: cellText(1),
      dmgSmall: cellText(2),
      dmgMedium: cellText(3),
      critical: cellText(4),
      rangeIncrement: cellText(5),
      weight: cellText(6),
      damageType: cellText(7),
    });
  });

  return weapons;
}

export function parseArmorHtml(html: string): {
  name: string;
  category: string;
  cost: string;
  acBonus: string;
  maxDexBonus: string;
  armorCheckPenalty: string;
  arcaneSpellFailure: string;
  speed30: string;
  speed20: string;
  weight: string;
}[] {
  const $ = cheerio.load(html);
  const table = $("table#tableArmorandShields");
  if (!table.length) return [];

  const items: ReturnType<typeof parseArmorHtml> = [];
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

    const cellText = (i: number) => {
      const cell = $(cells[i]).clone();
      cell.find("sup").remove();
      return normalizeWs(cell.text());
    };

    const name = cellText(0);
    if (!name || !currentCategory) return;

    items.push({
      name,
      category: currentCategory,
      cost: cellText(1),
      acBonus: cellText(2),
      maxDexBonus: cellText(3),
      armorCheckPenalty: cellText(4),
      arcaneSpellFailure: cellText(5),
      speed30: cellText(6),
      speed20: cellText(7),
      weight: cellText(8),
    });
  });

  return items;
}

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

export function parseGoodsHtml(html: string): {
  name: string;
  tableId: string;
  cost: string;
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

      const cellText = (i: number) => {
        const cell = $(cells[i]).clone();
        cell.find("sup").remove();
        return normalizeWs(cell.text());
      };

      const name = cellText(0);
      const cost = cellText(1);
      const weight = cells.length >= 3 ? cellText(2) : "—";

      if (!name) return;

      items.push({ name, tableId, cost, weight });
    });
  }

  return items;
}
