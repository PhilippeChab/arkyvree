import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { eq, gte, or } from "@/database/packages/dnd35/seed-utils.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/v1/feats/skills.ts";
import { stripSeparators } from "@/shared/utils.ts";

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Appraise Magic Value",
    description: "If you know that an item is magical, you can use the Appraise skill to identify the item's properties. This use of the Appraise skill requires 8 hours of uninterrupted work and consumes 25 gp worth of special materials. The DC of the Appraise check is 10 + the caster level of the item.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.appraise.rank", 5),
      gte("skills.knowledgearcana.rank", 5),
      gte("skills.spellcraft.rank", 5),
    ],
  },
  {
    name: "Ascetic Hunter",
    description: "When you use an unarmed strike to deliver a stunning attack against a favored enemy, you can add one-half your favored enemy bonus on damage rolls to the DC of your stunning attempt. If you have levels in ranger and monk, those levels stack for the purpose of determining your unarmed strike damage. For example, a human 7th-level ranger/1stlevel monk would deal 1d10 points of damage with her unarmed strike. In addition, you can multiclass freely between the monk and ranger classes. You must still remain lawful in order to retain your monk abilities and take monk levels. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Ascetic Knight",
    description: "Your paladin and monk levels stack for the purpose of determining your unarmed strike damage. For example, a human 3rd-level paladin/1st-level monk would deal 1d8 points of damage with her unarmed strike. Your paladin and monk levels also stack when determining the extra damage dealt by your smite evil ability. In addition, you can multiclass freely between the paladin and monk classes. You must still remain lawful good in order to retain your paladin abilities and take paladin levels, and you must remain lawful in order to continue advancing as a monk. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Ascetic Mage",
    description: "As a swift action that doesn't provoke attacks of opportunity, you can sacrifice one of your daily allotment of spells to add a bonus to your unarmed strike attack rolls and damage rolls for 1 round. The bonus is equal to the level of the spell sacrificed. The spell is lost as if you had cast it. If you have levels in sorcerer and monk, those levels stack for the purpose of determining your AC bonus. For example, a human 4th-level sorcerer/1st-level monk would have a +1 bonus to AC as if she were a 5th-level monk. If you would normally be allowed to add your Wisdom bonus to AC (such as for a unarmored, unencumbered monk), you instead add your Charisma bonus (if any) to your AC. In addition, you can multiclass freely between the sorcerer and monk classes. You must still remain lawful in order to continue advancing as a monk. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Ascetic Rogue",
    description: "When you use an unarmed strike with a sneak attack to deliver a stunning attack, you add 2 to the DC of your stunning attempt. If you have levels in rogue and monk, those levels stack for the purpose of determining your unarmed strike damage. For example, a human 5th-level rogue/1st-level monk would deal 1d8 points of damage with her unarmed strike. In addition, you can multiclass freely between the monk and rogue classes. You must still remain lawful in order to retain your monk abilities and take monk levels. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Brachiation",
    description: "You can move through wooded areas at your base land speed, ignoring any effects on movement due to terrain. You must be at least 20 feet from the ground to use this ability. This ability works only in medium and dense forests",
    aptitudes: ["General"],
    requirements: [
      gte("skills.climb.rank", 4),
      gte("skills.jump.rank", 4),
    ],
  },
  {
    name: "Brutal Throw",
    description: "You can add your Strength modifier (instead of your Dexterity modifier) to attack rolls with thrown weapons.",
    aptitudes: ["General", "Fighter Bonus Feat"],
  },
  {
    name: "Combat Intuition",
    description: "As a free action, you can use Sense Motive to assess the challenge presented by a single opponent in relationship to your own level/Hit Dice. You gain a +4 bonus on such checks and narrow the result to a single category. In addition, whenever you make a melee attack against a creature that you made a melee attack against during the previous round, you gain a +1 insight bonus on your melee attack rolls against that creature.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 5),
      gte("skills.sensemotive.rank", 4),
    ],
  },
  {
    name: "Danger Sense",
    description: "Once per day, you can reroll an initiative check you have just made. You use the better of your two rolls. You must decide to reroll before the round starts.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.improvedinitiative.possessed"),
    ],
  },
  {
    name: "Death Blow",
    description: "You can perform a coup de grace attack against a helpless defender as a standard action. Doing this still provokes attacks of opportunity as normal.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      eq("feats.improvedinitiative.possessed"),
    ],
  },
  {
    name: "Deft Opportunist",
    description: "You get a +4 bonus on attack rolls when making attacks of opportunity.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 15),
      eq("feats.combatreflexes.possessed"),
    ],
  },
  {
    name: "Deft Strike",
    description: "As a standard action, you can attempt to find a weak point in a visible target's armor. This requires a Spot check against a DC equal to your target's Armor Class. If you succeed, your next attack against that target (which must be made no later than your next turn) ignores the target's armor bonus and natural armor bonus to AC (including any enhancement bonuses to armor or natural armor). Other AC bonuses still apply normally. If you use a ranged weapon to deliver the attack, your opponent must be within 30 feet of you in order for you to benefit from this feat.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.intelligence.total", 13),
      eq("feats.combatexpertise.possessed"),
      gte("skills.spot.rank", 10),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Devoted Inquisitor",
    description: "When you successfully use your sneak attack ability and your smite evil ability against the same foe in a single attack, you can potentially daze your foe. An opponent affected by both abilities must make a Will saving throw (DC 10 + 1/2 your character level + your Cha modifier) or be dazed for 1 round. In addition, you can multiclass freely between the paladin and rogue classes. You must still remain lawful good in order to retain your paladin abilities and take paladin levels. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.smiteevil.possessed"),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Devoted Performer",
    description: "If you have levels in paladin and bard, those levels stack for the purpose of determining the bonus damage dealt by your smite evil ability and determining the number of times per day that you can use your bardic music. This feat does not allow additional daily uses of smite evil or bardic music abilities beyond what your class levels would normally allow. In addition, you can multiclass freely between the paladin and bard classes and may even gain additional bard levels regardless of your lawful alignment. You must still remain lawful good in order to retain your paladin abilities and take paladin levels. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
    ],
  },
  {
    name: "Devoted Tracker",
    description: "If you have levels in paladin and ranger, those levels stack for the purposes of determining the extra damage dealt by your smite evil ability and determining the bonus for your wild empathy class feature. This feat does not allow additional daily uses of smite evil. If you have both the special mount and animal companion class features, you can designate your special mount as your animal companion. The mount gains all the benefits of being both your special mount and your animal companion. For instance, a 5th-level paladin/6th-level ranger's special mount would have 4 bonus Hit Dice, a +6 natural armor adjustment, +2 Strength, +1 Dexterity, two bonus tricks, and Intelligence 6, as well as the empathic link, improved evasion, share spells, share saving throws, and link special abilities. In addition, you can multiclass freely between the paladin and ranger classes. You must still remain lawful good in order to retain your paladin abilities and take paladin levels. You still face the normal XP penalties for having multiple classes more than one level apart.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.track.possessed"),
    ],
    modifiers: [
      { target: "combat.ac.natural", operator: "add", value: "6", valueType: "number" },
    ],
  },
  {
    name: "Disguise Spell",
    description: "You can cast spells unobtrusively, mingling verbal and somatic components into your performances. To disguise a spell, make a Perform check as part of the action used to cast the spell. Onlookers must match or exceed your check result with a Spot check to detect that you're casting a spell (your performance is obvious to everyone in the vicinity, but the fact that you are casting a spell isn't). Unless the spell visibly emanates from you, or observers have some other means of determining its source, they don't know where the effect came from. A disguised spell can't be identified with a Spellcraft check, even by someone who realizes you're casting a spell. The act of casting still provokes attacks of opportunity as normal.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.perform.rank", 9),
    ],
  },
  {
    name: "Dive For Cover",
    description: "If you fail a Reflex saving throw, you can immediately attempt the saving throw again. You must take the second result, whether it succeeds or fails. You become prone immediately after attempting the second roll.",
    aptitudes: ["General"],
    requirements: [
      gte("saves.reflex.base", 4),
    ],
  },
  {
    name: "Dual Strike",
    description: "As a standard action, you can make a melee attack with your primary weapon and your off-hand weapon. Both attacks use the same attack roll to determine success, using the worse of the two weapons' attack modifiers. If you are using a one-handed or light weapon in your primary hand and a light weapon in your off hand, you take a -4 penalty on this attack roll; otherwise you take a -10 penalty. Each weapon deals its normal damage. Damage reduction and other resistances apply separately against each weapon attack.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.improvedtwoweaponfighting.possessed"),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Expert Tactician",
    description: "If you hit a creature with an attack of opportunity, you and all your allies gain a +2 circumstance bonus on melee attack rolls and damage rolls against that creature for 1 round.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      gte("abilities.dexterity.total", 13),
      eq("feats.combatreflexes.possessed"),
    ],
  },
  {
    name: "Extra Music",
    description: "You can use your bardic music four extra times per day.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
    ],
  },
  {
    name: "Extraordinary Concentration",
    description: "When concentrating to maintain a spell, you can make a Concentration check (DC 25 + spell level) to maintain concentration with just a move action. If you beat the DC by 10 or more, you can maintain concentration on the spell as a swift action. Using this ability is a free action, but if you fail the Concentration check, you lose concentration on the maintained spell and its effect ends. This feat does not give you the ability to maintain concentration on more than one spell at a time.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.concentration.rank", 15),
    ],
  },
  {
    name: "Extraordinary Spell Aim",
    description: "Whenever you cast a spell with an area, you can attempt to shape the spell's area so that one creature within the area is unaffected by the spell. To accomplish this, you must succeed on a Spellcraft check (DC 25 + spell level). Casting a spell affected by the Extraordinary Spell Aim feat requires a full-round action unless the spell's normal casting time is longer, in which case the casting time is unchanged.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spellcraft.rank", 15),
    ],
  },
  {
    name: "Force of Personality",
    description: "You add your Charisma modifier (instead of your Wisdom modifier) to Will saves against mind-affecting spells and abilities.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.charisma.total", 13),
    ],
  },
  {
    name: "Goad",
    description: "As a move action, you can goad an opponent that threatens you, has line of sight to you, can hear you, and has an Intelligence of 3 or higher. (The goad is a mind-affecting ability.) When the goaded opponent starts its next turn, if it threatens you and has line of sight to you, it must make a Will saving throw (DC 10 + 1/2 your character level + your Cha modifier). If the opponent fails its save, you are the only creature it can make melee attacks against during this turn. (If it kills you, knocks you unconscious, loses sight of you, or otherwise is unable to make melee attacks against you, it may make any remaining melee attacks against other foes, as normal.) A goaded creature can still cast spells, make ranged attacks, move, or perform other actions normally. The use of this feat restricts only melee attacks.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 1),
      gte("abilities.charisma.total", 13),
    ],
  },
  {
    name: "Green Ear",
    description: "You can alter any of your mind-affecting bardic music abilities (or similar Perform-based abilities from other classes) so that they influence only plant creatures instead of other creatures. However, plants receive a +5 bonus on Will saves against any of these effects.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.perform.rank", 10),
    ],
  },
  {
    name: "Hear The Unseen",
    description: "As a move action that does not provoke attacks of opportunity, you can attempt a DC 25 Listen check. If successful, you can pinpoint the location of all foes within 30 feet, as long as you have line of effect to them. This benefit does not eliminate the normal miss chance for fighting foes with concealment, but it ensures that you can target the correct square with your attacks. If you are deafened or within an area of silence, you can't use this feat. If an invisible or hidden opponent is attempting to move silently, your Listen check is opposed by your opponent's Move Silently check, but your opponent gains a +15 bonus on this check. This feat does not work against perfectly silent opponents, such as incorporeal creatures.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.blindfight.possessed"),
      gte("skills.listen.rank", 5),
    ],
  },
  {
    name: "Improved Diversion",
    description: "You can use Bluff to create a diversion to hide as a move action. You gain a +4 bonus on Bluff checks made for this purpose.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("skills.bluff.rank", 4),
    ],
    modifiers: [
      { target: "skills.bluff.misc", operator: "add", value: "4", valueType: "number" },
    ],
  },
  {
    name: "Improved Flight",
    description: "Your maneuverability class while flying improves by one step--clumsy to poor, poor to average, average to good, or good to perfect.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.abilitytoflynaturally.possessed"), eq("feats.abilitytoflymagically.possessed"), eq("feats.abilitytoflythroughshapechanging.possessed")),
    ],
  },
  {
    name: "Improved Swimming",
    description: "You can swim half your speed as a move action or your speed as a full-round action.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.swim.rank", 6),
    ],
  },
  {
    name: "Insightful Reflexes",
    description: "You add your Intelligence modifier (instead of your Dexterity modifier) to Reflex saves.",
    aptitudes: ["General"],
  },
  {
    name: "Leap Attack",
    description: "If you cover at least 10 feet of horizontal distance with your jump, and you end your jump in a square from which you threaten your target, you deal +100% the normal bonus damage from your use of the Power Attack feat. This attack must follow all the normal rules for using the Jump skill and for making a charge, except that you ignore rough terrain in any squares you jump over.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.powerattack.possessed"),
      gte("skills.jump.rank", 8),
    ],
  },
  {
    name: "Lingering Song",
    description: "If you use bardic music to inspire courage, inspire greatness, or inspire heroics, the effect lasts for 1 minute after an inspired ally stops hearing you play.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
    ],
  },
  {
    name: "Mobile Spell-Casting",
    description: "You can make a special Concentration check (DC 20 + spell level) when casting a spell. If the check succeeds, you can cast the spell and move up to your speed as a single standard action. (You can't use this ability to cast a spell that takes longer than 1 standard action to cast.) If the check fails, you lose the spell and fail to cast it, just as if you had failed a Concentration check to cast the spell defensively. You still provoke attacks of opportunity for casting spells from any creatures who threaten you at any point of your movement. You can cast defensively while using this feat, but doing so increases the Concentration DC to 25 + spell level.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.concentration.rank", 8),
    ],
  },
  {
    name: "Natural Bond",
    description: "Add three to your effective druid level for the purpose of determining the bonus Hit Dice, extra tricks, special abilities, and other bonuses that your animal companion receives. This bonus can never make your effective druid level exceed your character level.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.animalcompanion.possessed"),
    ],
  },
  {
    name: "Obscure Lore",
    description: "You gain a +4 insight bonus on checks using your bardic knowledge or lore class feature.",
    aptitudes: ["General"],
  },
  {
    name: "Open Minded",
    description: "You immediately gain 5 skill points. Spend these skill points as normal. You cannot exceed the normal maximum ranks for your level in any skill.",
    stackable: true,
    aptitudes: ["General"],
  },
  {
    name: "Oversized Two-Weapon Fighting",
    description: "When wielding a one-handed weapon in your off hand, you take penalties for fighting with two weapons as if you were wielding a light weapon in your off hand.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Polyglot",
    description: "You can speak all languages. If you are literate, you can also read and write all languages (not including magical script).",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.intelligence.total", 25),
      eq("feats.speaklanguagefivelanguages.possessed"),
    ],
  },
  {
    name: "Power Throw",
    description: "On your turn, before making any attack rolls, you can choose to subtract a number from all thrown weapon attack rolls and add the same number to all thrown weapon damage rolls. This number may not exceed your base attack bonus. The penalty on attack rolls and the bonus on damage rolls applies until your next turn.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.brutalthrow.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Quick Reconnoiter",
    description: "You can make one Spot check and one Listen check each round as a free action. You also gain a +2 bonus on initiative checks.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.listen.rank", 5),
      gte("skills.spot.rank", 5),
    ],
    modifiers: [
      { target: "combat.initiative.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Razing Strike",
    description: "To activate this feat, you must sacrifice one of your daily allotment of spells (minimum spell level 1st). Doing this is a swift action that doesn't provoke attacks of opportunity. In exchange, you gain an insight bonus on your melee attack rolls and damage rolls for 1 round. The bonus on attack rolls equals the level of the spell sacrificed. The bonus on damage rolls is 1d6 points per level of the spell sacrificed, plus any extra damage based on your sneak attack ability. These bonuses apply against only one type of creature, depending on the type of spell sacrificed. If you sacrifice an arcane spell, they apply against constructs; if the sacrificed spell is divine, the bonuses apply against undead. Example: A 5th-level wizard/1st-level rogue activates this feat, sacrificing a prepared web spell. She gains a +2 insight bonus on her melee attack rolls against constructs for 1 round, and also adds 3d6 points of damage to successful attacks against constructs during that round (2d6 for the 2nd-level spell, plus 1d6 for her sneak attack damage). This feat does not allow you to deliver critical hits or sneak attacks against constructs or undead.",
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 5), gte("spellcasting.divine", 5)),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Staggering Strike",
    description: "If you deal damage with a melee sneak attack, you can also deliver a wound that limits your foe's mobility. For 1 round (or until the target is the beneficiary of a DC 15 Heal check or any magical healing that restores at least 1 hit point, whichever comes first), your target is treated as if it were staggered, even if its nonlethal damage doesn't exactly equal its current hit points. A target can resist this effect by making a successful Fortitude save (DC equal to damage dealt). Multiple staggering strikes on the same creature do not stack. This feat has no effect on creatures not subject to sneak attack damage.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Subsonics",
    description: "You can produce music or poetics so subtly that opponents do not notice it, yet your allies still gain all the usual benefits from your bardic music. Similarly, you can affect opponents within range with your music, but unless they can see you performing or have some other means of discovering it, they cannot determine the source of the effect.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.perform.rank", 10),
    ],
  },
  {
    name: "Tactile Trapsmith",
    description: "You add your Dexterity bonus (rather than your Intelligence bonus) on all Search and Disable Device checks. In addition, you receive no penalty on these checks for darkness or blindness.",
    aptitudes: ["General"],
  },
  {
    name: "Versatile Performer",
    description: "Pick a number of Perform categories equal to your Intelligence bonus (minimum 1). For the purpose of making Perform checks, you are treated as having a number of ranks in those skills equal to the highest number of ranks you have in any Perform category. You cannot change these categories once you have picked them, but your score in them automatically increases if you later add additional ranks in your highestranked Perform category. You gain new categories of your choice if your Intelligence bonus permanently increases. In addition, you gain a +2 bonus on a combined Perform check when using two or more forms of performance at the same time, such as a bard strumming a lyre while singing. In such cases, add the bonus to the higher of your two Perform skill modifiers.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.perform.rank", 5),
    ],
  },
];

export const WILD_FEATS: FeatSeed[] = [
  {
    name: "Blindsense",
    description: "You can expend one daily use of wild shape to gain blindsense for 1 minute per Hit Die, enabling you to pinpoint the location of a creature within 30 feet if you have line of effect to that creature. You retain this benefit regardless of what form you are in.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.listen.rank", 4),
    ],
  },
  {
    name: "Climb like an Ape",
    description: "You can expend one daily use of wild shape to gain a climb speed equal to your base land speed for 10 minutes per Hit Die. This feat also grants you a +8 racial bonus on Climb checks and allows you to take 10 on Climb checks, even if rushed or threatened.",
    aptitudes: ["General"],
  },
  {
    name: "Cougar's Vision",
    description: "You can expend one daily use of wild shape to gain low-light vision for 1 hour per Hit Die. In addition, you gain a +4 bonus on all Spot checks. You retain these benefits regardless of what form you are in.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spot.rank", 2),
    ],
    modifiers: [
      { target: "skills.spot.misc", operator: "add", value: "4", valueType: "number" },
    ],
  },
  {
    name: "Hawk's Vision",
    description: "You can expend one of your daily uses of wild shape to gain a +8 bonus on your Spot checks for 1 hour per Hit Die. While this benefit is in effect, you take only half the normal penalty for range increment (-1 on ranged attacks per range increment instead of -2), and you take a -1 penalty on Spot checks per 20 feet of distance (rather than per 10 feet). You retain these benefits regardless of what form you are in.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.spot.rank", 4),
    ],
  },
  {
    name: "Savage Grapple",
    description: "While you are in a wild shape, any time you make a successful grapple check to damage a creature with which you are already grappling, you can add your sneak attack damage as well. Creatures not subject to sneak attacks don't take this extra damage.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Scent",
    description: "You can expend one daily use of wild shape to gain the scent ability for 1 hour per Hit Die. While this benefit is in effect, you can detect opponents within 30 feet by sense of smell. In addition, if you have the Track feat, you can track creatures by scent. You retain this benefit regardless of what form you are in.",
    aptitudes: ["General"],
  },
];

export const BARDIC_FEATS: FeatSeed[] = [
  {
    name: "Chant of Fortitude",
    description: "You can expend one daily use of your bardic music ability as an immediate action to provide all allies (including yourself) the benefit of the Diehard feat until the end of your next turn. You can use this feat multiple times consecutively to keep yourself and your allies conscious. Even while this feat is active, you or your allies die if reduced to -10 hit points or lower. This feat does not function in an area of magical silence.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      gte("skills.concentration.rank", 9),
      gte("skills.perform.rank", 9),
    ],
  },
  {
    name: "Ironskin Chant",
    description: "As a swift action that does not provoke attacks of opportunity, you can expend one daily use of your bardic music ability to provide damage reduction of 5/-- to yourself or to one ally within 30 feet who can hear you until the start of your next turn. This feat does not function in an area of magical silence.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      gte("skills.concentration.rank", 12),
      gte("skills.perform.rank", 12),
    ],
  },
  {
    name: "Lyric Spell",
    description: "You can expend daily uses of your bardic music to cast any arcane spell that you know and can cast spontaneously. You must still use an action to cast the spell (following the normal rules for casting time), but using the Lyric Spell feat counts as part of the spellcasting action. Casting a spell requires one use of your bardic music ability, plus one additional use per level of the spell. For example, casting a 3rd-level spell requires four daily uses of your bardic music ability.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.bardicmusic.possessed"),
      gte("skills.perform.rank", 9),
    ],
  },
];

export const jackOfAllTrades: FeatSeed[] = SKILL_NAMES.map((s) => ({
  name: `Jack of All Trades: ${s}`,
  description: `You get a +3 bonus on all ${s} checks.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `skills.${stripSeparators(s)}.misc`, operator: "add", value: "3", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Jack of All Trades" }],
}));
