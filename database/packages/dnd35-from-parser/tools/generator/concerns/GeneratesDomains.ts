import { type BaseBookGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/database/packages/dnd35-from-parser/tools/generator/BookLayout.ts";
import type { Constructor } from "@/server/mixins.ts";

/** Generating a book's cleric domains. */
export function GeneratesDomains<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingDomains extends Base {
    /**
     * The book's domains file and its domains' feat pools: those of its domains reference, none for a book without one.
     */
    writeDomains() {
      const ref = this.seeds.reference("domain");
      const domainSeeds = ref && this.seeds.domains(ref);
      const seeds = domainSeeds ? domainSeeds.seeds() : [];
      const poolFeats = domainSeeds ? domainSeeds.poolFeats() : [];
      this.log(`Built ${seeds.length} domain seeds`);

      // A book without domains has an empty list of them
      const { domains, domainFeats } = BookLayout.files;
      this.writeList(domains.path, domains.list, "DomainSeed", seeds, (file, domain) => file.domain(domain));

      // Its domains' feat pools' feats (e.g. War Domain Weapon), grouped by their pool's aptitude
      if (poolFeats.length > 0) {
        const grouped = [...Map.groupBy(poolFeats, (feat) => feat.aptitudes[0]).values()].flat();
        this.writeList(domainFeats.path, domainFeats.list, "FeatSeed", grouped, (file, feat) => file.feat(feat));
      }
    }
  }
  return GeneratingDomains;
}
