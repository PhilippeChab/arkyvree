export const WEAPON_PROFICIENCY = "WEAPON_PROFICIENCY";
export const WEAPON_FAMILY = "WEAPON_FAMILY";
export const WEAPON_BASE_DAMAGE = "WEAPON_BASE_DAMAGE";
export const WEAPON_CRITICAL_RANGE = "WEAPON_CRITICAL_RANGE"; // 0 = 20, 1 = 19, etc.
export const WEAPON_CRITICAL_MULTIPLIER = "WEAPON_CRITICAL_MULTIPLIER";
/** How Strength applies to damage: by its slot ("Slot", when absent), "Rating" (bows) or "None" (crossbows). */
export const WEAPON_STRENGTH_DAMAGE = "WEAPON_STRENGTH_DAMAGE";
export const WEAPON_MIGHTY = "WEAPON_MIGHTY";
/** The penalty on attack rolls with it in one hand, when it takes two to load: a crossbow's (−2 light, −4 heavy). */
export const WEAPON_ONE_HANDED_PENALTY = "WEAPON_ONE_HANDED_PENALTY";
/** Too large to use in one hand without training (a bastard sword): there, only its proficiency lets it be wielded. */
export const WEAPON_ONE_HAND_TRAINING = "WEAPON_ONE_HAND_TRAINING";
/** A double weapon's other end's damage dice (a quarterstaff's 1d6): in two hands, it fights as two weapons. */
export const WEAPON_DOUBLE_DAMAGE = "WEAPON_DOUBLE_DAMAGE";
export const WEAPON_RANGE = "WEAPON_RANGE";
/** Ranged weapons (thrown or projectile, no melee) attack with Dexterity; a melee one with a range can be thrown. */
export const WEAPON_RANGED = "WEAPON_RANGED";
export const WEAPON_REACH = "WEAPON_REACH";
export const WEAPON_SIZE = "WEAPON_SIZE";
export const WEAPON_FINESSABLE = "WEAPON_FINESSABLE";
export const WEAPON_TYPE = "WEAPON_TYPE";
