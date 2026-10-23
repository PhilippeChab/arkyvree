import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { RulesetSave } from "@/shared/relations.ts";

/** The saves, read and written as every ruleset entity kind's are. */
class SavesRepository extends RulesetEntityRepository<RulesetSave> {
  protected override readonly entityType = "saves";
}

export default SavesRepository;
