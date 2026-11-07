import { readChoiceOptions, readSkill } from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import { normalizeText } from "@/codegen/dnd5.2/tools/detect/text.ts";
import { readDescription, SPECIES_DESCRIPTIONS } from "@/codegen/dnd5.2/tools/terms/descriptions.ts";
import { TRAIT_MODIFIERS } from "@/codegen/dnd5.2/tools/terms/species.ts";
import type {
  SpeciesEntry,
  SpeciesReference,
  SubspeciesEntry,
  TraitEntry,
} from "@/codegen/dnd5.2/tools/types/species.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { speciesLineage, speciesTraits } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";
import { grantFeat } from "@/content/dnd5.2/builders/feats/possession.ts";
import { skillProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { SpeciesSeed } from "@/content/dnd5.2/builders/species/types.ts";
import { SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_GENERATED, FEAT_SELECTABLE, SPECIES_SIZE, SPECIES_SPEED } from "@/vocabulary/dnd5.2/fields/index.ts";
import { SIZE_OPTIONS, type SizeType } from "@/vocabulary/dnd5.2/sizes.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5.2/skills.ts";

import { Memos } from "./Memos.ts";

/** A trait's text, as a lineage's feat lists it: under its name, unless it's the lineage's own ("Giant Ancestry: …"). */
function traitText({ description, name }: TraitEntry, lineage: string): string {
  return name === lineage ? description : `${name}. ${description}`;
}

/**
 * A species reference's seeds: each species (`seeds`, its size and speed, its traits granted as feats, a room in its
 * lineage's pool when it has subspecies) and the feats its traits and lineages are (`feats`). A trait is a feat of its
 * name, shared by the species that print it alike (Darkvision (60 ft.)), its modifiers the terms' (`TRAIT_MODIFIERS`),
 * its choice of skills a pick: any skill's a room in the pool of any skill's proficiency, a few skills' a pool of the
 * trait's name whose feats each grant one ("Keen Senses: Perception"). A subspecies is a feat of its species' lineage
 * pool ("Elven Lineage: Drow"), its traits its text, its speed past its species' a bonus.
 */
export class SpeciesSeeds {
  constructor(readonly ref: SpeciesReference) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** A trait's choice of skills: a room in its pool, and the feats of that pool, when it's a few skills'. */
  private choice(trait: TraitEntry): { feats: FeatSeed[]; modifiers: ModifierSeed[] } {
    if (!trait.proficiency_choices) return { feats: [], modifiers: [] };
    const names = readChoiceOptions(trait.proficiency_choices);
    const skills = names.flatMap((name) => readSkill(name) ?? []);
    if (skills.length !== names.length) throw new Error(`${trait.name}: a choice of proficiencies other than skills`);
    const picks = trait.proficiency_choices.choose;
    if (SKILL_NAMES.every((skill) => skills.includes(skill)))
      return { feats: [], modifiers: [poolRoom(SKILL_PROFICIENCIES_POOL, picks)] };
    const feats = skills.map((skill) => ({
      name: `${trait.name}: ${skill}`,
      description: `You add your Proficiency Bonus to ${skill} checks (${trait.name}).`,
      aptitudes: [trait.name],
      modifiers: [grantFeat(skillProficiency(skill))],
      fields: { [FEAT_GENERATED]: true },
    }));
    return { feats, modifiers: [poolRoom(trait.name, picks)] };
  }

  /** Each species' entry, as its override corrects it (a human's sizes). */
  private entries(): SpeciesEntry[] {
    return this.ref.raw.map((entry) => ({ ...entry, ...this.ref.overrides?.[entry.name] }));
  }

  /** A subspecies' feat, in its species' lineage pool: its traits' text, its speed past its species' a bonus. */
  private lineageFeat(species: SpeciesEntry, { name, traits }: SubspeciesEntry): FeatSeed {
    const speed = Math.max(0, ...traits.map((trait) => (trait.speed ?? species.speed) - species.speed));
    return {
      name,
      description: normalizeText(traits.map((trait) => traitText(trait, name)).join("\n")),
      aptitudes: [speciesLineage(species.name)],
      ...(speed > 0 ? { modifiers: [bonus("combat.speed.misc", speed)] } : {}),
    };
  }

  /** A species' sizes: those its player chooses between, or its one. */
  private sizes({ name, size, size_options }: SpeciesEntry): SizeType[] {
    const options = (size_options?.from.options ?? []).map((option) =>
      option && typeof option === "object" && "size" in option ? String(option.size) : "",
    );
    const sizes = (options.length > 0 ? options : [size ?? ""]).map((given) =>
      SIZE_OPTIONS.find((known) => known === given),
    );
    if (sizes.some((known) => known === undefined)) throw new Error(`${name}: a size of none the vocabulary has`);
    return sizes.filter((known) => known !== undefined);
  }

  /** A trait's feats: its own, in its species' traits pool, then its choice's pool's feats. */
  private traitFeats(species: string, trait: TraitEntry): FeatSeed[] {
    const choice = this.choice(trait);
    const modifiers = [...(TRAIT_MODIFIERS[trait.name] ?? []), ...choice.modifiers];
    const feat: FeatSeed = {
      name: trait.name,
      description: normalizeText(trait.description),
      aptitudes: [speciesTraits(species)],
      ...(modifiers.length > 0 ? { modifiers } : {}),
      fields: { [FEAT_SELECTABLE]: false },
    };
    return [feat, ...choice.feats];
  }

  /**
   * The feats its species' traits and lineages are: a trait printed alike by several species once, in each one's
   * traits pool; one printed otherwise by two refuses the book.
   */
  feats(): FeatSeed[] {
    return this.memos.of("feats", () => {
      const byName = new Map<string, FeatSeed>();
      for (const species of this.entries()) {
        const traits = species.traits.flatMap((trait) => this.traitFeats(species.name, trait));
        for (const feat of [...traits, ...species.subspecies.map((sub) => this.lineageFeat(species, sub))]) {
          const known = byName.get(feat.name);
          if (known && known.description !== feat.description) throw new Error(`Two traits are "${feat.name}"`);
          byName.set(
            feat.name,
            known ? { ...known, aptitudes: [...new Set([...known.aptitudes, ...feat.aptitudes])] } : feat,
          );
        }
      }
      return [...byName.values()];
    });
  }

  /**
   * Its species' seeds: each one's size (Medium of those its player chooses between) and speed, and its modifiers, its
   * traits' feats granted and a room in its lineage's pool, when it has subspecies.
   */
  seeds(): SpeciesSeed[] {
    return this.entries().map((entry) => {
      const sizes = this.sizes(entry);
      const size = sizes.includes("Medium") ? "Medium" : sizes[0];
      const chosen = sizes.length > 1 ? ` ${sizes.join(" or ")}, chosen when the character is made.` : "";
      const traits = entry.traits.map(({ name }) => name);
      return {
        name: entry.name,
        description: `${readDescription(SPECIES_DESCRIPTIONS, entry.name, "species")}${chosen}`,
        fields: { [SPECIES_SIZE]: size, [SPECIES_SPEED]: entry.speed },
        modifiers: [
          ...traits.map((trait) => grantFeat(trait)),
          ...(entry.subspecies.length > 0 ? [poolRoom(speciesLineage(entry.name), 1)] : []),
        ],
      };
    });
  }
}
