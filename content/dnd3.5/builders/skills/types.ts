/** A skill: its name, what it does, its key ability, and whether armor weighs on it or it can be used untrained. */
export type SkillSeed = {
  ability: string;
  checkPenaltyMultiplier?: number;
  description: string;
  impactedByWeight?: boolean;
  name: string;
  usableWithoutTraining?: boolean;
};
