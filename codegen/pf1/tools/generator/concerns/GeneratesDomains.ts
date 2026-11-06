import { type BaseBookGenerator } from "@/codegen/pf1/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/pf1/tools/generator/BookLayout.ts";
import type { DomainReference } from "@/codegen/pf1/tools/types/domains.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** Generating a book's cleric domains. */
export function GeneratesDomains<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingDomains extends Base {
    /** A domains reference's domains file (domains.ts), the spells its domains name that no spell is logged. */
    writeDomains(ref: DomainReference) {
      const domains = this.seeds.domains(ref);
      const seeds = domains.seeds();
      this.log(`Built ${seeds.length} domain seeds`);
      for (const { domain, level, name } of domains.unknownSpells())
        this.log(`  ${domain}: no spell is its level ${level} "${name}", left out`);

      const { path, list } = BookLayout.files.domains;
      this.writeList(path, list, "DomainSeed", seeds, (file, domain) => file.domain(domain));
    }
  }
  return GeneratingDomains;
}
