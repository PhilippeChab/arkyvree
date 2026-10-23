import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { Mechanic } from "@/shared/relations.ts";

/** The mechanics, read and written as every ruleset entity kind's are. */
class MechanicsRepository extends RulesetEntityRepository<Mechanic> {
  protected override readonly entityType = "mechanics";
}

export default MechanicsRepository;
