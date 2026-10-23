import RulesetEntityRepository from "@/server/repositories/RulesetEntityRepository.ts";
import type { RulesetAbility } from "@/shared/relations.ts";

/** The abilities: immutable, read and created (by a ruleset's seed), never edited or deleted. */
class AbilitiesRepository extends RulesetEntityRepository<RulesetAbility> {
  protected override readonly entityType = "abilities";

  override async delete(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be deleted");
  }

  override async update(): Promise<never> {
    throw new Error("Abilities are immutable and cannot be edited");
  }
}

export default AbilitiesRepository;
