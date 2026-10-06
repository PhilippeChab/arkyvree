import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/buildSeeds/domains.ts";
import {
  type BaseGenerator,
  GENERATED_HEADER,
} from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { stringifyModifier } from "@/database/packages/dnd35-from-parser/tools/generator/code/customization.ts";
import { listField, quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's cleric domains. */
export function GeneratesDomains<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingDomains extends Base {
    /** A book's domains file (data.ts). */
    private domainsCode(seeds: DomainDefinition[]): string {
      const lines: string[] = [];
      lines.push(`export const ALL_DOMAINS: DomainDefinition[] = [`);
      for (const d of seeds) {
        lines.push(`  {`);
        lines.push(`    name: ${quote(d.name)},`);
        lines.push(`    description: ${quote(d.description)},`);
        lines.push(...listField("modifiers", (d.modifiers ?? []).map(stringifyModifier), "    "));
        lines.push(`    spells: [`);
        for (const s of d.spells) {
          lines.push(`      { name: ${quote(s.name)}, level: ${s.level} },`);
        }
        lines.push(`    ],`);
        lines.push(`  },`);
      }
      lines.push(`];`);
      lines.push(``);
      return [
        `import type { DomainDefinition } from "@/database/packages/dnd35/content/domains/types.ts";`,
        ``,
        ...lines,
      ].join("\n");
    }

    /** Writes a book's domain pool feats (domainFeats.ts): one list, the feats grouped by their pool's aptitude. */
    private writeDomainFeatPool(feats: FeatSeed[], book: string) {
      const file = new CodeFile();
      file.lines.push(
        `export const DOMAIN_POOL_FEATS: FeatSeed[] = [`,
        ...[...Map.groupBy(feats, (feat) => feat.aptitudes[0]).values()].flat().flatMap((feat) => file.feat(feat)),
        `];`,
        ``,
      );
      this.write(
        join(this.dir, book, "feats", "domainFeats.ts"),
        file.code([
          ...GENERATED_HEADER,
          `import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";`,
        ]),
      );
    }

    /** A book's domains file and its domains' feat pools: those of its domains reference, none for a book without one. */
    writeDomains(book: string) {
      const { seeds, poolFeats } = buildBookDomainSeeds(book);
      this.log(`Built ${seeds.length} domain seeds`);

      const outDir = join(this.dir, book, "domains");
      const dataPath = join(outDir, "data.ts");

      if (seeds.length === 0) {
        // No domains for this book — generate empty array
        this.write(
          dataPath,
          [
            ...GENERATED_HEADER,
            `import type { DomainDefinition } from "@/database/packages/dnd35/content/domains/types.ts";`,
            ``,
            `export const ALL_DOMAINS: DomainDefinition[] = [];`,
            ``,
          ].join("\n"),
        );
      } else {
        this.write(dataPath, this.domainsCode(seeds));
      }

      // Generate feat pool feats (e.g. War Domain Weapon) — only for domains in this book
      const domainFeatsPath = join(this.dir, book, "feats", "domainFeats.ts");
      if (poolFeats.length > 0) {
        this.writeDomainFeatPool(poolFeats, book);
      } else if (existsSync(domainFeatsPath)) {
        unlinkSync(domainFeatsPath);
        this.log(`Removed: ${domainFeatsPath}`);
      }
    }
  }
  return GeneratingDomains;
}
