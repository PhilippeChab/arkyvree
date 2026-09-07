import { and, eq, isNull } from "drizzle-orm";
import { abilitiesInRules, propertiesInCustomization, rulesetsInRules, skillsInRules } from "@/drizzle/schema.ts";
import { SKILL_IMPACTED_BY_WEIGHT, SKILL_USABLE_WITHOUT_TRAINING } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { Db } from "@/server/database/index.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";

export default async function seed(db: Db) {
  const [ruleset] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, DND35_RULESET_NAME));
  if (!ruleset) throw new Error(`Ruleset "${DND35_RULESET_NAME}" not found`);

  const abilities = await db
    .select({ id: abilitiesInRules.id, name: abilitiesInRules.name })
    .from(abilitiesInRules)
    .where(
      and(
        eq(abilitiesInRules.rulesetId, ruleset.id),
        isNull(abilitiesInRules.deletedAt),
      ),
    );

  const a = Object.fromEntries(abilities.map((ab) => [ab.name, ab.id]));

  // Define skills with their property flags
  const skillDefs = [
    { name: "Appraise", description: "Determine the value of an item.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Balance", description: "Keep your balance while walking on a narrow or treacherous surface.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Bluff", description: "Convince others that what you are saying is true or make others believe something that isn't true.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Climb", description: "Scale vertical surfaces, from smooth city walls to rocky cliffs.", primaryAbilityId: a["Strength"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Concentration", description: "Maintain focus while casting a spell or using a spell-like ability.", primaryAbilityId: a["Constitution"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Craft", description: "Create items of a particular type, such as armor, weapons, paintings, or traps.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Decipher Script", description: "Decipher writing in an unfamiliar language or a message written in an incomplete or archaic form.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Diplomacy", description: "Change the attitudes of others with your words and actions.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Disable Device", description: "Disarm a trap, jam a lock, or rig a wagon wheel to fall off.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Disguise", description: "Change your appearance or someone else's appearance through makeup, clothing, and behavior.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Escape Artist", description: "Slip bonds and escape from grapples.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Forgery", description: "Create fake documents or modify existing ones.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Gather Information", description: "Collect information about a specific topic or person by spending time with locals.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Handle Animal", description: "Train and control domesticated animals.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Heal", description: "Treat injuries, diseases, and poisons.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Hide", description: "Conceal yourself from detection.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Intimidate", description: "Influence others through threats, hostile actions, and physical violence.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Jump", description: "Leap over pits, vault low walls, or reach a tree's lowest branches.", primaryAbilityId: a["Strength"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Knowledge (Arcana)", description: "Knowledge of magic, magical traditions, arcane symbols, and magical theory.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Architecture and Engineering)", description: "Knowledge of buildings, aqueducts, bridges, and fortifications.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Dungeoneering)", description: "Knowledge of underground complexes, unusual subterranean creatures, and dungeon hazards.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Geography)", description: "Knowledge of lands, terrain, climate, and weather.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (History)", description: "Knowledge of historical events, legendary people, ancient kingdoms, and past disputes.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Local)", description: "Knowledge of local laws, customs, and personalities.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Nature)", description: "Knowledge of natural terrain, plants and animals, seasons and cycles, and natural resources.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Nobility and Royalty)", description: "Knowledge of lineages, heraldry, personalities, and customs of nobility.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Psionics)", description: "Knowledge of psionic powers, psionic races, and the nature of psionic energy.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (Religion)", description: "Knowledge of gods, religious traditions, mythic history, ecclesiastic tradition, and holy symbols.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Knowledge (The Planes)", description: "Knowledge of the Inner Planes, the Outer Planes, the Astral Plane, and the Ethereal Plane.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Listen", description: "Hear approaching enemies, detect someone sneaking up on you, or eavesdrop on a conversation.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Move Silently", description: "Move quietly and avoid making noise.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Open Lock", description: "Open lock using lockpicks.", primaryAbilityId: a["Dexterity"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Perform", description: "Entertain an audience through acting, dancing, singing, playing instruments, or other means.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Profession", description: "Earn a living in a specific trade or career.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Ride", description: "Control a mount or vehicle in difficult situations.", primaryAbilityId: a["Dexterity"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Search", description: "Find secret doors, simple traps, hidden compartments, and other details not readily apparent.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Sense Motive", description: "Determine if someone is lying or predict someone's next action.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Sleight of Hand", description: "Perform manual feats of legerdemain, from palming a coin to picking pockets.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: false },
    { name: "Speak Language", description: "Spend skill points to learn new languages. Each point grants one additional language.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Spellcraft", description: "Identify spells and magical effects.", primaryAbilityId: a["Intelligence"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Spot", description: "Notice visual clues and details that might otherwise go unnoticed.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Survival", description: "Follow tracks, hunt wild game, guide a party through the wilderness, identify natural hazards, and predict weather.", primaryAbilityId: a["Wisdom"], impactedByWeight: false, usableWithoutTraining: true },
    { name: "Swim", description: "Navigate through water and avoid drowning.", primaryAbilityId: a["Strength"], impactedByWeight: true, usableWithoutTraining: true },
    { name: "Tumble", description: "Perform acrobatic maneuvers, including somersaults, handstands, and flips.", primaryAbilityId: a["Dexterity"], impactedByWeight: true, usableWithoutTraining: false },
    { name: "Use Magic Device", description: "Activate magical items that normally you couldn't activate.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Use Psionic Device", description: "Activate psionic items that you otherwise could not activate, such as dorjes, power stones, and psicrowns.", primaryAbilityId: a["Charisma"], impactedByWeight: false, usableWithoutTraining: false },
    { name: "Use Rope", description: "Tie knots, bind prisoners, and handle rope in many different situations.", primaryAbilityId: a["Dexterity"], impactedByWeight: false, usableWithoutTraining: true },
  ];

  // Insert skills without boolean columns
  const insertedSkills = await db.insert(skillsInRules).values(
    skillDefs.map(({ impactedByWeight: _, usableWithoutTraining: __, ...skill }) => ({
      ...skill,
      rulesetId: ruleset.id,
    })),
  ).returning();

  // Build property records for skills with true values
  const propertyRecords: { entityId: string; entityType: string; type: string; value: string }[] = [];

  for (let i = 0; i < skillDefs.length; i++) {
    const def = skillDefs[i];
    const skill = insertedSkills[i];

    if (def.impactedByWeight) {
      propertyRecords.push({
        entityId: skill.id,
        entityType: "skills",
        type: SKILL_IMPACTED_BY_WEIGHT,
        value: "true",
      });
    }

    if (def.usableWithoutTraining) {
      propertyRecords.push({
        entityId: skill.id,
        entityType: "skills",
        type: SKILL_USABLE_WITHOUT_TRAINING,
        value: "true",
      });
    }
  }

  if (propertyRecords.length > 0) {
    await db.insert(propertiesInCustomization).values(propertyRecords);
  }
}
