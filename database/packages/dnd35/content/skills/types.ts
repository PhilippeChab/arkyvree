/** A skill: its name, what it does, its key ability, and whether armor weighs on it or it can be used untrained. */
export type SkillSeed = {
  name: string;
  description: string;
  ability: string;
  impactedByWeight?: boolean;
  checkPenaltyMultiplier?: number;
  usableWithoutTraining?: boolean;
};
