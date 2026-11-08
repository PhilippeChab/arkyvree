import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { ReferenceByType, ReferenceType } from "@/codegen/dnd5.2/tools/types/reference.ts";

import { BackgroundSeeds } from "./BackgroundSeeds.ts";
import type { ToolPicks } from "./classes/ClassProficiencies.ts";
import { ClassSeeds } from "./classes/ClassSeeds.ts";
import { FeatSeeds } from "./FeatSeeds.ts";
import { ItemSeeds } from "./ItemSeeds.ts";
import { MagicItemSeeds } from "./MagicItemSeeds.ts";
import { Memos } from "./Memos.ts";
import { SpeciesSeeds } from "./SpeciesSeeds.ts";
import { SpellSeeds } from "./SpellSeeds.ts";

/**
 * A book's seeds: the book, its references, and each kind's seeds of its reference (`classes`, `feats`, `spells`…),
 * each built once (`memos`), as the references they're built from are loaded once; and what crosses kinds: its tools
 * (its items'), which its classes' and backgrounds' proficiencies name, the tools their picks are among, and the feats
 * a class feature is, which a feat's prerequisite names. A book without a reference of a kind has no seeds of it.
 */
export class BookSeeds {
  constructor(readonly book: string) {}

  /** What's built of the book's references, once. */
  private readonly memos = new Memos();

  /** Its backgrounds' seeds, their proficiencies among its tools. */
  backgrounds(): BackgroundSeeds | undefined {
    return this.memos.of("backgrounds", () => {
      const ref = this.reference("background");
      return ref && new BackgroundSeeds(ref, this.tools());
    });
  }

  /** Its classes' seeds, a class reference each, by its file's name, their proficiencies among its tools. */
  classes(): ClassSeeds[] {
    return this.memos.of("classes", () => {
      const dir = join(References.dir, this.book, "classes");
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => new ClassSeeds(References.load(join(dir, file), "class"), this.tools()));
    });
  }

  /** Its standalone feats' seeds, a prerequisite's feature the feats its classes' features of that name are. */
  feats(): FeatSeeds | undefined {
    return this.memos.of("feats", () => {
      const ref = this.reference("feat");
      return ref && new FeatSeeds(ref, (feature) => this.featureFeats(feature));
    });
  }

  /** The feats its classes' features named `feature` are ("Fighting Style (Fighter)"…), which a prerequisite names. */
  featureFeats(feature: string): string[] {
    return this.classes().flatMap((seeds) => seeds.featureFeat(feature) ?? []);
  }

  /** Its mundane items' seeds: its weapons, armor, Shield, gear and tools. */
  items(): ItemSeeds | undefined {
    return this.memos.of("items", () => {
      const ref = this.reference("item");
      return ref && new ItemSeeds(ref);
    });
  }

  /** Its magic items' seeds. */
  magicItems(): MagicItemSeeds | undefined {
    return this.memos.of("magicItems", () => {
      const ref = this.reference("magicItem");
      return ref && new MagicItemSeeds(ref);
    });
  }

  /** The book's reference of `type`, loaded once: none when the book has none. */
  reference<T extends Exclude<ReferenceType, "class">>(type: T): ReferenceByType[T] | undefined {
    const path = References.path(this.book, type);
    return existsSync(path) ? References.load(path, type) : undefined;
  }

  /** Its species' seeds. */
  species(): SpeciesSeeds | undefined {
    return this.memos.of("species", () => {
      const ref = this.reference("species");
      return ref && new SpeciesSeeds(ref);
    });
  }

  /** Its spells' seeds. */
  spells(): SpellSeeds | undefined {
    return this.memos.of("spells", () => {
      const ref = this.reference("spell");
      return ref && new SpellSeeds(ref);
    });
  }

  /** The pools of tools its classes and backgrounds pick a proficiency among. */
  toolPicks(): ToolPicks[] {
    return [...this.classes().flatMap((seeds) => seeds.toolPicks()), ...(this.backgrounds()?.toolPicks() ?? [])];
  }

  /** Its tools' names, its items' tools: none without items. */
  tools(): string[] {
    return this.items()?.tools() ?? [];
  }
}
