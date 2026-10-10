import type { BaseClassSeeds } from "@/codegen/dnd3.5/tools/seeds/classes/BaseClassSeeds.ts";
import { bonus, setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { FeatSeed } from "@/content/core/builders/feats/types.ts";
import { classSpells, domainSpells } from "@/content/dnd3.5/builders/aptitudes/names.ts";
import type { ClassSeed } from "@/content/dnd3.5/builders/classes/types.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * A class's spellcasting: its bonus spells' ability and caster type, its spells, the feats advancing and choosing them.
 */
export function Spellcasting<B extends Constructor<BaseClassSeeds>>(Base: B) {
  abstract class WithSpellcasting extends Base {
    /** The class's spellcasting: its bonus spells' ability and its caster type, which one without the other refuses. */
    protected casting(): Pick<ClassSeed, "bonusSpellAbility" | "casterType"> {
      const { bonusSpellAbility, casterType } = this.ref.mapping;
      if (bonusSpellAbility && !casterType)
        throw new Error(`${this.ref.raw.name}: has bonusSpellAbility ("${bonusSpellAbility}") but no casterType`);

      if (casterType && !bonusSpellAbility)
        throw new Error(`${this.ref.raw.name}: has casterType ("${casterType}") but no bonusSpellAbility`);

      return { ...(bonusSpellAbility ? { bonusSpellAbility } : {}), ...(casterType ? { casterType } : {}) };
    }

    /**
     * The feats a class's domain pool offers (`spells.domainPool`, a divine crusader's): one per domain her book and
     * the core rules have, each joining that domain's list to hers. The domain gives her its spells, not its granted
     * power.
     */
    protected domainPickFeats(): FeatSeed[] {
      const pool = this.ref.mapping.spells?.domainPool;
      if (!pool) return [];
      return this.book
        .pickableDomains()
        .map(({ name }) => ({
          name: `${name} Domain (${this.ref.raw.name})`,
          description: `The ${name} domain's spells, one at each spell level, are her spell list. She doesn't gain the domain's granted power.`,
          selectable: true,
          aptitudes: [pool],
          modifiers: [setFlag(`aptitudes.${stripSeparators(domainSpells(name))}.joinsclasslist`)],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    /** A spellcasting class's own list gets a feat other classes advance it with: none for any other class. */
    protected spellcastingAdvanceFeats(): FeatSeed[] {
      const { detected, mapping, raw } = this.ref;
      const { casterType, spells } = mapping;
      // Spells of its own (not `noSpells`), not an advancement of another class's
      if (!spells || !casterType || detected.casterLevelAdvancement) return [];
      return [
        {
          name: `Advance ${raw.name} Spellcasting`,
          description: `Your effective ${this.classSlug} caster level increases by 1, granting additional spell slots and spells per day as if you had gained a level in ${this.classSlug}.`,
          stackable: true,
          aptitudes: [
            casterType === "Divine" ? "Bonus Divine Caster Level" : "Bonus Arcane Caster Level",
            "Bonus Caster Level",
          ],
          modifiers: [bonus(`classes.${this.classSlug}.bonuscasterlevel`, 1)],
          requirements: this.classLevelRequirement(1),
        },
      ];
    }

    /**
     * The class's spells: its slots per day and spells known by level, and the lists it casts from. None without slots.
     */
    protected spells(): ClassSeed["spells"] {
      const { spells } = this.ref.mapping;
      if (!spells) return undefined;
      return {
        slug: spells.slug,
        perDay: spells.perDay,
        ...(spells.known ? { known: spells.known } : {}),
        ...(spells.knowAll && !spells.known ? { knowAll: true } : {}),
        ...(spells.noCantrips ? { noCantrips: true } : {}),
        ...(spells.lists
          ? {
              lists: spells.lists.map((list) => ({
                slug: stripSeparators(list.name),
                requirements: list.requirements,
              })),
            }
          : {}),
      };
    }

    /** The spell lists a class's slots go to (`spells.lists`), or its own, "<Class> Spells": none for a class without slots. */
    spellLists(): string[] {
      const { spells } = this.ref.mapping;
      if (!spells) return [];
      return spells.lists?.map((list) => list.name) ?? [classSpells(this.ref.raw.name)];
    }
  }
  return WithSpellcasting;
}
