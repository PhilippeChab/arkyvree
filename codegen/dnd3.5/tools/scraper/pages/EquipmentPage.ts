/** A page of the SRD's equipment on d20srd.org: its weapons', armor's or goods' tables. */

import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { normalizeWs } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import type { ArmorRow, GoodsRow, WeaponRow } from "@/codegen/dnd3.5/tools/types/items.ts";

import { Page } from "./Page.ts";

/** The goods' tables, by id: the spellcasting and services' left out, as services aren't items. */
const GOODS_TABLE_IDS = [
  "tableAdventuringGear",
  "tableSpecialSubstancesAndItems",
  "tableToolsAndSkillKits",
  "tableClothing",
  "tableFoodDrinkAndLodging",
  "tableMountsAndRelatedGear",
  "tableTransport",
];

/** A table cell's text, without its footnote markers (<sup>). */
function cellText(cell: cheerio.Cheerio<AnyNode>): string {
  const copy = cell.clone();
  copy.find("sup").remove();
  return normalizeWs(copy.text());
}

/** A page of the SRD's equipment (d20srd.org): the rows of its armor, goods or weapons table. */
export class EquipmentPage extends Page {
  /** The armor and shields of the page's table, each under the category its header row names. */
  armor(): ArmorRow[] {
    const table = this.$("table#tableArmorandShields");
    if (!table.length) return [];

    const items: ArmorRow[] = [];
    let currentCategory = "";
    table.find("tbody tr").each((_, row) => {
      const $row = this.$(row);
      // A category's header row: <tr class="h2">
      if ($row.hasClass("h2")) {
        currentCategory = normalizeWs($row.find("th").text());
        return;
      }
      // Another header row
      if ($row.find("th").length > 0) return;

      const cells = $row.find("td");
      if (cells.length < 9) return;
      const text = (i: number) => cellText(this.$(cells[i]));
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

  /** The goods of the page's tables, each with its table's id; a good without a weight weighs "—". */
  goods(): GoodsRow[] {
    const items: GoodsRow[] = [];
    for (const tableId of GOODS_TABLE_IDS) {
      const table = this.$(`table#${tableId}`);
      if (!table.length) continue;

      table.find("tbody tr, tr").each((_, row) => {
        const $row = this.$(row);
        if ($row.find("th").length > 0) return;
        const cells = $row.find("td");
        if (cells.length < 2) return;

        const text = (i: number) => cellText(this.$(cells[i]));
        const name = text(0);
        const cost = text(1);
        const weight = cells.length >= 3 ? text(2) : "—";
        if (!name) return;

        items.push({ name, tableId, cost, weight });
      });
    }
    return items;
  }

  /** The weapons of the page's table, each under the proficiency and the category its header rows name. */
  weapons(): WeaponRow[] {
    const table = this.$("table#tableWeapons");
    if (!table.length) return [];

    const weapons: WeaponRow[] = [];
    let currentProficiency = "";
    let currentCategory = "";
    table.find("tbody tr").each((_, row) => {
      const $row = this.$(row);
      // A proficiency's header row: <th id="simpleWeapons|martialWeapons|exoticWeapons">
      const proficiencyTh = $row.find("th[id]");
      if (proficiencyTh.length) {
        const id = proficiencyTh.attr("id") ?? "";
        if (id === "simpleWeapons") currentProficiency = "Simple";
        else if (id === "martialWeapons") currentProficiency = "Martial";
        else if (id === "exoticWeapons") currentProficiency = "Exotic";
        return;
      }
      // A category's header row: <tr class="h2"><th colspan="8">Category</th></tr>
      if ($row.hasClass("h2")) {
        currentCategory = normalizeWs($row.find("th").text());
        return;
      }

      const cells = $row.find("td");
      if (cells.length < 8) return;
      const text = (i: number) => cellText(this.$(cells[i]));
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
}
