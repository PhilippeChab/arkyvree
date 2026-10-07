import type { ClassSeeds } from "@/codegen/dnd3.5/tools/seeds/classes/ClassSeeds.ts";

import BookLayout from "./BookLayout.ts";
import { CodeFile } from "./code/CodeFile.ts";

/** A generated file: its path in the book's folder, its code, and what's left to review in it, which opens it. */
type GeneratedFile = { code: string; notes: string[]; path: string };

/**
 * A class's generated files, composed once for the generator, which writes them, and `parser:validate`, which checks
 * what an override changes in them: the class's file, its seed opened by what's left to review in it, and its feats'.
 */
export class ClassFiles {
  constructor(readonly seeds: ClassSeeds) {}

  /** Its files, the class's first: a class the generator refuses throws, from its seed. */
  files(): GeneratedFile[] {
    const { name } = this.seeds.ref.raw;
    const classFile = new CodeFile();
    classFile.classSeed(this.seeds.seed());
    const featsFile = new CodeFile();
    const { path, list } = BookLayout.classFeatsFile(name);
    featsFile.list(
      list,
      "FeatSeed",
      this.seeds.feats().flatMap((feat) => featsFile.feat(feat)),
    );
    return [
      { path: BookLayout.classFile(name).path, code: classFile.code(), notes: this.seeds.reviewNotes() },
      { path, code: featsFile.code(), notes: [] },
    ];
  }
}
