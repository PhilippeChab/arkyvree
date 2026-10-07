import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { type BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { CodeFile } from "@/database/packages/dnd35-from-parser/tools/generator/code/CodeFile.ts";
import { buildBookDomainSeeds } from "@/database/packages/dnd35-from-parser/tools/seeds/domains.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's cleric domains. */
export function GeneratesDomains<B extends Constructor<BaseGenerator>>(Base: B) {
  abstract class GeneratingDomains extends Base {
    /** Writes a book's domain pool feats (domainFeats.ts): one list, the feats grouped by their pool's aptitude. */
    private writeDomainFeatPool(feats: FeatSeed[], book: string) {
      const file = new CodeFile();
      file.list(
        "DOMAIN_POOL_FEATS",
        "FeatSeed",
        [...Map.groupBy(feats, (feat) => feat.aptitudes[0]).values()].flat().flatMap((feat) => file.feat(feat)),
      );
      this.write(join(this.dir, book, "feats", "domainFeats.ts"), file.code());
    }

    /** A book's domains file and its domains' feat pools: those of its domains reference, none for a book without one. */
    writeDomains(book: string) {
      const { seeds, poolFeats } = buildBookDomainSeeds(book);
      this.log(`Built ${seeds.length} domain seeds`);

      const outDir = join(this.dir, book, "domains");
      const dataPath = join(outDir, "data.ts");

      // A book without domains has an empty list of them
      const file = new CodeFile();
      file.list(
        "ALL_DOMAINS",
        "DomainSeed",
        seeds.flatMap((domain) => file.domain(domain)),
      );
      this.write(dataPath, file.code());

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
