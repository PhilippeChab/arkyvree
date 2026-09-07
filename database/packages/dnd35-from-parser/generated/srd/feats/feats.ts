import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { and, eq, feat, gte, or } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_WEAPONS, SIMPLE_WEAPONS, MARTIAL_WEAPONS, EXOTIC_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { MAGIC_SCHOOLS } from "@/shared/dnd3.5/spells.ts";
import { stripSeparators } from "@/shared/utils.ts";

const SIMPLE_SET = new Set(SIMPLE_WEAPONS);
const MARTIAL_SET = new Set(MARTIAL_WEAPONS);

function proficiencyReqs(w: string) {
  if (SIMPLE_SET.has(w)) return [or(eq(feat("Simple Weapon Proficiency")), eq(feat(`Simple Weapon Proficiency: ${w}`)))];
  if (MARTIAL_SET.has(w)) return [or(eq(feat("Martial Weapon Proficiency")), eq(feat(`Martial Weapon Proficiency: ${w}`)))];
  return [eq(feat(`Exotic Weapon Proficiency: ${w}`))];
}

const CROSSBOW_WEAPONS = ALL_WEAPONS.filter((w) => w.toLowerCase().includes("crossbow"));

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Acrobatic",
    description: "You receive a +2 bonus to Jump checks and Tumble checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.jump.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.tumble.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Agile",
    description: "You receive a +2 bonus to Balance checks and Escape Artist checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.balance.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.escapeartist.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Alertness",
    description: "You receive a +2 bonus to Listen checks and Spot checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.listen.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.spot.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Animal Affinity",
    description: "You receive a +2 bonus to Handle Animal checks and Ride checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.handleanimal.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.ride.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Armor Proficiency (Heavy)",
    description: "Refer to Armor Proficiency (light).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.armorproficiencylight.possessed"),
      eq("feats.armorproficiencymedium.possessed"),
    ],
  },
  {
    name: "Armor Proficiency (Light)",
    description: "While wearing armor you are proficient with, the armor check penalty only applies to Balance, Climb, Escape Artist, Hide, Jump, Move Silently, Pick Pocket, and Tumble checks.",
    aptitudes: ["General"],
  },
  {
    name: "Armor Proficiency (Medium)",
    description: "Refer to Armor Proficiency (light).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.armorproficiencylight.possessed"),
    ],
  },
  {
    name: "Athletic",
    description: "You receive a +2 bonus to Climb checks and Swim checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.climb.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.swim.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Augment Summoning",
    description: "Any creature you call forth using a summon spell receives a +4 enhancement bonus to both Strength and Constitution for as long as the summoning spell persists.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.spellfocusconjuration.possessed"),
    ],
  },
  {
    name: "Blind-Fight",
    description: "During melee combat, whenever you miss due to concealment, you may reroll the miss chance percentile once to determine if you actually connect. An invisible opponent gains no special melee advantages against you - you keep your Dexterity bonus to Armor Class, and the attacker does not receive the standard +2 bonus for invisibility. These benefits do not extend to ranged attacks from invisible foes. Your movement penalty for being unable to see is reduced by half. Poor visibility or darkness reduces your speed to three-quarters of normal rather than one-half.",
    aptitudes: ["General", "Fighter Bonus Feat"],
  },
  {
    name: "Cleave",
    description: "When you deal enough damage to drop a creature (usually by reducing it below 0 hit points or killing it), you immediately gain an extra melee attack against another creature you can reach. No 5-foot step is allowed before this bonus attack. The additional strike uses the same weapon and attack bonus as the blow that felled the previous creature. This ability can be used once per round.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Combat Casting",
    description: "You receive a +4 bonus to Concentration checks when casting a spell or using a spell-like ability while fighting defensively or while grappled or pinned.",
    aptitudes: ["General"],
  },
  {
    name: "Combat Expertise",
    description: "During an attack action or full attack action in melee, you may accept up to a -5 penalty on your attack rolls and apply the same value (up to +5) as a dodge bonus to your Armor Class. The penalty cannot exceed your base attack bonus. These adjustments remain in effect until your next action.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.intelligence.total", 13),
    ],
  },
  {
    name: "Combat Reflexes",
    description: "You may make additional attacks of opportunity each round equal to your Dexterity bonus. For instance, a fighter with 15 Dexterity can make three total attacks of opportunity per round - the standard one plus two more from the +2 Dexterity bonus. If multiple foes provoke, you can respond to as many as your limit allows, but still only one per individual opportunity. This feat also allows you to make attacks of opportunity while flat-footed.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (2nd)"],
  },
  {
    name: "Deceitful",
    description: "You receive a +2 bonus to Disguise checks and Forgery checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.disguise.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.forgery.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Deflect Arrows",
    description: "You must have at least one hand free to use this feat. Once per round, when a ranged weapon attack would hit you, you can deflect it and take no damage. You must be aware of the incoming attack and cannot be flat-footed. Deflecting does not require an action. Extremely large ranged weapons (such as boulders thrown by giants) and spell-generated ranged attacks (such as Melf's acid arrow) cannot be deflected.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (2nd)"],
    requirements: [
      or(
        and(gte("abilities.dexterity.total", 13), eq("feats.improvedunarmedstrike.possessed")),
        gte("classes.monk.level", 2),
      ),
    ],
  },
  {
    name: "Deft Hands",
    description: "You receive a +2 bonus to Sleight of Hand checks and Use Rope checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.sleightofhand.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.userope.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Diehard",
    description: "When your hit points drop to between -1 and -9, you stabilize automatically without needing to roll. Upon reaching negative hit points, you may opt to act as though disabled instead of dying. This choice must be made immediately when you fall to negative hit points, even outside your turn. If you decline, you fall unconscious right away. While using this feat, you may take either a single move action or a single standard action per turn, but not both and never a full-round action. Move actions cause no additional harm, but performing a standard action (or any other strenuous action, including certain free actions like casting a quickened spell) deals 1 point of damage to you upon completion. You die immediately upon reaching -10 hit points.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.endurance.possessed"),
    ],
  },
  {
    name: "Diligent",
    description: "You receive a +2 bonus to Appraise checks and Decipher Script checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.appraise.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.decipherscript.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Dodge",
    description: "On your action, you choose one opponent and gain a +1 dodge bonus to Armor Class against that opponent's attacks. You may designate a different opponent on any subsequent action. Losing your Dexterity bonus to AC also causes you to lose dodge bonuses. Dodge bonuses (including this one and racial dodge bonuses such as those dwarves receive against giants) stack with one another, unlike most bonus types.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.dexterity.total", 13),
    ],
  },
  {
    name: "Endurance",
    description: "You gain a +4 bonus to the following: Swim checks to resist nonlethal damage, Constitution checks to keep running, Constitution checks to avoid nonlethal damage from forced marches, Constitution checks to hold your breath, Constitution checks to avoid nonlethal damage from starvation or thirst, Fortitude saves to avoid nonlethal damage from extreme temperatures, and Fortitude saves to resist suffocation damage. Additionally, you can sleep in light or medium armor without becoming fatigued.",
    aptitudes: ["General", "Ranger Class Feature"],
  },
  {
    name: "Eschew Materials",
    description: "You can cast any spell with a material component costing 1 gp or less without needing that component. Casting still provokes attacks of opportunity as usual. Spells requiring material components worth more than 1 gp still require you to have those components on hand.",
    aptitudes: ["General"],
  },
  {
    name: "Far Shot",
    description: "When using a projectile weapon such as a bow, your range increment increases by half (multiply by 1.5). When using a thrown weapon, your range increment doubles.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.pointblankshot.possessed"),
    ],
  },
  {
    name: "Great Cleave",
    description: "This feat functions identically to Cleave, except there is no limit on how many times you may use it in a single round.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 4),
      gte("abilities.strength.total", 13),
      eq("feats.cleave.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Great Fortitude",
    description: "You receive a +2 bonus to all Fortitude saving throws.",
    aptitudes: ["General"],
    modifiers: [
      { target: "saves.fortitude.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Greater Spell Penetration",
    description: "You receive a +2 bonus to caster level checks (1d20 + caster level) to overcome a creature's spell resistance. This bonus stacks with the bonus from Spell Penetration.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.spellpenetration.possessed"),
    ],
  },
  {
    name: "Greater Two-Weapon Fighting",
    description: "You gain a third attack with your off-hand weapon, though it takes a -10 penalty.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Combat Style Mastery (11th)"],
    requirements: [
      eq("feats.twoweaponfighting.possessed"),
      or(
        and(gte("combat.bab", 11), gte("abilities.dexterity.total", 19), eq("feats.improvedtwoweaponfighting.possessed")),
        gte("classes.ranger.level", 11),
      ),
    ],
  },
  {
    name: "Improved Bull Rush",
    description: "You do not provoke an attack of opportunity from the defender when performing a bull rush. Additionally, you receive a +4 bonus on the opposed Strength check to push the defender back.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Improved Counterspell",
    description: "When counterspelling, you may substitute any spell from the same school that is at least one level higher than the spell being countered.",
    aptitudes: ["General"],
  },
  {
    name: "Improved Disarm",
    description: "Attempting to disarm an opponent does not provoke an attack of opportunity, and the opponent cannot attempt to disarm you in return. You also receive a +4 bonus on the opposed attack roll made during the disarm attempt.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (6th)"],
    requirements: [
      or(
        and(gte("abilities.intelligence.total", 13), eq("feats.combatexpertise.possessed")),
        gte("classes.monk.level", 6),
      ),
    ],
  },
  {
    name: "Improved Feint",
    description: "You can use a Bluff check to feint in combat as a move action instead of a standard action.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.intelligence.total", 13),
      eq("feats.combatexpertise.possessed"),
    ],
  },
  {
    name: "Improved Grapple",
    description: "Initiating a grapple with a touch attack does not provoke an attack of opportunity. You also receive a +4 bonus on all grapple checks, whether you initiated the grapple or not.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (1st)"],
    requirements: [
      or(
        and(gte("abilities.dexterity.total", 13), eq("feats.improvedunarmedstrike.possessed")),
        gte("classes.monk.level", 1),
      ),
    ],
    modifiers: [
      { target: "combat.grapple.misc", operator: "add", value: "4", valueType: "number" },
    ],
  },
  {
    name: "Improved Initiative",
    description: "You receive a +4 bonus to initiative checks.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    modifiers: [
      { target: "combat.initiative.misc", operator: "add", value: "4", valueType: "number" },
    ],
  },
  {
    name: "Improved Overrun",
    description: "When you attempt an overrun, the target cannot choose to step aside and avoid you. You also receive a +4 bonus on the Strength check to knock the target down.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Improved Precise Shot",
    description: "Your ranged attacks disregard the AC bonus from anything less than total cover, and the miss chance from anything less than total concealment. Total cover and total concealment still function normally against your ranged attacks. Furthermore, when firing or throwing at a creature engaged in a grapple, you automatically hit the intended target rather than striking randomly.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Combat Style Mastery (11th)"],
    requirements: [
      or(
        and(
                  gte("combat.bab", 11),
                  gte("abilities.dexterity.total", 19),
                  eq("feats.pointblankshot.possessed"),
                  eq("feats.preciseshot.possessed"),
                ),
        and(gte("classes.ranger.level", 11), eq("feats.rapidshot.possessed")),
      ),
    ],
  },
  {
    name: "Improved Shield Bash",
    description: "When you make a shield bash attack, you retain the shield's AC bonus rather than losing it.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.shieldproficiency.possessed"),
    ],
  },
  {
    name: "Improved Sunder",
    description: "Attacking an object held or carried by an opponent (such as a weapon or shield) does not provoke an attack of opportunity. You also receive a +4 bonus on attack rolls targeting objects held or carried by another creature.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Improved Trip",
    description: "Attempting to trip an opponent while unarmed does not provoke an attack of opportunity. You receive a +4 bonus on the Strength check to trip your opponent. If you successfully trip a foe in melee, you immediately gain a free melee attack against that foe as though you had not used your attack for the trip. For instance, at 11th level a character with attacks at +11/+6/+1 who fails the first trip attempt (using the +11 attack), then succeeds on the second attempt, immediately makes a free melee attack at +6, and still has the +1 attack remaining.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (6th)"],
    requirements: [
      or(
        and(gte("abilities.intelligence.total", 13), eq("feats.combatexpertise.possessed")),
        gte("classes.monk.level", 6),
      ),
    ],
  },
  {
    name: "Improved Turning",
    description: "Your effective level for turning or rebuking creatures is treated as one level higher than your actual level in the class that grants the ability.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Improved Two-Weapon Fighting",
    description: "Beyond the standard single extra attack with your off-hand weapon, you gain a second off-hand attack at a -5 penalty.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Improved Combat Style (6th)"],
    requirements: [
      eq("feats.twoweaponfighting.possessed"),
      or(
        and(gte("combat.bab", 6), gte("abilities.dexterity.total", 17)),
        gte("classes.ranger.level", 6),
      ),
    ],
  },
  {
    name: "Improved Unarmed Strike",
    description: "You count as armed even when fighting without weapons - armed opponents do not get attacks of opportunity against your unarmed attacks. You still receive attacks of opportunity against foes who attack you unarmed. Your unarmed strikes can deal either lethal or nonlethal damage, as you choose.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Class Feature"],
  },
  {
    name: "Investigator",
    description: "You receive a +2 bonus to Gather Information checks and Search checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.gatherinformation.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.search.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Iron Will",
    description: "You receive a +2 bonus to all Will saving throws.",
    aptitudes: ["General"],
    modifiers: [
      { target: "saves.will.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Leadership",
    description: "You gain the ability to attract loyal companions and devoted followers who serve under you. The specifics of available cohorts and followers are determined by the DM.",
    aptitudes: ["General"],
    requirements: [
      gte("identity.meta.level", 6),
    ],
  },
  {
    name: "Lightning Reflexes",
    description: "You receive a +2 bonus to all Reflex saving throws.",
    aptitudes: ["General"],
    modifiers: [
      { target: "saves.reflex.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Magical Aptitude",
    description: "You receive a +2 bonus to Spellcraft checks and Use Magic Device checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.spellcraft.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.usemagicdevice.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Manyshot",
    description: "As a standard action, you may loose two arrows simultaneously at one target within 30 feet. Both arrows share a single attack roll (at a -4 penalty) and deal damage independently. For every 5 points of base attack bonus above +6, you may add one more arrow, up to four arrows at +16 base attack bonus. Each arrow beyond the second imposes a cumulative -2 attack penalty (-6 total for three arrows, -8 for four). Damage reduction and resistances apply separately to each arrow.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Improved Combat Style (6th)"],
    requirements: [
      eq("feats.rapidshot.possessed"),
      or(
        and(gte("combat.bab", 6), gte("abilities.dexterity.total", 17), eq("feats.pointblankshot.possessed")),
        gte("classes.ranger.level", 6),
      ),
    ],
  },
  {
    name: "Martial Weapon Proficiency",
    description: "You make attack rolls with the chosen weapon without penalty.",
    stackable: true,
    aptitudes: ["General"],
  },
  {
    name: "Mobility",
    description: "You receive a +4 dodge bonus to Armor Class against attacks of opportunity provoked by moving out of or through a threatened area. Losing your Dexterity bonus to AC also negates dodge bonuses. Dodge bonuses (including this one and racial dodge bonuses such as those dwarves receive against giants) stack with one another, unlike most bonus types.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.dexterity.total", 13),
      eq("feats.dodge.possessed"),
    ],
  },
  {
    name: "Mounted Archery",
    description: "The penalty for using ranged weapons while mounted is halved: -2 instead of -4 when your mount takes a double move, and -4 instead of -8 when your mount runs.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.mountedcombat.possessed"),
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Mounted Combat",
    description: "Once per round, when your mount takes a hit in combat, you may make a Ride check as a reaction to negate the blow. If your Ride check result exceeds the opponent's attack roll, the hit is negated. In effect, your Ride check result serves as the mount's AC when it would be higher than the mount's normal AC.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Natural Spell",
    description: "You can fulfill the verbal and somatic components of spells while in wild shape form. For instance, while shaped as a hawk, screeches and talon gestures can substitute for normal verbal and somatic components. You may also use material components or focuses in your possession, even if they are melded into your current form. This feat does not allow use of magic items that your current form could not normally use, nor does it grant the ability to speak while wild shaped.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 13),
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Negotiator",
    description: "You receive a +2 bonus to Diplomacy checks and Sense Motive checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.diplomacy.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.sensemotive.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Nimble Fingers",
    description: "You receive a +2 bonus to Disable Device checks and Open Lock checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.disabledevice.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.openlock.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Persuasive",
    description: "You receive a +2 bonus to Bluff checks and Intimidate checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.bluff.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.intimidate.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Point Blank Shot",
    description: "You receive a +1 bonus to attack rolls and damage rolls with ranged weapons against targets within 30 feet.",
    aptitudes: ["General", "Fighter Bonus Feat"],
  },
  {
    name: "Power Attack",
    description: "Before making attack rolls for the round, you may choose to subtract a number from all melee attack rolls and add that same number to all melee damage rolls. This number cannot exceed your base attack bonus. The attack penalty and damage bonus persist until your next turn.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
    ],
  },
  {
    name: "Precise Shot",
    description: "You can fire or throw ranged weapons at a target engaged in melee without suffering the standard -4 penalty to your attack roll.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.pointblankshot.possessed"),
    ],
  },
  {
    name: "Quick Draw",
    description: "Drawing a weapon is a free action rather than a move action. Drawing a concealed weapon is a move action. With this feat, you may throw weapons at your full normal rate of attacks, similar to using a bow.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 1),
    ],
  },
  {
    name: "Rapid Shot",
    description: "You gain one extra ranged attack per round. This additional attack uses your highest base attack bonus, but every attack you make that round (both the bonus attack and normal attacks) takes a -2 penalty. You must use the full attack action to benefit from this feat.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Combat Style (2nd)"],
    requirements: [
      or(
        and(gte("abilities.dexterity.total", 13), eq("feats.pointblankshot.possessed")),
        gte("classes.ranger.level", 2),
      ),
    ],
  },
  {
    name: "Ride-By Attack",
    description: "While mounted and using the charge action, you may move, make your attack as with a standard charge, and then continue moving along the charge line. Your total movement for the round cannot exceed double your mounted speed. Neither you nor your mount provokes an attack of opportunity from the target you attack.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.mountedcombat.possessed"),
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Run",
    description: "While running, you move at five times your normal speed (with medium, light, or no armor and no more than a medium load) or four times your speed (with heavy armor or a heavy load). A running start grants a +4 bonus to Jump checks. You retain your Dexterity bonus to AC while running.",
    aptitudes: ["General"],
  },
  {
    name: "Self-Sufficient",
    description: "You receive a +2 bonus to Heal checks and Survival checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.heal.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.survival.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Shield Proficiency",
    description: "You can use a shield while incurring only the standard penalties.",
    aptitudes: ["General"],
  },
  {
    name: "Shot on the Run",
    description: "When taking the attack action with a ranged weapon, you may move both before and after your attack, as long as your total movement does not exceed your speed.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 4),
      gte("abilities.dexterity.total", 13),
      eq("feats.dodge.possessed"),
      eq("feats.mobility.possessed"),
      eq("feats.pointblankshot.possessed"),
    ],
  },
  {
    name: "Simple Weapon Proficiency",
    description: "You make attack rolls with simple weapons without penalty.",
    aptitudes: ["General"],
  },
  {
    name: "Snatch Arrows",
    description: "When you use the Deflect Arrows feat, you may catch the incoming weapon rather than simply deflecting it. Caught thrown weapons (such as spears or axes) can be hurled back at the original attacker immediately (even outside your turn) or kept for later use. You must have at least one hand free to use this feat.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.dexterity.total", 15),
      eq("feats.deflectarrows.possessed"),
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Spell Penetration",
    description: "You receive a +2 bonus to caster level checks (1d20 + caster level) made to overcome a creature's spell resistance.",
    aptitudes: ["General"],
  },
  {
    name: "Spirited Charge",
    description: "While mounted and using the charge action, you deal double damage with a melee weapon, or triple damage when wielding a lance.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.ridebyattack.possessed"),
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Spring Attack",
    description: "When taking the attack action with a melee weapon, you may move both before and after the attack, provided your total movement does not exceed your speed. This movement does not provoke an attack of opportunity from the target you strike, though other creatures may still make attacks of opportunity as normal. Heavy armor prevents use of this feat. You must move at least 5 feet both before and after your attack to gain this feat's benefit.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 4),
      gte("abilities.dexterity.total", 13),
      eq("feats.dodge.possessed"),
      eq("feats.mobility.possessed"),
    ],
  },
  {
    name: "Stealthy",
    description: "You receive a +2 bonus to Hide checks and Move Silently checks.",
    aptitudes: ["General"],
    modifiers: [
      { target: "skills.hide.misc", operator: "add", value: "2", valueType: "number" },
      { target: "skills.movesilently.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Stunning Fist",
    description: "You must declare use of this feat prior to your attack roll; a missed attack wastes the attempt. A foe struck by your unarmed attack must make a Fortitude saving throw (DC 10 + half your character level + your Wisdom modifier) in addition to taking normal damage. On a failed save, the target is stunned for 1 round (until just before your next action). A stunned creature cannot act, loses any Dexterity bonus to AC, and suffers a -2 penalty to AC. You may attempt a stunning strike once per day for every four character levels you possess, and no more than once per round. Constructs, oozes, plants, undead, incorporeal creatures, and creatures immune to critical hits are immune to this effect.",
    aptitudes: ["General", "Fighter Bonus Feat", "Monk Bonus Feat (1st)"],
    requirements: [
      or(
        and(
                  gte("combat.bab", 8),
                  gte("abilities.dexterity.total", 13),
                  gte("abilities.wisdom.total", 13),
                  eq("feats.improvedunarmedstrike.possessed"),
                ),
        gte("classes.monk.level", 1),
      ),
    ],
  },
  {
    name: "Sunder",
    description: "Striking at an opponent's weapon does not provoke an attack of opportunity from that opponent.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Toughness",
    description: "You gain +3 hit points.",
    stackable: true,
    aptitudes: ["General"],
    modifiers: [
      { target: "combat.hp.misc", operator: "add", value: "3", valueType: "number" },
    ],
  },
  {
    name: "Tower Shield Proficiency",
    description: "You can use a tower shield while incurring only the standard penalties.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.shieldproficiency.possessed"),
    ],
  },
  {
    name: "Track",
    description: "Finding tracks or following them for 1 mile requires a successful Survival check. A new check is needed whenever the trail becomes harder to follow, such as when other tracks cross the trail or when it doubles back and splits. You travel at half normal speed while tracking (or at normal speed with a -5 check penalty, or up to double speed with a -20 penalty). The DC varies based on surface type and conditions. Very Soft Ground (fresh snow, thick dust, wet mud) retains deep, clear footprints. Soft Ground yields to pressure but is firmer, leaving frequent shallow prints. Firm Ground (typical outdoor terrain like lawns, fields, and woods, or very soft or dirty indoor surfaces) may show traces like broken branches or tufts of hair, with only occasional or partial prints. Hard Ground (bare rock, indoor floors, streambeds) holds no prints, only faint traces like scuff marks or displaced pebbles. Various conditions modify the Survival DC. Every three creatures in the tracked group reduce the DC by 1. For mixed-size groups, apply only the modifier for the largest size. On a failed check, you may retry after 1 hour outdoors or 10 minutes indoors.",
    aptitudes: ["General", "Ranger Class Feature"],
  },
  {
    name: "Trample",
    description: "When attempting to overrun an opponent while mounted, the target cannot choose to avoid you. Your mount may make one hoof attack against any target you knock prone, gaining the standard +4 attack bonus against prone targets.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Two-Weapon Defense",
    description: "While wielding a double weapon or two weapons (excluding natural weapons and unarmed strikes), you gain a +1 shield bonus to AC. This shield bonus increases to +2 when you fight defensively or use the total defense action.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.dexterity.total", 15),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Two-Weapon Fighting",
    description: "The penalties for fighting with two weapons are reduced. Your primary hand penalty decreases by 2, and your off-hand penalty decreases by 6.",
    aptitudes: ["General", "Fighter Bonus Feat", "Ranger Combat Style (2nd)"],
    requirements: [
      or(gte("abilities.dexterity.total", 15), gte("classes.ranger.level", 2)),
    ],
  },
  {
    name: "Weapon Finesse",
    description: "When using a light weapon, rapier, whip, or spiked chain appropriately sized for your size category, you may apply your Dexterity modifier to attack rolls in place of your Strength modifier. If you carry a shield, its armor check penalty applies to your attack rolls.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 1),
    ],
  },
  {
    name: "Whirlwind Attack",
    description: "When using the full attack action, you may forgo your regular attacks to instead make a single melee attack at your full base attack bonus against every opponent within your reach. Using Whirlwind Attack causes you to give up any bonus or extra attacks from other feats, spells, or abilities (such as Cleave or the haste spell).",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 4),
      gte("abilities.dexterity.total", 13),
      gte("abilities.intelligence.total", 13),
      eq("feats.combatexpertise.possessed"),
      eq("feats.dodge.possessed"),
      eq("feats.mobility.possessed"),
      eq("feats.springattack.possessed"),
    ],
  },
];

export const ITEM_CREATION_FEATS: FeatSeed[] = [
  {
    name: "Brew Potion",
    description: "You can produce a potion from any spell of 3rd level or below that you know, provided it targets one or more creatures. Creating a potion requires one day of work. You determine the caster level when brewing, which must be high enough to cast the spell but cannot exceed your own level. The base cost equals the spell level multiplied by the caster level multiplied by 50 gp. You must invest 1/25 of this base cost in XP and spend raw materials worth half the base cost. All casting decisions are made during brewing, and the drinker becomes the spell's target. If the stored spell has an expensive material component or XP cost, you must pay that cost as well, on top of the base price costs.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Craft Magic Arms and Armor",
    description: "You can create magical weapons, armor, or shields for which you meet the prerequisites. Enchanting takes one day per 1,000 gp of the magical features' price. You must spend 1/25 of the total magical feature price in XP and consume raw materials costing half that total. You must supply a masterwork item as the base, at your own expense. You may also repair a broken magic weapon, armor, or shield that you could have created, at half the XP, half the materials, and half the time of crafting it new.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 5), gte("spellcasting.divine", 5)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Craft Rod",
    description: "You can create any rod for which you meet the prerequisites. Crafting requires one day per 1,000 gp of the rod's base price. You must invest 1/25 of the base price in XP and use raw materials costing half the base price. Certain rods have additional material component or XP costs as specified in their individual descriptions, beyond the base price costs.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 9), gte("spellcasting.divine", 9)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Craft Staff",
    description: "You can create any staff for which you meet the prerequisites. Crafting requires one day per 1,000 gp of the staff's base price. You must invest 1/25 of the base price in XP and use raw materials costing half the base price. A new staff holds 50 charges. Certain staffs have additional material component or XP costs as specified in their individual descriptions, beyond the base price costs.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 12), gte("spellcasting.divine", 12)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Craft Wand",
    description: "You can create a wand containing any spell of 4th level or lower that you know. Crafting requires one day per 1,000 gp of the wand's base price. The base price is calculated as caster level times spell level times 750 gp. You must invest 1/25 of this base price in XP and use raw materials costing half the base price. A new wand holds 50 charges. If the stored spell has a costly material component or XP cost, you must pay fifty times that component cost or XP cost in addition to the base price costs.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 5), gte("spellcasting.divine", 5)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Craft Wondrous Item",
    description: "You can create any wondrous item for which you meet the prerequisites. Enchanting requires one day per 1,000 gp of the item's price. You must invest 1/25 of the price in XP and use raw materials costing half the price. You may also repair a broken wondrous item you could have created, at half the XP, half the materials, and half the time of crafting it new. Certain wondrous items have additional material component or XP costs noted in their descriptions; these apply both to creation and repair.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Forge Ring",
    description: "You can create any ring for which you meet the prerequisites. Crafting requires one day per 1,000 gp of the ring's base price. You must invest 1/25 of the base price in XP and use raw materials costing half the base price. You may also repair a broken ring you could have created, at half the XP, half the materials, and half the time of forging it new. Some magic rings have additional material component or XP costs noted in their descriptions. You must pay such costs both when creating and when repairing the ring.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 12), gte("spellcasting.divine", 12)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
  {
    name: "Scribe Scroll",
    description: "You can create a scroll of any spell you know. Scribing requires one day per 1,000 gp of the scroll's base price. The base price equals the spell level times the caster level times 25 gp. You must invest 1/25 of this base price in XP and use raw materials costing half the base price. If the stored spell has a costly material component or XP cost, you must pay that cost in addition to the base price costs when scribing.",
    aptitudes: ["General", "Wizard Bonus Feat", "Wizard Class Feature"],
    requirements: [
      or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
];

export const METAMAGIC_FEATS: FeatSeed[] = [
  {
    name: "Empower Spell",
    description: "All variable numeric effects of the spell increase by half. An empowered spell deals 1.5 times normal damage, restores 1.5 times the usual hit points, affects 1.5 times as many targets, and so on as applicable. For instance, an empowered magic missile deals 1.5 times its normal damage per missile (roll 1d4+1 and multiply by 1.5). Saving throws, opposed rolls (such as for dispel magic), and spells without random variables are unaffected. An empowered spell occupies a spell slot two levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Enlarge Spell",
    description: "You can modify a spell with a range of close, medium, or long to double its range. An enlarged close-range spell reaches 50 ft. + 5 ft./level, a medium-range spell reaches 200 ft. + 20 ft./level, and a long-range spell reaches 800 ft. + 80 ft./level. An enlarged spell occupies a spell slot one level higher than the spell's actual level. Spells whose ranges are not measured in distance or are not close, medium, or long cannot be enlarged.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Extend Spell",
    description: "An extended spell lasts twice its normal duration. Spells with a duration of concentration, instantaneous, or permanent are unaffected. An extended spell occupies a spell slot one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Heighten Spell",
    description: "A heightened spell functions at a higher spell level than its original (up to 9th level maximum). Unlike other metamagic feats, Heighten Spell genuinely raises the spell's effective level. All level-dependent effects (including saving throw DCs and the ability to bypass protections like lesser globe of invulnerability) use the heightened level. The heightened spell is as difficult to prepare and cast as a spell of its new effective level. For instance, a cleric could prepare hold person as a 4th-level spell instead of 2nd-level, and it would function in every respect as a 4th-level spell.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Maximize Spell",
    description: "All variable numeric effects of the modified spell are set to their maximum values. A maximized spell deals maximum damage, heals the greatest possible number of hit points, affects the maximum number of targets, and so forth. For instance, a maximized fireball deals 6 points of damage per caster level (maximum 60 at 10th caster level). Saving throws, opposed rolls (such as for dispel magic), and spells without random variables are unaffected. A maximized spell occupies a spell slot three levels higher than the spell's actual level. A spell that is both empowered and maximized gains both effects separately: the maximum result plus half the normally rolled result. For example, an empowered, maximized fireball from a 15th-level wizard deals 60 plus half of 10d6.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Quicken Spell",
    description: "A quickened spell is cast as a free action. You may still perform other actions in the same round, including casting another spell. Only one quickened spell is allowed per round. Spells with a casting time longer than 1 full-round action cannot be quickened. A quickened spell occupies a spell slot four levels higher than the spell's actual level. Casting a quickened spell does not provoke an attack of opportunity.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Silent Spell",
    description: "A silent spell requires no verbal components. Spells that already lack verbal components are unaffected. A silent spell occupies a spell slot one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Still Spell",
    description: "A stilled spell requires no somatic components. Spells that already lack somatic components are unaffected. A stilled spell occupies a spell slot one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Widen Spell",
    description: "You can modify a burst, emanation, line, or spread spell to increase all numeric area measurements by 100%. For instance, a fireball (normally a 20-foot-radius spread) becomes a 40-foot-radius spread when widened. A widened spell occupies a spell slot three levels higher than the spell's actual level. Spells without one of these four area shapes are unaffected by this feat.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
];

export const SPECIAL_FEATS: FeatSeed[] = [
  {
    name: "Extra Turning",
    description: "Each time you select this feat, you gain four additional daily uses of your turn or rebuke ability. If you possess multiple turn/rebuke abilities (for example, a good-aligned cleric with the Fire domain who can turn undead and rebuke fire creatures), each ability gains four extra daily uses.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Spell Mastery",
    description: "Each time you select this feat, choose a number of spells you already know equal to your Intelligence modifier. You can thereafter prepare those spells without consulting a spellbook.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      gte("classes.wizard.level", 1),
    ],
  },
];

export const exoticWeaponProficiency: FeatSeed[] = EXOTIC_WEAPONS.map((w) => ({
  name: `Exotic Weapon Proficiency: ${w}`,
  description: `You make attack rolls with the chosen weapon without penalty.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    gte("combat.bab", 1),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Exotic Weapon Proficiency" }],
}));

export const greaterSpellFocus: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({
  name: `Greater Spell Focus: ${s}`,
  description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${s}. This bonus stacks with the bonus granted by Spell Focus.`,
  aptitudes: ["General"],
  requirements: [
    eq(feat(`Spell Focus: ${s}`)),
  ],
  modifiers: [
    { target: `powers.groups.${stripSeparators(s)}.*.dc.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Spell Focus" }],
}));

export const greaterWeaponFocus: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Greater Weapon Focus: ${w}`,
  description: `You gain an additional +1 bonus to attack rolls with the chosen weapon. This bonus stacks with other attack roll bonuses, including the bonus from Weapon Focus.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    eq(feat(`Weapon Focus: ${w}`)),
    gte("classes.fighter.level", 8),
  ],
  modifiers: [
    { target: `items.weapons.${stripSeparators(w)}.tohit.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Weapon Focus" }],
}));

export const greaterWeaponSpecialization: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Greater Weapon Specialization: ${w}`,
  description: `You gain an additional +2 bonus to damage rolls with the chosen weapon. This bonus stacks with other damage roll bonuses, including the bonus from Weapon Specialization.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    eq(feat(`Greater Weapon Focus: ${w}`)),
    eq(feat(`Weapon Focus: ${w}`)),
    eq(feat(`Weapon Specialization: ${w}`)),
    gte("classes.fighter.level", 12),
  ],
  modifiers: [
    { target: `items.weapons.${stripSeparators(w)}.damage.misc`, operator: "add", value: "2", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Weapon Specialization" }],
}));

export const improvedCritical: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Improved Critical: ${w}`,
  description: `The threat range of your chosen weapon is doubled. For instance, a longsword normally threatens a critical on 19-20 (two numbers). With this feat applied to longsword, the threat range becomes 17-20 (four numbers).`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    ...proficiencyReqs(w),
    gte("combat.bab", 8),
  ],
  modifiers: [
    { target: `items.weapons.${stripSeparators(w)}.damage.critical.range`, operator: "multiply", value: "2", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Improved Critical" }],
}));

export const rapidReload: FeatSeed[] = CROSSBOW_WEAPONS.map((w) => ({
  name: `Rapid Reload: ${w}`,
  description: `Reloading your chosen crossbow type becomes a free action (for hand or light crossbows) or a move action (for heavy crossbows). Reloading still provokes an attack of opportunity. If you have this feat for a hand or light crossbow, you can fire it as many times during a full attack as you could with a bow.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  properties: [{ type: "FEAT_FAMILY", value: "Rapid Reload" }],
}));

export const skillFocus: FeatSeed[] = SKILL_NAMES.map((s) => ({
  name: `Skill Focus: ${s}`,
  description: `You get a +3 bonus on all ${s} checks.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `skills.${stripSeparators(s)}.misc`, operator: "add", value: "3", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Skill Focus" }],
}));

export const spellFocus: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({
  name: `Spell Focus: ${s}`,
  description: `Add +1 to the Difficulty Class for all saving throws against spells from the school of ${s}.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `powers.groups.${stripSeparators(s)}.*.dc.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Spell Focus" }],
}));

export const weaponFocus: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Weapon Focus: ${w}`,
  description: `You gain a +1 bonus to all attack rolls made with the chosen weapon.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    ...proficiencyReqs(w),
    gte("combat.bab", 1),
  ],
  modifiers: [
    { target: `items.weapons.${stripSeparators(w)}.tohit.misc`, operator: "add", value: "1", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Weapon Focus" }],
}));

export const weaponSpecialization: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Weapon Specialization: ${w}`,
  description: `You gain a +2 bonus to all damage rolls made with the chosen weapon.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    eq(feat(`Weapon Focus: ${w}`)),
    gte("classes.fighter.level", 4),
  ],
  modifiers: [
    { target: `items.weapons.${stripSeparators(w)}.damage.misc`, operator: "add", value: "2", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Weapon Specialization" }],
}));

// ---------------------------------------------------------------------------
// Wizard School feats (system-generated)
// ---------------------------------------------------------------------------

import { WIZARD_SCHOOLS, WIZARD_PROHIBITED_SCHOOL } from "@/database/packages/dnd35/v1/wizard-schools/data.ts";

const SPEC = "Wizard Specialization";
const PROHIB = "Prohibited School";

export const WIZARD_SCHOOL_FEATS: FeatSeed[] = [
  ...WIZARD_SCHOOLS.map((s) => ({
    name: `${s.name} Specialist`,
    description: s.description,
    aptitudes: [SPEC],
    requirements: [gte("classes.wizard.level", 1)],
    modifiers: [{
      target: "aptitudes.prohibitedschool.allowed",
      operator: "add",
      value: String(s.prohibitedSchoolCount),
      valueType: "number",
    }],
  })),
  {
    name: "Generalist",
    description: "A generalist wizard does not specialize in any school of magic. They have no prohibited schools and gain no bonus spell slots, but can freely learn spells from all schools.",
    aptitudes: [SPEC],
    requirements: [gte("classes.wizard.level", 1)],
  },
  ...WIZARD_SCHOOLS.map((s) => ({
    name: `Prohibit ${s.name}`,
    description: `You cannot learn, prepare, or cast spells from the school of ${s.name}. All spells from this school are removed from your spell list.`,
    aptitudes: [PROHIB],
    requirements: [gte("classes.wizard.level", 1)],
    properties: [{ type: WIZARD_PROHIBITED_SCHOOL, value: s.name }],
  })),
];

// ---------------------------------------------------------------------------
// Weapon proficiency feats (system-generated)
// ---------------------------------------------------------------------------

export const WEAPON_PROFICIENCY_FEATS: FeatSeed[] = [
  ...SIMPLE_WEAPONS.map((w) => ({
    name: `Simple Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false as const,
  })),
  ...MARTIAL_WEAPONS.map((w) => ({
    name: `Martial Weapon Proficiency: ${w}`,
    description: `You are proficient with the ${w.toLowerCase()}.`,
    aptitudes: ["General"],
    selectable: false as const,
  })),
];
