import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import { classSkills } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import type { BackgroundSeed } from "@/content/dnd5.2/builders/backgrounds/types.ts";
import type { ClassSeed } from "@/content/dnd5.2/builders/classes/types.ts";
import { expertise, skillProficiency } from "@/content/dnd5.2/builders/feats/proficiencies.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { Dnd52ItemSeed } from "@/content/dnd5.2/builders/items/types.ts";
import type { SpeciesSeed } from "@/content/dnd5.2/builders/species/types.ts";
import type { LeveledSpellSeed } from "@/content/dnd5.2/builders/spells/types.ts";
import { stripSeparators } from "@/shared/text.ts";
import { EXPERTISE_POOL, FEAT_CATEGORY_POOLS, SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5.2/feats.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd5.2/skills.ts";

/** What a book's seeds are, of every kind that names an aptitude or a feat, as the generator writes them. */
export interface BookContents {
  backgrounds: BackgroundSeed[];
  classes: ClassSeed[];
  /** Its feats, its classes' and its standalone ones, and the core rules' hand-written ones beside them. */
  feats: FeatSeed[];
  items: Dnd52ItemSeed[];
  species: SpeciesSeed[];
  spells: LeveledSpellSeed[];
}

/** A target's aptitude, by its slug (`aptitudes.<slug>.allowed`, a spell level's `aptitudes.<slug>.<level>.allowed`). */
const APTITUDE_TARGET = /^aptitudes\.([^.]+)\./;

/** A target's feat, by its slug (`feats.<slug>.possessed`). */
const FEAT_TARGET = /^feats\.([^.]+)\.possessed$/;

/** Every target a requirement checks, its groups' children's among them. */
function requirementTargets(requirements: readonly RequirementEntry[] = []): string[] {
  return requirements.flatMap((entry) =>
    "chainingOperator" in entry ? requirementTargets(entry.children) : [entry.target],
  );
}

/**
 * A book's aptitudes (`names`) and the checks its seeds' names take (`check`): every pool its seeds name (its feats'
 * and its spells', its classes' feature pools, spell lists and skill picks), the feat categories' and the pools the
 * engine lists its skills' feats in; every aptitude a target names by its slug (a modifier's room) the slug of one of
 * them, every feat a target names (a grant, a requirement) one of its feats or of the engine's (a skill's Skill
 * Proficiency and Expertise), and every feat's name its own. A check that fails refuses the book.
 */
export class BookAptitudes {
  constructor(private readonly contents: BookContents) {}

  /** The feats a target may name: the book's and the core rules', and each skill's the engine makes. */
  private featSlugs(): Set<string> {
    const engine = SKILL_NAMES.flatMap((skill) => [skillProficiency(skill), expertise(skill)]);
    return new Set([...this.contents.feats.map(({ name }) => name), ...engine].map(stripSeparators));
  }

  /** The aptitudes its seeds name. */
  private named(): Set<string> {
    const { classes, feats, spells } = this.contents;
    return new Set([
      ...Object.values(FEAT_CATEGORY_POOLS),
      SKILL_PROFICIENCIES_POOL,
      EXPERTISE_POOL,
      ...feats.flatMap(({ aptitudes }) => aptitudes),
      ...spells.flatMap(({ aptitudes }) => aptitudes),
      ...classes.flatMap(({ featurePool, name, spells: list }) => [
        featurePool,
        classSkills(name),
        ...(list ? [list.list] : []),
      ]),
    ]);
  }

  /** Every target its seeds' modifiers and requirements name. */
  private targets(): string[] {
    const { backgrounds, classes, feats, items, species } = this.contents;
    const modified: { modifiers?: readonly ModifierSeed[]; requirements?: readonly RequirementEntry[] }[] = [
      ...backgrounds,
      ...classes,
      ...feats,
      ...items,
      ...species,
    ];
    return modified.flatMap(({ modifiers = [], requirements }) => [
      ...modifiers.flatMap((modifier) => [modifier.target, ...requirementTargets(modifier.requirements)]),
      ...requirementTargets(requirements),
    ]);
  }

  /**
   * Refuses the book when a target names an aptitude or a feat it has none of, a class links a feat it has none of, or
   * two of its feats share a name.
   */
  check(): void {
    const names = this.contents.feats.map(({ name }) => name);
    const twice = names.filter((name, index) => names.indexOf(name) !== index);
    if (twice.length > 0) throw new Error(`Two feats are named ${[...new Set(twice)].join(", ")}`);
    const aptitudes = new Set([...this.named()].map(stripSeparators));
    const feats = this.featSlugs();
    for (const target of this.targets()) {
      const aptitude = APTITUDE_TARGET.exec(target)?.[1];
      if (aptitude && !aptitudes.has(aptitude)) throw new Error(`${target}: no aptitude of the book is "${aptitude}"`);
      const feat = FEAT_TARGET.exec(target)?.[1];
      if (feat && !feats.has(feat)) throw new Error(`${target}: no feat of the book is "${feat}"`);
    }
    for (const { links, name, features } of this.contents.classes) {
      const proficiencies = [links?.startingProficiencies ?? [], links?.multiclassProficiencies ?? []].flat();
      const linked = [...proficiencies, ...features.map(([, feature]) => feature)];
      const missing = linked.filter((feat) => !feats.has(stripSeparators(feat)));
      if (missing.length > 0) throw new Error(`${name} names feats the book has none of: ${missing.join(", ")}`);
    }
  }

  /** Its aptitudes, sorted. */
  names(): string[] {
    return [...this.named()].sort();
  }
}
