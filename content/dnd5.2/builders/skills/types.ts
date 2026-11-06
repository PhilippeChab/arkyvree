/** A skill as its seed gives it: its name and description, and the ability its checks add (its `keyAbility` link). */
export interface SkillSeed {
  description: string;
  links: { keyAbility: string };
  name: string;
}
