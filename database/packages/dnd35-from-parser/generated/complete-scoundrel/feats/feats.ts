import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { eq, eqStr, gte, or } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { MAGIC_SCHOOLS } from "@/shared/dnd3.5/spells.ts";
import { stripSeparators } from "@/shared/utils.ts";

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Acrobatic Backstab",
    description: "If you succeed on a Tumble check to move through an enemy's space, you can treat that enemy as flat-footed against the next melee attack you make against it on your current turn. Your enemy must be standing on the ground or floor in order for you to use this trick.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.tumble.rank", 12),
    ],
  },
  {
    name: "Ascetic Stalker",
    description: "Your monk and ninja levels stack for the purpose of determining the size of your ki pool. For example, a 4th-level monk/2nd-level ninja with this feat could use her ki powers a number of times equal to 3 (half the sum of her monk and ninja levels) + her Wisdom bonus (if any). Your monk and ninja levels also stack for the purpose of determining your unarmed strike damage, as well as your ki strike class feature. For example, a 4th-level monk/6th-level ninja would deal 1d10 points of damage with her unarmed strike, and her unarmed strike would overcome damage reduction as a lawful magic weapon (as if she were a 10th-level monk). In addition, you can multiclass freely between the monk and ninja classes. You must still remain lawful in order to continue advancing as a monk. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.kipower.possessed"),
    ],
  },
  {
    name: "Assume Quirk",
    description: "When impersonating a particular individual, you can eliminate the normal Spot bonus granted to a viewer familiar with that individual (PH 73). The effect extends to all viewers. Using this trick requires no special action, but you can maintain the deception for only 1 hour per day.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.disguise.rank", 5),
    ],
  },
  {
    name: "Back on Your Feet",
    description: "If you fall prone for any reason, you can stand up as an immediate action without provoking attacks of opportunity.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.tumble.rank", 12),
    ],
  },
  {
    name: "Clarity of Vision",
    description: "As a swift action, you can attempt a DC 20 Spot check. If successful, you focus your vision so clearly that you can pinpoint the location of invisible creatures within 30 feet. This clarity lasts until the end of your turn.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spot.rank", 12),
    ],
  },
  {
    name: "Clever Improviser",
    description: "When making a Disable Device or Open Lock check without using thieves' tools, you ignore the normal -2 penalty. You can use this trick any number of times per day until you fail a Disable Device or Open Lock check made without using thieves' tools. After a failure, you can't use Clever Improviser again until after you have rested for 8 hours.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.disabledevice.rank", 5),
      gte("skills.openlock.rank", 5),
    ],
  },
  {
    name: "Collector of Stories",
    description: "When you attempt a trained Knowledge check to identify a creature or to learn its special powers or vulnerabilities, you gain a +5 competence bonus on the check.",
    aptitudes: ["General"],
    requirements: [
      or(
        gte("skills.knowledgearcana.rank", 5),
        gte("skills.knowledgearchitectureandengineering.rank", 5),
        gte("skills.knowledgedungeoneering.rank", 5),
        gte("skills.knowledgegeography.rank", 5),
        gte("skills.knowledgehistory.rank", 5),
        gte("skills.knowledgelocal.rank", 5),
        gte("skills.knowledgenature.rank", 5),
        gte("skills.knowledgenobilityandroyalty.rank", 5),
        gte("skills.knowledgepsionics.rank", 5),
        gte("skills.knowledgereligion.rank", 5),
        gte("skills.knowledgetheplanes.rank", 5),
      ),
    ],
  },
  {
    name: "Conceal Spellcasting",
    description: "You can cast a spell without revealing that you are doing so. Make a Sleight of Hand check as part of the action used to cast the spell, opposed by the Spot checks of onlookers. If you are successful, an observer can't tell that you're casting a spell. That observer cannot make an attack of opportunity against you for casting, nor can it attempt to counter your spell.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.concentration.rank", 1),
      gte("skills.sleightofhand.rank", 5),
      gte("skills.spellcraft.rank", 1),
    ],
  },
  {
    name: "Cool Head (CS)",
    description: "You immediately learn up to two mental skill tricks at no cost, and your limit on skill tricks known increases by one. See for details on mental skill tricks.",
    aptitudes: ["General"],
  },
  {
    name: "Corner Perch",
    description: "If you succeed on a Climb check to ascend or descend either a \"chimney,\" where you can brace against opposite walls, or a corner where you can brace against perpendicular walls (PH 69), you can suspend yourself momentarily. Until the end of your next turn, you can use your hands freely for any other purpose (including attacking) without risk of falling. At the end of your next turn, you fall from the wall unless you succeed on a Climb check against the normal DC + 5 (made as a move action) or you have succeeded on another Climb check to move up or down the wall as normal. Example: Ember the monk succeeds on a DC 15 Climb check to scramble up 10 feet (one-quarter of her speed) into a corner formed by two typical dungeon walls. Using Corner Perch, she then braces her legs against the walls and uses her remaining standard action to draw and throw a shuriken at a bugbear on the ground below her. On her next turn, still braced in the corner, she draws her quarterstaff and attacks an ogre that has moved next to her, gaining a +1 bonus on the attack roll for higher ground. At the end of that turn, she drops from the wall rather than attempting to hold her position. Since she has the slow fall class feature, Ember takes no damage from the drop.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 8),
    ],
  },
  {
    name: "Daredevil Athlete",
    description: "Three times per day, you can use an immediate action to gain a +5 competence bonus on a single Balance, Climb, Escape Artist, Jump, Ride, Swim, or Tumble check",
    aptitudes: ["General"],
  },
  {
    name: "Daring Outlaw",
    description: "Your rogue and swashbuckler levels stack for the purpose of determining your competence bonus on Reflex saves from the grace class feature and the swashbuckler's dodge bonus to AC. For example, a 7th-level rogue/4th-level swashbuckler has grace +2 and gains a +2 dodge bonus to AC, as if she were an 11th-level swashbuckler. Your rogue and swashbuckler levels also stack for the purpose of determining your sneak attack bonus damage. For example, a 7th-level rogue/4th-level swashbuckler would deal an extra 6d6 points of damage with her sneak attack, as if she were an 11th-level rogue.",
    aptitudes: ["General"],
    requirements: [
      gte("feats.sneakattack.count", 2),
      eq("feats.grace.possessed"),
    ],
  },
  {
    name: "Daring Warrior",
    description: "Your fighter and swashbuckler levels stack for the purpose of determining your competence bonus on Reflex saves from the grace class feature and the swashbuckler's dodge bonus to AC. For example, a 6th-level fighter/5th-level swashbuckler has grace +2 and gains a +2 dodge bonus to AC, as if she were an 11th-level swashbuckler. Your fighter and swashbuckler levels also stack for the purpose of qualifying for feats that require a minimum fighter level, such as Greater Weapon Focus.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.weaponspecialization.possessed"),
      eq("feats.grace.possessed"),
    ],
  },
  {
    name: "Deadly Defense",
    description: "When fighting defensively, you deal an extra 1d6 points of damage with any light weapon or with any weapon to which the Weapon Finesse feat applies (such as a rapier, spiked chain, or whip). This feat's benefit applies only when you are unarmored or wearing light armor and not using a shield.",
    aptitudes: ["General"],
  },
  {
    name: "Dismount Attack",
    description: "If your mount has moved at least 10 feet in this round and you succeed on a fast dismount (Ride, PH 80), you can use a standard action to attack an adjacent opponent as if you had charged that opponent.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.ride.rank", 5),
    ],
  },
  {
    name: "Easy Escape",
    description: "If your opponent is larger than Medium, you gain a circumstance bonus on your Escape Artist check to escape a grapple or pin. The size of the bonus depends on your opponent's size, according to the following table.",
    aptitudes: ["General"],
    requirements: [
      or(
        eqStr("identity.physiology.race.size", "Fine"),
        eqStr("identity.physiology.race.size", "Diminutive"),
        eqStr("identity.physiology.race.size", "Tiny"),
        eqStr("identity.physiology.race.size", "Small"),
        eqStr("identity.physiology.race.size", "Medium"),
      ),
      gte("skills.escapeartist.rank", 8),
    ],
  },
  {
    name: "Enduring Ki",
    description: "By spending an extra daily use of your ki power when you activate it, the chosen effect lasts for an additional round (ki power is a class feature of the ninja; see the sidebar for details). You also gain one extra daily use of your ki power.",
    aptitudes: ["General"],
  },
  {
    name: "Escape Attack",
    description: "When you escape a grapple, you can make a single melee attack with a light weapon as a swift action against the opponent that was grappling you. The opponent is considered flat-footed against this attack. You must have the weapon in hand at the beginning of your turn in order to use this trick.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.escapeartist.rank", 8),
    ],
  },
  {
    name: "Expanded Ki Pool",
    description: "You gain three extra daily uses of your ki power (ki power is a class feature of the ninja; see the sidebar for details).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.kipower.possessed"),
    ],
  },
  {
    name: "Extreme Leap",
    description: "If you make a horizontal jump of at least 10 feet during your turn, you can spend a swift action to move an additional 10 feet on that turn.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.jump.rank", 5),
    ],
  },
  {
    name: "False Theurgy",
    description: "As a swift action when casting a spell, you can adjust the spell's verbal and somatic components to mimic those of another spell of your choice of the same level. Any creature using Spellcraft or any other means to identify the spell you're casting believes it to be the other spell instead. This trick renders your spell immune to the normal method of counterspelling, though dispel magic or a similar effect still works normally. Of course, once the spell takes effect, it can be identified and dealt with normally (a fireball still looks and feels like a fireball once you've cast it).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.bluff.rank", 8),
      gte("skills.sleightofhand.rank", 8),
      gte("skills.spellcraft.rank", 8),
    ],
  },
  {
    name: "Freerunner",
    description: "You immediately learn up to two movement skill tricks at no cost, and your limit on skill tricks known increases by one. See for details on movement skill tricks.",
    aptitudes: ["General"],
  },
  {
    name: "Group Fake-Out",
    description: "You can use Bluff to feint in combat (PH 68) against more than one opponent. Make one Bluff check opposed by separate Sense Motive checks for each opponent. For each opponent after the first that you wish to affect, you take a cumulative -2 penalty on your Bluff check. Example: Lidda wants to feint against a group of three orcs, so she rolls a Bluff check with a -4 penalty. Each orc rolls a separate Sense Motive check opposed by Lidda's adjusted Bluff check result.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.bluff.rank", 8),
    ],
  },
  {
    name: "Healing Hands",
    description: "If you succeed on a Heal check made to stabilize a dying character, that character also heals 1d6 points of damage.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.heal.rank", 5),
    ],
  },
  {
    name: "Hidden Blade",
    description: "After you have used the Sleight of Hand skill to successfully conceal a weapon (PH 81), you can draw that weapon as a move action instead of a standard action. An opponent that was unaware of the concealed weapon is treated as flat-footed against the first attack you make in that turn.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.quickdraw.possessed"),
      gte("skills.sleightofhand.rank", 5),
    ],
  },
  {
    name: "Improved Familiar",
    description: "When you choose a familiar, the creatures on the table below are also available. You can choose a familiar with an alignment up to one step away on each of the alignment axes (lawful through chaotic,good through evil). For example, a chaotic good spellcaster could acquire a neutral familiar. A lawful neutral spellcaster could acquire a neutral good familiar. Except as noted here, improved familiars otherwise use the normal rules for familiars (PH 52). Arcane Familiar Alignment Caster Level Monstrous centipede, Small N 2nd Badger N 3rd Monstrous scorpion, Small N 3rd Viper, Medium N 3rd Monstrous spider, Small N 4th Vargouille* NE 6th Mephit, any N 7th * Vargouilles summoned as familiars do not possess the kiss supernatural ability.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.familiarsorcerer.possessed"), eq("feats.familiarwizard.possessed")),
    ],
  },
  {
    name: "Improved Skirmish",
    description: "If you move at least 20 feet away from where you were at the start of your turn, your skirmish damage increases by 2d6 and your competence bonus to AC from skirmish improves by 2.",
    aptitudes: ["General"],
    requirements: [
      gte("feats.skirmish.count", 2),
    ],
  },
  {
    name: "Leaping Climber",
    description: "If you begin a climb by making a Jump check as a swift action, you can add the vertical distance of your jump to the distance climbed in that round. Treat the Jump check as being made with a running start even if you didn't move at least 20 feet. Example: Ember the monk is standing at the base of a craggy cliff and wants to scale the cliff as quickly as possible. She spends a swift action to make a Jump check and gets a result of 24. Thus, she adds 6 feet to the distance she climbs in that round.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 5),
      gte("skills.jump.rank", 5),
    ],
  },
  {
    name: "Listen to This",
    description: "Whenever you make a successful Listen check to hear a noise, you can describe that sound any time up to 1 hour later with such clarity that any individuals hearing the description are treated as if they had heard the sound themselves. This trick is particularly useful if you overhear a conversation but don't understand the language spoken, since it allows you to repeat it verbatim to an ally who might be able to translate.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.listen.rank", 5),
    ],
  },
  {
    name: "Martial Stalker",
    description: "Your fighter and ninja levels stack for the purpose of determining the size of your ki pool, as well as your AC bonus. For example, a 5th-level fighter/1st-level ninja with this feat could use his ki powers a number of times equal to 3 (one-half his ninja and fighter levels) + his Wisdom bonus (if any), and would have a +1 bonus to AC (as if he were a 6th-level ninja). Your fighter and ninja levels also stack for the purpose of qualifying for feats that require a minimum fighter level, such as Greater Weapon Focus.",
    aptitudes: ["General"],
  },
  {
    name: "Master Spellthief",
    description: "Your spellthief levels stack with levels of other arcane spellcaster classes (that is, levels of any class that grants arcane spellcasting other than the spellthief) for the purpose of determining what level of spell you can steal. For example, a 4th-level spellthief/4th-level wizard could steal spells of up to 4th level, as if he were an 8th-level spellthief. Your spellthief and arcane spellcaster levels also stack when determining your caster level for all arcane spells. The character described above would have a caster level of 8th for both his spellthief spells and his wizard spells. In addition, you do not incur a chance of arcane spell failure for arcane spells cast or stolen from other classes, but only if you are wearing light armor. You incur the normal arcane spell failure chance when wearing medium or heavy armor or when using a shield.",
    aptitudes: ["General"],
    requirements: [
      gte("spellcasting.arcane", 2),
    ],
  },
  {
    name: "Mosquito's Bite",
    description: "If you use a light weapon to hit a flat-footed opponent, you can choose to have the opponent not realize that it has been hit until the start of your next turn. Instead, that opponent reacts as if you had attacked and missed. Using this skill trick doesn't require an action on your part. This trick doesn't allow the opponent to ignore any of the other effects of your attack, such as ability damage from poison on your blade or falling unconscious when reduced to fewer than 0 hit points.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.sleightofhand.rank", 12),
    ],
  },
  {
    name: "Never Outnumbered",
    description: "When you use Intimidate to demoralize an opponent (PH 76), you can affect all enemies within 10 feet that can see you, rather than only a single enemy you threaten. Each enemy rolls a separate modified level check to oppose your Intimidate check, but the skill check otherwise works as normal.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.intimidate.rank", 8),
    ],
  },
  {
    name: "Nimble Charge",
    description: "You can run or charge across a difficult surface without needing to make a Balance check (PH 67).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.balance.rank", 5),
    ],
  },
  {
    name: "Nimble Stand",
    description: "You can stand up from prone without provoking attacks of opportunity.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.tumble.rank", 8),
    ],
  },
  {
    name: "Opening Tap",
    description: "As a swift action, you can make an Open Lock check with a -10 penalty by tapping a lock with a hard, blunt object such as the pommel of a weapon. You don't take any additional penalty for making the check without thieves' tools. You can use this trick any number of times per day until you fail an Open Lock check made in this way. After a failure, you can't use Opening Tap again until after you have rested for 8 hours.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.openlock.rank", 12),
    ],
  },
  {
    name: "Point it Out",
    description: "When you make a successful Spot check, you can spend an immediate action to grant a single ally a free Spot check to see the same thing (with a +2 circumstance bonus). Your ally must be within 30 feet of you and able to see or hear you to benefit from this effect.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spot.rank", 8),
    ],
  },
  {
    name: "Poison Expert",
    description: "Choose a type of poison (contact, ingested, inhaled, or injury). The DC to resist both the initial and secondary damage of poisons of this type that you create and use increases by 1. This feat has no effect on poisons used by other creatures, even if you craft those poisons. It also has no effect on natural poisons (those exuded from a creature's body).",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.poisonuse.possessed"),
      gte("skills.craft.rank", 4),
    ],
  },
  {
    name: "Poison Master",
    description: "Choose a type of poison (contact, ingested, inhaled, or injury) for which you have selected the Poison Expert feat. The initial and secondary damage dealt by poisons of this type that you create and use increases by 1 point per die of damage (or by 1 point, if it deals a fixed amount of damage). For example, lich dust used by a character with Poison Master (ingested) would deal initial damage of 2d6+2 Str and secondary damage of 1d6+1 Con plus 1d6+1 Str. If a poison doesn't deal damage, this feat has no effect. This feat has no effect on poisons used by other creatures, even if you craft those poisons. It also has no effect on natural poisons (those exuded from a creature's body).",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.poisonexpert.possessed"),
      eq("feats.poisonuse.possessed"),
      gte("skills.craft.rank", 8),
    ],
  },
  {
    name: "Psithief",
    description: "You can use your steal spell ability to siphon psionic energy instead of spell energy. Instead of stealing a spell, you can choose to steal a number of power points equal twice to the maximum level of spell you can steal minus 1 (up to a maximum value equal to the manifester level of the creature struck). For example, a 4th-level spellthief/1st-level psychic warrior could steal up to 3 power points; if he used this ability against a 2nd-level psion he could steal only 2 power points, since that is the target's manifester level. You can use the stolen power points only to manifest a psionic power you already know. You must use these power points within 1 hour of stealing them; otherwise, the extra psionic energy fades harmlessly away. This feat otherwise follows the rules for the steal spell class feature. In addition, Knowledge (psionics) and Psicraft are spellthief class skills for you. These skills appear on of Expanded Psionics Handbook.",
    aptitudes: ["General"],
  },
  {
    name: "Quick Escape",
    description: "This trick has two options, either of which can be used once per encounter. You can make an Escape Artist check to escape from a grapple or pin as a swift action. You can use this trick even if you have already used a standard action on your current turn to attempt the same escape. Alternatively, you can make any Escape Artist check that would normally require a full-round action as a move action. You can't use this option more than once per day against the same kind of restraint.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.escapeartist.rank", 12),
    ],
  },
  {
    name: "Quick Swimmer",
    description: "If you succeed on a Swim check to move at least 10 feet, you can move an extra 10 feet as part of that action.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.swim.rank", 5),
    ],
  },
  {
    name: "Savvy Rogue",
    description: "Based on the rogue special abilities you have (PH 50), you gain one or more additional special benefits as described below. You gain the benefits for all the special abilities you have, even those you gain after selecting this feat. Crippling Strike: You can deal Strength damage even to a target that is immune to extra damage from sneak attacks. Defensive Roll: You can use this ability three times per day, rather than once per day. Improved Evasion: You gain a +2 competence bonus on Reflex saves. Opportunist: You can use the opportunist ability as many times per round as you can make attacks of opportunity, but no more than once per creature per round. Each use of the opportunist ability counts as an attack of opportunity. Skill Mastery: When taking 10 with a skill to which you have assigned skill mastery, you can treat the die roll as a 12 instead of as a 10. (In effect, you're \"taking 12.\") Slippery Mind: You gain a +2 competence bonus on the extra save granted by slippery mind.",
    aptitudes: ["General"],
    requirements: [
      gte("classes.rogue.level", 10),
    ],
  },
  {
    name: "Second Impression",
    description: "If an observer sees through your disguise with a successful Spot check, you can (as an immediate action) attempt a Bluff check to convince him that he's mistaken. Use the observer's Spot check result as the DC for your Bluff check; if you succeed, the observer ignores the evidence of his own senses in favor of what your disguise attempts to show. You must be aware of the observer's discovery in order to use this trick; for example, you can't use it against someone viewing you secretly, nor can you use it against someone who sees through your disguise but keeps that information secret. When in doubt, the DM should allow a character to use this trick if she has any reason to fear that her cover has been blown. You can use this trick only once per day, but its effect extends to all viewers within 30 feet of you. For example, you could attempt it against an entire patrol of guards confronting you just as effectively as against a single person. This trick doesn't let you maintain a disguise that has been defeated by other means; for example, if your disguise self spell is penetrated by a true seeing spell, Second Impression won't help.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.bluff.rank", 5),
      gte("skills.disguise.rank", 5),
    ],
  },
  {
    name: "Shrouded Dance",
    description: "As a move action, you can attempt a DC 20 Hide check. If you succeed, you have concealment until the start of your next turn.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.hide.rank", 8),
      gte("skills.perform.rank", 5),
    ],
  },
  {
    name: "Slipping Past",
    description: "As a swift action, you can ignore the additional movement movement cost and penalty on attack rolls and to AC when squeezing through a narrow space (PH 148). The benefit lasts until the start of your next turn.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.escapeartist.rank", 5),
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Social Recovery",
    description: "If your Diplomacy check to influence an NPC's attitude fails, you can spend another full round talking to the NPC, then make a Bluff check with a -10 penalty. Use the result of this check in place of the Diplomacy check result, except that it can't improve the NPC's attitude by more than one step. Once you use this skill trick (successfully or not), you cannot use it against the same target again for 24 hours.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.bluff.rank", 8),
      gte("skills.diplomacy.rank", 5),
    ],
  },
  {
    name: "Speedy Ascent",
    description: "If you succeed on a Climb check to move at least 10 feet, you can move an extra 10 feet as part of that action.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 5),
    ],
  },
  {
    name: "Spot the Weak Point",
    description: "As a standard action, you can attempt a Spot check to find a weakness in your opponent's defenses. The DC of this check equals the opponent's AC. If the check succeeds, your next attack against that opponent (which must be made no later than your next turn) is treated as a touch attack. If you use a ranged weapon to deliver the attack, your opponent must be within 30 feet of you in order for you to benefit from the trick.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spot.rank", 12),
    ],
  },
  {
    name: "Sudden Draw",
    description: "If an opponent provokes an attack of opportunity from you, you can draw a weapon that you have successfully concealed using Sleight of Hand (PH 81) as an immediate action to deliver the attack of opportunity with that weapon. That opponent is treated as flat-footed against the attack with the concealed weapon.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.quickdraw.possessed"),
      gte("skills.sleightofhand.rank", 8),
    ],
  },
  {
    name: "Sure Hand",
    description: "You immediately learn up to two manipulation skill tricks at no cost, and your limit on skill tricks known increases by one. See for details on manipulation skill tricks.",
    aptitudes: ["General"],
  },
  {
    name: "Sweet Talker",
    description: "You immediately learn up to two interaction skill tricks at no cost, and your limit on skill tricks known increases by one. See for details on interaction skill tricks.",
    aptitudes: ["General"],
  },
  {
    name: "Swift Ambusher",
    description: "Your rogue and scout levels stack for the purpose of determining the extra damage and bonus to Armor Class granted when skirmishing. For example, a 4th-level scout/7th-level rogue would deal an extra 3d6 points of damage and gain a +3 competence bonus to AC when skirmishing, as if she were an 11th-level scout. In addition, you can qualify for ambush feats as if your sneak attack bonus damage were the sum of your skirmish damage and sneak attack bonus damage. You cannot sacrifice skirmish extra damage to use those feats, however.",
    aptitudes: ["General"],
    requirements: [
      gte("feats.sneakattack.count", 1),
      gte("feats.skirmish.count", 1),
    ],
  },
  {
    name: "Swift Concentration",
    description: "You can maintain concentration on a spell or similar effect as a swift action.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.concentration.rank", 12),
    ],
  },
  {
    name: "Swift Hunter",
    description: "Your ranger and scout levels stack for the purpose of determining the extra damage and bonus to Armor Class granted when skirmishing. For example, a 4th-level scout/1st-level ranger would deal an extra 2d6 points of damage and gain a +1 competence bonus to AC when skirmishing, as if she were a 5th-level scout. Your ranger and scout levels also stack for the purpose of determining when you select additional favored enemies, as well as the total bonus granted against your favored enemies. For example, a 4th-level scout/1st-level ranger would have two favored enemies and could allocate an extra +2 bonus against one of those favored enemies, as if she were a 5th-level ranger. In addition, your skirmish extra damage applies against any creature you have selected as a favored enemy, even if it is normally immune to extra damage from critical hits or skirmish attacks.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.favoredenemy.possessed"),
      gte("feats.skirmish.count", 1),
    ],
  },
  {
    name: "Timely Misdirection",
    description: "If you succeed on a Bluff check to feint in combat (PH 68), your opponent can't make any attacks of opportunity against you until the start of its next turn. This effect is in addition to the normal benefits of a successful feint.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.bluff.rank", 8),
    ],
  },
  {
    name: "Tumbling Crawl",
    description: "By succeeding on a DC 15 Tumble check, you can crawl 5 feet as a move action without provoking attacks of opportunity. Crawling normally provokes attacks of opportunity from any attackers who threaten you at any point during your crawl (PH 142).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Twisted Charge",
    description: "When you charge, you can make one turn of up to 90 degrees during your movement. You can't move more than your speed as part of this charge. All other restrictions on charges still apply, and you must have line of sight to the opponent at the start of your turn.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.balance.rank", 5),
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Up the Hill",
    description: "You can move up a steep slope or stairs at your normal speed instead of at half speed. This effect lasts for 1 round.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.balance.rank", 5),
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Walk the Walls",
    description: "You can move up a wall without making a Climb check. Each 5 feet of vertical movement costs you 4 squares of movement, and you must begin and end your turn on a horizontal surface.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 12),
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Wall Jumper",
    description: "If you have succeeded on a Climb check to ascend or descend a wall during this or your previous turn, you can leap horizontally from that wall as if you had a running start.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 5),
      gte("skills.jump.rank", 5),
    ],
  },
  {
    name: "Whip Climber",
    description: "You can use a whip as a makeshift grappling hook, lashing it around a protrusion or other firm, weightbearing object in order to climb a wall or swing across a chasm. You make Climb checks using the whip as if it were a normal rope. Using this feat requires a Use Rope check as normal for securing a grappling hook (PH 86) but takes only a move action.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.userope.rank", 5),
    ],
  },
];

export const LUCK_FEATS: FeatSeed[] = [
  {
    name: "Advantageous Avoidance",
    description: "You can expend one luck reroll as an immediate action to force a foe to reroll a critical hit confirmation roll made when attacking you. You can expend two luck rerolls as an immediate action to force a foe to reroll an attack roll made against you. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Better Lucky than Good",
    description: "If you roll a natural 1 when making an attack roll, you can expend one luck reroll as a swift action to instead treat the roll as a natural 20. You can use this feat once per day. You gain one luck reroll per day",
    aptitudes: ["General"],
    requirements: [
      gte("identity.meta.level", 6),
    ],
  },
  {
    name: "Dumb Luck",
    description: "If you roll a natural 1 when making a saving throw, you can expend one luck reroll as an immediate action to instead trear the roll as a natural 20.You can use this feat once per day.You gain one luck reroll per day.",
    aptitudes: ["General"],
    requirements: [
      gte("identity.meta.level", 6),
    ],
  },
  {
    name: "Fortuitous Strike",
    description: "You can expend one luck reroll as a swift action to reroll a weapon damage roll. You can expend two luck rerolls as a swift action to reroll an attack roll. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Good Karma",
    description: "You can expend one luck reroll as an immediate action to redirect an attack made against an adjacent ally so that it is made against you instead. You must be within reach of the attacker (if a melee attack) or within range of the attack (if a ranged attack) in order to use this ability. The attack roll result remains the same, but it is against your AC, rather than that of your ally. If the redirected attack hits you, you take an extra 50% damage from it. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Healer's Luck",
    description: "You can expend one luck reroll as a swift action to reroll the number of points of damage healed by a conjuration (healing) spell you have just cast on your current turn. You gain one luck reroll per day",
    aptitudes: ["General"],
  },
  {
    name: "Lucky Break",
    description: "You can expend one luck reroll as a swift action to reroll a Strength check made to break an item or burst open a door. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Lucky Catch",
    description: "You can expend one luck reroll as an immediate action to reroll a Balance, Climb, or Jump check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Lucky Fingers",
    description: "You can expend one luck reroll as an immediate action to reroll a Disable Device, Open Lock, or Sleight of Hand check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Lucky Start",
    description: "You can expend one luck reroll to reroll an initiative check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Magical Fortune",
    description: "You can expend one luck reroll as a swift action to reroll the damage dealt by a spell you have just cast. You can expend two luck rerolls as a swift action to reroll a caster level check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Miser's Fortune",
    description: "Whenever an opponent makes a sunder attack or Strength check to damage an object within 30 feet of you, you can expend one luck reroll as an immediate action to force that opponent to reroll.In addition, as long as you still have one luck reroll remaining for the day, items in your possession receive a +5 luck bonus on saving throws.You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Psychic Luck",
    description: "You can expend one luck reroll as a swift action to reroll the damage dealt by a psionic power you have just manifested. You can expend two luck rerolls as a swift action to reroll a manifester level check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Sly Fortune",
    description: "You can expend one luck reroll as an immediate action to reroll a Hide, Move Silently, or Tumble check. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Survivor's Luck",
    description: "You can expend one luck reroll as an immediate action to reroll a saving throw you just failed. You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Tempting Fate",
    description: "You can expend a luck reroll to reroll a stabilization check. In addition, once per day, whenever you have at least 1 hit point remaining and would be dealt enough damage to kill you, you can expend one luck reroll as an immediate action to take only enough damage to reduce you to -9 hit points. You automatically stabilize. You gain one luck reroll per day.",
    aptitudes: ["General"],
    requirements: [
      gte("identity.meta.level", 6),
    ],
  },
  {
    name: "Third Time's the Charm",
    description: "You can expend one luck reroll as an immediate action to use the granted power of the Luck domain an additional time per day. You can only use this benefit immediately after using the Luck domain's granted power (in effect, this feat gives you a third chance to succeed on the roll). You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
  {
    name: "Unbelievable Luck",
    description: "As long as you have at least one luck reroll remaining for the day, you gain a +2 luck bonus on whichever of your saves has the lowest base bonus. If two or more of your saves tie for the lowest base bonus, choose when you select this feat which save it applies to. If your base save bonuses later change so that the chosen save no longer has the lowest base bonus, the luck bonus from this feat immediately applies to the save that now has the lowest base bonus. You gain two luck rerolls per day.",
    aptitudes: ["General"],
  },
  {
    name: "Victor's Luck",
    description: "You can expend one luck reroll as a swift action to reroll a critical threat confirmation roll.You gain one luck reroll per day.",
    aptitudes: ["General"],
  },
];

export const BARDIC_FEATS: FeatSeed[] = [
  {
    name: "Chant of the Long Road",
    description: "As a standard action, you can expend one daily use of your bardic music ability to allow yourself and all allies within 60 feet to avoid taking nonlethal damage for hustling (PH 164). This requires 1 minute of performance, and the effect lasts for 1 hour.",
    aptitudes: ["General"],
  },
  {
    name: "Chord of Distraction",
    description: "As an immediate action, you can expend three daily uses of your bardic music ability to distract an opponent. The target must be within 30 feet of you and able to hear or see you. Make a Perform check, opposed by the target's Sense Motive check (modified as if you were using Bluff to feint in combat). If you succeed, that opponent is rendered flat-footed against an ally of your choice. The effect lasts until that opponent is attacked or until the start of your next turn, whichever comes first.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      gte("skills.perform.rank", 9),
    ],
  },
  {
    name: "Epic of the Lost King",
    description: "As a move action, you can expend one daily use of your bardic music ability to remove fatigue from up to three allies (including yourself) within 30 feet. If you spend three daily uses of bardic music, you can remove exhaustion from your allies instead.",
    aptitudes: ["General"],
  },
  {
    name: "Sound of Silence",
    description: "As a standard action, you can expend two daily uses of your bardic music ability to deafen a single target for 3 rounds. A successful Will save (using your Perform check result as the DC) negates the effect. The target must be within 30 feet of you and be able to hear you.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      gte("skills.perform.rank", 9),
    ],
  },
  {
    name: "Warning Shout",
    description: "As an immediate action, you can expend two daily uses of your bardic music ability to grant a single ally (other than yourself) a +5 morale bonus on her next Reflex save and evasion the monk class feature, PH 41). The ally must be within 30 feet of you and able to see or hear you. The effect lasts until the target rolls a Reflex save or until the start of your turn, whichever comes first.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      eq("feats.evasion.possessed"),
      gte("skills.perform.rank", 9),
    ],
  },
];

export const AMBUSH_FEATS: FeatSeed[] = [
  {
    name: "Concussion Attack",
    description: "Your successful sneak attack imposes a 2 penalty on the target's Intelligence and Wisdom checks, as well as on any Intelligence and Wisdom-based skill checks, for 10 rounds. If you use this feat a second time on a target before 10 rounds have elapsed, the effect of the first use expires. Using this feat reduces your sneak attack damage by 2d6.",
    aptitudes: ["General"],
    requirements: [
      gte("feats.sneakattack.count", 3),
    ],
  },
  {
    name: "Deafening Strike",
    description: "Your successful sneak attack causes the target to be deafened for 3 rounds. If you use this feat a second time on a target before 3 rounds have elapsed, the effect of the first use expires. Using this feat reduces your sneak attack damage by 3d6.",
    aptitudes: ["General"],
  },
  {
    name: "Eldritch Erosion",
    description: "Your successful sneak attack reduces your target's spell resistance and power resistance by 5 (minimum 0) for 10 rounds. If you use this feat a second time on a target before the ten rounds have elapsed, the effect of the first expires. using this reduces your sneak attack damage by 4d6",
    aptitudes: ["General"],
    requirements: [
      gte("skills.knowledgearcana.rank", 1),
      gte("feats.sneakattack.count", 4),
    ],
  },
  {
    name: "Impeding Attack",
    description: "Your successful sneak attack imposes a -2 penalty on the target's Strength and Dexterity checks, as well as on any Strength- and Dexterity-based skill checks, for 10 rounds. If you use this feat a second time on a target before 10 rounds have elapsed, the effect of the first use expires. Using this feat reduces your sneak attack damage by 3d6.",
    aptitudes: ["General"],
  },
  {
    name: "Merciful Strike",
    description: "Your successful sneak attack deals nonlethal damage. When using this feat, you can ignore the usual -4 penalty on attack rolls for attempting to deal nonlethal damage with a lethal weapon. Using this feat reduces your sneak attack damage by 1d6.",
    aptitudes: ["General"],
  },
  {
    name: "Mind Drain",
    description: "Your successful sneak attack drains power points from your target equal to its manifester level (minimum 1). If this attack reduces your target to 0 power points, the opponent also loses any psionic focus. A target that has no power points when you make the sneak attack is not affected by this feat. You can't use this feat on the same target more than once per round. Using this feat reduces your sneak attack damage by 1d6.",
    aptitudes: ["General"],
  },
  {
    name: "Persistent Attacker",
    description: "If your sneak attack hits, your first attack against that creature on your next turn is also considered a sneak attack even if it wouldn't normally qualify. Using this feat reduces your first sneak attack's damage by 4d6. The resulting second sneak attack deals its full extra damage.",
    aptitudes: ["General"],
  },
  {
    name: "Throat Punch",
    description: "Your successful sneak attack delivered with an unarmed strike temporarily hinders the target's ability to speak. For the next 3 rounds, the target takes a -5 penalty on any skill check requiring speech and has a 50% chance of failure when casting a spell with a verbal component or activating a magic item with a command word. Multiple uses of this feat don't increase the duration beyond 3 rounds. Using this feat reduces your sneak attack damage by 2d6.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedunarmedstrike.possessed"),
      gte("feats.sneakattack.count", 3),
    ],
  },
];

export const disembowelingStrike: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Disemboweling Strike: ${w}`,
  description: `Your successful sneak attack with a slashing weapon for which you have ${w} Focus deals 1d4 points of Constitution damage in addition to its normal damage. You can't use this feat against the same target more than once per day. Using this feat reduces your sneak attack damage by 4d6.`,
  aptitudes: ["General"],
  properties: [{ type: "FEAT_FAMILY", value: "Disemboweling Strike" }],
}));

export const headShot: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Head Shot: ${w}`,
  description: `Your successful sneak attack with a bludgeoning weapon for which you have ${w} Focus leaves your foe confused for 1 round. A successful Will save (DC 10 + the number of extra damage dice normally dealt by your sneak attack + your Dex modifier) negates this effect. If you use this feat a second time on a target before 1 round has elapsed, the effect of the first use expires. Using this feat reduces your sneak attack damage by 5d6.`,
  aptitudes: ["General"],
  properties: [{ type: "FEAT_FAMILY", value: "Head Shot" }],
}));

export const magicalAppraisal: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({
  name: `Magical Appraisal: ${s}`,
  description: `When you succeed by 5 or more on a Spellcraft check to determine the school of magic of the aura surrounding a magic item (by casting detect magic), you can then spend 1 minute concentrating to also learn the properties of the item, as if you had cast identify. You can use this skill trick once per day.`,
  aptitudes: ["General"],
  properties: [{ type: "FEAT_FAMILY", value: "Magical Appraisal" }],
}));

export const makeYourOwnLuck: FeatSeed[] = SKILL_NAMES.map((s) => ({
  name: `Make Your Own Luck: ${s}`,
  description: `You get a +3 bonus on all ${s} checks.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `skills.${stripSeparators(s)}.misc`, operator: "add", value: "3", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Make Your Own Luck" }],
}));
