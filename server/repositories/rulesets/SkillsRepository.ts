import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { Skill } from "@/shared/relations.ts";

/** The skills, read and written as every ruleset entity kind's are. */
class SkillsRepository extends RulesetEntityRepository<Skill> {
  protected override readonly entityType = "skills";
}

export default SkillsRepository;
