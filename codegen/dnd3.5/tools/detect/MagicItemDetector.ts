import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import { normalizeDescription } from "@/codegen/dnd3.5/tools/text/scrapedText.ts";
import type { MagicItemCategory, MagicItemReference } from "@/codegen/dnd3.5/tools/types/magicItems.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier, Property } from "@/content/core/builders/customization/types.ts";
import { MAGIC_AURA, MAGIC_CASTER_LEVEL } from "@/vocabulary/dnd3.5/properties/index.ts";

import { BaseDetector, type Resolved } from "./BaseDetector.ts";
import { MagicItemMetadata } from "./readers/items/MagicItemMetadata.ts";
import { MagicItemText } from "./readers/items/MagicItemText.ts";
import { MagicItemModifiers } from "./readers/modifiers/MagicItemModifiers.ts";

/** The specific armor and shields, whose text gives what they change of their base's. */
const ARMOR_CATEGORIES = new Set<MagicItemCategory>(["specificArmor", "specificShield"]);

/** A weapon's enhancement bonus, as modifiers of the weapon holding it: its attack's and its damage's. */
function weaponEnhancementModifiers(description: string): Modifier[] {
  const enhancement = new MagicItemText(description).weaponEnhancement();
  if (!enhancement) return [];
  const bonusOf = (target: string, value: number): Modifier[] => (value ? [bonus(target, value)] : []);
  return [...bonusOf("weapon.tohit.magic", enhancement.attack), ...bonusOf("weapon.damage.magic", enhancement.damage)];
}

/**
 * A magic item reference's detector: each item's metadata, its base item and its modifiers (`detected`), and each item
 * as the seeds make it, its overrides applied (`mapping`): a specific armor or shield takes the stats its text gives
 * (`MagicItemText.armorStats`) and its enhancement bonus to AC, a specific weapon made from a base one its enhancement
 * bonus to attack and damage (`MagicItemText.weaponEnhancement`).
 */
export class MagicItemDetector extends BaseDetector<MagicItemReference> {
  constructor(stored: Pick<MagicItemReference, "_meta" | "overrides" | "raw">) {
    super(stored);
    this.overrides = sanitizeJsonValues(stored.overrides);
  }

  /**
   * Its overrides, sanitized: its mapping is made of them, its descriptions normalized after, as the seeds write them.
   */
  private readonly overrides: MagicItemReference["overrides"];

  /** Each item's detected section: its metadata, its base item, its modifiers, the invalid paths and the unread text. */
  protected override detected(): MagicItemReference["detected"] {
    const detected: MagicItemReference["detected"] = {};

    for (const entry of this.stored.raw) {
      const description = entry.description ?? "";
      const { modifiers, errors, unresolved } = new MagicItemModifiers(entry.name, description);
      const baseItem = new MagicItemText(description).baseItem(entry.name, entry.category);

      detected[entry.name] = {
        category: entry.category,
        ...new MagicItemMetadata(entry).read(),
        ...(baseItem ? { baseItem } : {}),
        ...(modifiers.length > 0 ? { modifiers } : {}),
        ...(errors.length > 0 ? { errors } : {}),
        ...(unresolved.length > 0 ? { unresolvedModifiers: unresolved } : {}),
      };
    }

    return detected;
  }

  /** Each item as the seeds make it: what was detected and what its text gives, its override over both. */
  protected override mapping(detected: MagicItemReference["detected"]): MagicItemReference["mapping"] {
    const { overrides } = this;
    const { raw } = this.stored;
    const mapping: MagicItemReference["mapping"] = {};
    for (const [name, det] of Object.entries(detected)) {
      const ovr = overrides?.[name];
      const rawEntry = raw.find((r) => r.name === name);
      const baseItem = (ovr?.baseItem !== undefined ? ovr.baseItem : det.baseItem) ?? undefined;
      const description = normalizeDescription(ovr?.description ?? rawEntry?.description ?? "");
      const stats = ARMOR_CATEGORIES.has(det.category) ? new MagicItemText(description).armorStats() : undefined;
      // The weight its override or its text gives, else the detected one when it isn't none: else its base item's
      const weight = ovr?.weight ?? stats?.weight ?? (det.weight !== "0" ? det.weight : undefined);

      const aura = ovr?.aura ?? det.aura;
      const casterLevel = ovr?.casterLevel ?? det.casterLevel;
      const properties: Property[] = [];
      if (aura) properties.push({ type: MAGIC_AURA, value: aura });
      if (casterLevel) properties.push({ type: MAGIC_CASTER_LEVEL, value: String(casterLevel) });
      properties.push(...(stats?.properties ?? []));
      if (ovr?.properties) properties.push(...ovr.properties);
      // Its enhancement bonus: an armor's or a shield's to its part of the AC, a weapon's to its own attack and damage
      // (not ammunition's, made from no weapon, which no hand holds)
      const enhancement: Modifier[] = stats?.enhancement
        ? [bonus(det.category === "specificArmor" ? "combat.ac.armor" : "combat.ac.shield", stats.enhancement)]
        : det.category === "specificWeapon" && baseItem
          ? weaponEnhancementModifiers(description)
          : [];
      const slot = ovr?.slot ?? det.slot;

      mapping[name] = {
        ...(baseItem ? { baseItem } : {}),
        costGp: ovr?.costGp ?? det.costGp,
        description,
        // An override's modifiers, an empty list too, win over those detected
        modifiers: ovr?.modifiers ?? [...(det.modifiers ?? []), ...enhancement],
        properties,
        ...(ovr?.skip ? { skip: true } : {}),
        ...(slot ? { slot } : {}),
        ...(ovr?.template ? { template: true } : {}),
        ...(weight !== undefined ? { weight } : {}),
      };
    }
    return mapping;
  }

  /**
   * The reference with what's derived from it: its detected section, sanitized, and its mapping, made of its sanitized
   * sections (sanitizing a normalized description again would change it).
   */
  override resolve(): Resolved<MagicItemReference> {
    const { _meta, overrides, raw } = this.stored;
    const sanitized = sanitizeJsonValues({ overrides, detected: this.detected() });
    return { _meta, raw, ...sanitized, mapping: this.mapping(sanitized.detected) };
  }
}
