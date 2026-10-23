import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { Language } from "@/shared/relations.ts";

/** The languages, read and written as every ruleset entity kind's are. */
class LanguagesRepository extends RulesetEntityRepository<Language> {
  protected override readonly entityType = "languages";
}

export default LanguagesRepository;
