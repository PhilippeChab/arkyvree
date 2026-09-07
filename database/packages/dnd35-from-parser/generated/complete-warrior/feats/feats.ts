import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { eq, eqStr, feat, gte, or } from "@/database/packages/dnd35/seed-utils.ts";
import { ALL_WEAPONS } from "@/database/packages/dnd35/v1/feats/weapons.ts";

export const STYLE_FEATS: FeatSeed[] = [
  {
    name: "Anvil of Thunder",
    description: "When you land blows on the same target with both your axe and hammer during a single round, that creature must succeed on a Fortitude save (DC 10 + half your character level + your Str modifier) or become dazed for 1 round.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 13),
      or(eq("feats.weaponfocuswarhammer.possessed"), eq("feats.weaponfocuslighthammer.possessed")),
      or(eq("feats.weaponfocusbattleaxe.possessed"), eq("feats.weaponfocushandaxe.possessed"), eq("feats.weaponfocusdwarvenwaraxe.possessed")),
      eq("feats.improvedsunder.possessed"),
      eq("feats.powerattack.possessed"),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Bear Fang",
    description: "When you strike the same creature with both your axe and dagger in one round, you deal standard damage with each weapon and may then initiate a grapple as a free action that does not provoke attacks of opportunity, functioning like the improved grab ability. No touch attack is needed. If the grapple succeeds, you release your axe and immediately gain a bonus dagger attack at your highest base attack bonus (subject to the standard -4 grapple attack penalty). On later rounds, you may continue attacking with your dagger while grappling at the usual penalty.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 15),
      or(eq("feats.weaponfocusbattleaxe.possessed"), eq("feats.weaponfocushandaxe.possessed"), eq("feats.weaponfocusdwarvenwaraxe.possessed")),
      eq("feats.powerattack.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocusdagger.possessed"),
    ],
  },
  {
    name: "Crescent Moon",
    description: "When you hit the same creature with both your sword and your dagger within a single round, you may immediately attempt a disarm as a free action.",
    aptitudes: ["General"],
    requirements: [
      or(
        eq("feats.weaponfocusbastardsword.possessed"),
        eq("feats.weaponfocuslongsword.possessed"),
        eq("feats.weaponfocusscimitar.possessed"),
        eq("feats.weaponfocusshortsword.possessed"),
      ),
      eq("feats.improveddisarm.possessed"),
      eq("feats.improvedtwoweaponfighting.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocusdagger.possessed"),
    ],
  },
  {
    name: "Hammer's Edge",
    description: "When you strike the same creature with both your sword and hammer in one round, the target must succeed on a Fortitude save (DC 10 + half your character level + your Str modifier) or be knocked prone.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 15),
      or(eq("feats.weaponfocusbastardsword.possessed"), eq("feats.weaponfocuslongsword.possessed"), eq("feats.weaponfocusscimitar.possessed")),
      or(eq("feats.weaponfocuswarhammer.possessed"), eq("feats.weaponfocuslighthammer.possessed")),
      eq("feats.improvedbullrush.possessed"),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "High Sword Low Axe",
    description: "When you hit the same creature with both your sword and axe during a single round, you may attempt a free trip attack against that foe. On success, you may follow up with the bonus attack granted by Improved Trip.",
    aptitudes: ["General"],
    requirements: [
      or(
        eq("feats.weaponfocusbastardsword.possessed"),
        eq("feats.weaponfocuslongsword.possessed"),
        eq("feats.weaponfocusscimitar.possessed"),
        eq("feats.weaponfocusshortsword.possessed"),
      ),
      or(eq("feats.weaponfocusbattleaxe.possessed"), eq("feats.weaponfocushandaxe.possessed"), eq("feats.weaponfocusdwarvenwaraxe.possessed")),
      eq("feats.improvedtrip.possessed"),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Lightning Mace",
    description: "Whenever you roll a critical threat on an attack while wielding a light mace in each hand, you gain an immediate additional attack at the same attack bonus.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.combatreflexes.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocuslightmace.possessed"),
    ],
  },
  {
    name: "Net and Trident",
    description: "As a full-round action, you may combine attacks with your net and trident. Throw the net first; if it hits and you win the opposed Strength check to control the target, you may immediately take a 5-foot step toward the entangled foe and deliver a full attack with your trident.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 15),
      eq("feats.exoticweaponproficiencynet.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocustrident.possessed"),
    ],
  },
  {
    name: "Quick Staff",
    description: "When using Combat Expertise while wielding a quarterstaff, your dodge bonus to AC exceeds the attack roll penalty by 2. For instance, accepting a -1 attack penalty yields a +3 dodge bonus.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.combatexpertise.possessed"),
      eq("feats.dodge.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocusquarterstaff.possessed"),
    ],
  },
  {
    name: "Spinning Halberd",
    description: "During a full attack with a halberd, you receive a +1 dodge bonus to AC and gain an extra attack at a -5 penalty. The additional strike deals bludgeoning damage equal to 1d6 + half your Strength modifier.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.combatreflexes.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.weaponfocushalberd.possessed"),
    ],
  },
  {
    name: "Three Mountains",
    description: "If you hit the same creature twice in one round with a heavy mace, morningstar, or greatclub, that creature must succeed on a Fortitude save (DC 10 + half your character level + your Str modifier) or be nauseated for 1 round due to pain.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 13),
      or(eq("feats.weaponfocusheavymace.possessed"), eq("feats.weaponfocusmorningstar.possessed"), eq("feats.weaponfocusgreatclub.possessed")),
      eq("feats.cleave.possessed"),
      eq("feats.improvedbullrush.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
];

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Arcane Strike",
    description: "Activating this feat is a free action that does not provoke attacks of opportunity. You infuse arcane power into a melee weapon, unarmed strike, or natural weapon by expending a prepared spell or spell slot of 1st level or higher. For 1 round, you receive a bonus on all attack rolls equal to the sacrificed spell's level, plus bonus damage of 1d4 per spell level sacrificed. The attack roll bonus granted by this feat cannot exceed your base attack bonus.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      gte("spellcasting.arcane", 3),
    ],
  },
  {
    name: "Arterial Strike",
    description: "On a successful sneak attack, you may sacrifice +1d6 of your bonus sneak attack damage to inflict a bleeding wound. This wound causes 1 hit point of damage each round until the target receives a DC 15 Heal check, a cure spell, or other magical healing. Bleeding from multiple applications of this ability stacks (for instance, two bleeding wounds deal 2 damage per round). Only one bleeding wound can be inflicted per sneak attack.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Axiomatic Strike",
    description: "You can deliver an unarmed strike against a chaotic-aligned foe that inflicts an additional 2d6 points of damage. You must announce the use of this ability prior to rolling your attack (a miss wastes the attempt). Each use expends one daily use of your Stunning Fist ability. This bonus damage applies even to creatures that are immune to stunning.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.stunningfist.possessed"),
      eq("feats.kistrikelawful.possessed"),
    ],
  },
  {
    name: "Cavalry Charger",
    description: "This feat grants access to three tactical options. Unhorse: While mounted, you charge a mounted enemy. If your charge attack connects, you may attempt a free bull rush. Success moves the rider but leaves the mount in place. Leaping Charge: While mounted, you charge a foe at least one size category smaller than your mount. At the end of the charge's movement, make a Ride check: DC 10 to deal 2 extra damage, or DC 20 to deal 4 extra damage. Failure means you miss entirely, and failing by 5 or more causes you to fall from your mount into an adjacent square. Fell Trample: You may attempt mounted overrun attacks against multiple opponents in sequence. Your mount receives a hoof attack against each foe you successfully overrun.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.mountedcombat.possessed"),
      eq("feats.spiritedcharge.possessed"),
      eq("feats.trample.possessed"),
    ],
  },
  {
    name: "Clever Wrestling",
    description: "When grappling an opponent larger than Medium, you receive a circumstance bonus on grapple checks made to escape a grapple or pin. The bonus scales with your opponent's size: +2 versus Large, +4 versus Huge, +6 versus Gargantuan, and +8 versus Colossal creatures.",
    aptitudes: ["General"],
    requirements: [
      or(eqStr("identity.physiology.race.size", "Small"), eqStr("identity.physiology.race.size", "Medium")),
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Close-Quarters Fighting",
    description: "Whenever an enemy tries to grapple you, you receive an attack of opportunity against it, even if it possesses a feat or special ability that would normally prevent this. If your attack of opportunity deals damage and the enemy lacks Improved Grapple or a special grappling ability like improved grab, the grapple attempt automatically fails. If the enemy does have such an ability, you add the damage dealt as a bonus to your opposed grapple check to resist. This feat does not increase your maximum number of attacks of opportunity per round, nor does it function when you would otherwise be denied attacks of opportunity.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 3),
    ],
  },
  {
    name: "Combat Brute",
    description: "This feat provides three tactical options. Advancing Blows: After a successful bull rush, during the following round all your attacks against the pushed foe gain a +1 bonus to attack and damage rolls per square you pushed them. Sundering Cleave: When you destroy an opponent's weapon or shield via a sunder attempt, you immediately gain an extra melee attack against that foe at the same attack bonus used for the sunder. Momentum Swing: If you charged on the previous round and use Power Attack on the current round with a penalty of -5 or worse, your Power Attack damage multiplier becomes x1.5 (or x3 with a two-handed weapon or one-handed weapon wielded in two hands).",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.improvedsunder.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Dash",
    description: "While wearing light or no armor and carrying no more than a light load, your movement speed increases by 5 feet.",
    aptitudes: ["General"],
    modifiers: [
      { target: "combat.speed.misc", operator: "add", value: "5", valueType: "number" },
    ],
  },
  {
    name: "Defensive Strike",
    description: "When you are using the total defense action and an opponent's attack against you misses, you gain a +4 bonus on your attack roll against that opponent during your next turn. No bonus is gained against foes who do not attack you or whose attacks hit.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("abilities.dexterity.total", 13),
      gte("abilities.intelligence.total", 13),
      eq("feats.combatexpertise.possessed"),
      eq("feats.dodge.possessed"),
    ],
  },
  {
    name: "Defensive Throw",
    description: "If the opponent you designated with your Dodge feat attacks you and misses, you may immediately attempt a trip attack against that foe. This trip attempt counts against your attacks of opportunity for the round.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 13),
      eq("feats.combatreflexes.possessed"),
      eq("feats.dodge.possessed"),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.improvedtrip.possessed"),
    ],
  },
  {
    name: "Destructive Rage",
    description: "While raging or in a frenzy, you gain a +8 bonus on Strength checks to break down doors or smash immobile, inanimate objects.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.ragebarbarian.possessed"),
    ],
  },
  {
    name: "Eagle Claw Attack",
    description: "When you make an unarmed strike targeting an object, you may add your Wisdom bonus to the damage dealt to that object.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 13),
      eq("feats.improvedsunder.possessed"),
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Earth's Embrace",
    description: "While grappling, whenever you successfully pin an opponent, you inflict an additional 1d12 damage each round the pin is maintained. You must keep your opponent immobile via opposed grapple checks as usual, and you yourself must also remain stationary, which gives other attackers (not the pinned creature) a +4 bonus on attack rolls against you (though you are not considered helpless). Creatures immune to critical hits are unaffected by this extra damage.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 15),
      eq("feats.improvedgrapple.possessed"),
      eq("feats.improvedunarmedstrike.possessed"),
    ],
  },
  {
    name: "Extend Rage",
    description: "Every use of your rage or frenzy ability lasts 5 additional rounds beyond its normal duration.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.ragebarbarian.possessed"),
    ],
  },
  {
    name: "Extra Rage",
    description: "You can rage or enter a frenzy two additional times per day.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.ragebarbarian.possessed"),
    ],
  },
  {
    name: "Extra Smiting",
    description: "You gain two additional smite attempts per day, applicable to whichever smite ability you possess (such as a paladin's smite evil or similar class features).",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.smiteevilpaladin.possessed"),
    ],
  },
  {
    name: "Extra Stunning",
    description: "You gain three additional stunning attacks per day.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Eyes in the Back of Your Head",
    description: "Flanking opponents no longer receive the usual +2 attack roll bonus against you. This provides no benefit when you are denied your Dexterity bonus to AC, such as when flat-footed. You remain vulnerable to sneak attacks from flanking foes.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 1),
      gte("abilities.wisdom.total", 13),
    ],
  },
  {
    name: "Faster Healing",
    description: "You recover lost hit points and ability score damage at an accelerated rate compared to normal healing.",
    aptitudes: ["General"],
    requirements: [
      gte("saves.fortitude.base", 5),
    ],
  },
  {
    name: "Favored Power Attack",
    description: "When using Power Attack against a favored enemy, each point of attack penalty you accept yields twice that amount as bonus melee damage (or three times when wielding a weapon in two hands). Standard Power Attack restrictions still apply.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Fists of Iron",
    description: "You must declare the use of this feat before rolling your attack (a miss wastes the attempt). On a successful unarmed strike, you deal an extra 1d6 points of damage. Each use counts as one daily use of your Stunning Fist ability.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Fleet of Foot",
    description: "While running or charging, you may change direction once by up to 90 degrees. This feat cannot be used in medium or heavy armor, or with a medium or heavier load. If charging, you must travel in a straight line for at least 10 feet (2 squares) after the turn to maintain the charge.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 15),
      eq("feats.run.possessed"),
    ],
  },
  {
    name: "Flick of the Wrist",
    description: "If you draw a light weapon and make a melee attack with it on the same turn, the target is treated as flat-footed for that attack. This ability can only be used once per round and once per opponent in any given combat encounter.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 17),
      eq("feats.quickdraw.possessed"),
      gte("skills.sleightofhand.rank", 5),
    ],
  },
  {
    name: "Flying Kick",
    description: "When making an unarmed attack as part of a charge action, you deal an additional 1d12 points of damage.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.powerattack.possessed"),
      gte("skills.jump.rank", 4),
    ],
  },
  {
    name: "Formation Expert",
    description: "This feat grants three tactical maneuvers that function even if your allies lack this feat. Lock Shields: While carrying a readied shield with allies on opposite sides who also have readied shields, you gain +1 to AC. Step into the Breach: When an adjacent ally falls and another ally occupies every square between you and the fallen comrade, you may immediately take a single move action to occupy the fallen ally's square. Wall of Polearms: While wielding a shortspear, longspear, trident, glaive, guisarme, halberd, or ranseur with adjacent allies wielding the same weapon on opposite sides, you gain +2 on attack rolls.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
    ],
  },
  {
    name: "Freezing The Lifeblood",
    description: "You must declare the use of this feat before rolling your attack (a miss wastes the attempt). Against a humanoid target, you deliver an unarmed strike that deals no damage but may paralyze. On a hit, the target makes a Fortitude save (DC 10 + half your character level + your Wis modifier) or is paralyzed for 1d4+1 rounds. Each use counts as one daily use of Stunning Fist. Creatures immune to stunning cannot be paralyzed this way.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 10),
      gte("abilities.wisdom.total", 17),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Giantbane",
    description: "This feat provides three tactical maneuvers for fighting foes at least two size categories larger. Duck Underneath: After taking total defense, if attacked by such a foe, you receive an additional +4 dodge bonus to AC (stacking with total defense). If the foe misses, on your next turn you may attempt a DC 15 Tumble check as a free action to move to an unoccupied square on the opposite side of the foe. Death from Below: After successfully ducking underneath, you may immediately attack that foe with a single strike. The foe is flat-footed, and you receive +4 on the attack roll. Climb Aboard: After moving adjacent to such a foe, on the following round you may make a DC 10 Climb check as a free action to clamber onto the creature (occupying one of its squares). The creature suffers a -4 penalty on attacks against you. You move with the creature; it may attempt to dislodge you by winning a grapple check opposed by your Climb check. If dislodged, you land in a random adjacent square.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      or(
        eqStr("identity.physiology.race.size", "Fine"),
        eqStr("identity.physiology.race.size", "Diminutive"),
        eqStr("identity.physiology.race.size", "Tiny"),
        eqStr("identity.physiology.race.size", "Small"),
        eqStr("identity.physiology.race.size", "Medium"),
      ),
      gte("skills.tumble.rank", 5),
    ],
  },
  {
    name: "Greater Kiai Shout",
    description: "When you perform a kiai shout, affected opponents are panicked for 2d6 rounds unless they succeed on a Will save (DC 10 + half your character level + your Cha modifier). Only opponents with fewer Hit Dice or levels than you are affected.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 9),
      gte("abilities.charisma.total", 13),
      eq("feats.kiaishout.possessed"),
    ],
  },
  {
    name: "Greater Two-Weapon Defense",
    description: "While wielding two weapons (not natural weapons or unarmed strikes), you gain a +3 shield bonus to AC. This increases to +6 when fighting defensively or using the total defense action.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 11),
      gte("abilities.dexterity.total", 19),
      eq("feats.improvedtwoweapondefense.possessed"),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.twoweapondefense.possessed"),
    ],
  },
  {
    name: "Hamstring",
    description: "On a successful melee sneak attack, you may sacrifice 2d6 of your bonus sneak attack damage to halve the target's base land speed. This reduction lasts 24 hours or until the target receives a DC 15 Heal check, a cure spell, or other magical healing. Creatures immune to sneak attacks, legless creatures, and those with more than four legs are unaffected. Quadrupeds require two successful hamstring attacks. Other movement modes (fly, burrow, etc.) are not impacted. Usable once per round.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.sneakattack.possessed"),
    ],
  },
  {
    name: "Hold the Line",
    description: "You may take an attack of opportunity against any charging foe that enters a square you threaten. This attack resolves immediately before the charging creature's attack.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      eq("feats.combatreflexes.possessed"),
    ],
  },
  {
    name: "Improved Buckler Defense",
    description: "When making an off-hand weapon attack, you retain the shield bonus to AC from your buckler.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.shieldproficiency.possessed"),
    ],
  },
  {
    name: "Improved Combat Expertise",
    description: "When employing Combat Expertise, the amount you subtract from attack rolls and add to AC may be any value up to your full base attack bonus.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      gte("abilities.intelligence.total", 13),
      eq("feats.combatexpertise.possessed"),
    ],
  },
  {
    name: "Improved Familiar",
    description: "Your familiar options expand to include additional creatures. You may select a familiar whose alignment differs from yours by no more than one step on each axis. Each creature requires a minimum arcane caster level and base attack bonus. Available options include: Krenshar (N, 3rd level, +3 BAB), Worg (NE, 3rd level, +3 BAB), Blink dog (LG, 5th level, +5 BAB), Hell hound (LE, 5th level, +5 BAB), Hippogriff (N, 7th level, +7 BAB), Howler (CE, 7th level, +7 BAB), Winter wolf (NE, 7th level, +7 BAB). All familiars provide the Alertness feat, an empathic link, and spell sharing. They also gain improved evasion: on a successful Reflex save they take no damage, and on a failed save they take only half.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.familiarsorcerer.possessed"), eq("feats.familiarwizard.possessed")),
    ],
  },
  {
    name: "Improved Favored Enemy",
    description: "You deal 3 additional points of damage against your favored enemies. This stacks with existing favored enemy bonuses from other class features.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 5),
    ],
  },
  {
    name: "Improved Mounted Archery",
    description: "The ranged attack penalty for firing while your mount takes a double move is eliminated. The penalty when your mount is running is reduced from -4 to -2. You may attack at any point during your mount's movement.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.mountedarchery.possessed"),
      eq("feats.mountedcombat.possessed"),
      gte("skills.ride.rank", 1),
    ],
  },
  {
    name: "Improved Rapid Shot",
    description: "When using the Rapid Shot feat, the -2 penalty on all ranged attack rolls is negated.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      eq("feats.manyshot.possessed"),
      eq("feats.pointblankshot.possessed"),
      eq("feats.rapidshot.possessed"),
    ],
  },
  {
    name: "Improved Toughness",
    description: "You gain hit points equal to your current number of Hit Dice. Whenever you gain a Hit Die (such as from gaining a level), you gain 1 additional hit point. Losing a Hit Die (such as from level loss) permanently reduces your hit points by 1.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("saves.fortitude.base", 2),
    ],
    modifiers: [
      { target: "combat.hp.misc", operator: "add", value: "{{ [identity.meta.level] }}", valueType: "number" },
    ],
  },
  {
    name: "Improved Two-Weapon Defense",
    description: "While wielding two weapons (not natural weapons or unarmed strikes), you receive a +2 shield bonus to AC. This increases to +4 when fighting defensively or using the total defense action.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      gte("abilities.dexterity.total", 17),
      eq("feats.twoweaponfighting.possessed"),
      eq("feats.twoweapondefense.possessed"),
    ],
  },
  {
    name: "Improved Weapon Familiarity",
    description: "All exotic weapons associated with your race are treated as martial weapons for you. A weapon is considered racially associated if the race's name is part of the weapon's name (such as the elven thinblade or dwarven urgrosh).",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 1),
    ],
  },
  {
    name: "Instantaneous Rage",
    description: "You may enter a rage at any time, including outside your turn or when surprised. Activating rage is a free action that can be used in response to another creature's action. This allows you to gain rage benefits (such as increased Constitution or Will save bonuses) before the outcome of a triggering attack or spell is determined. You must be aware of the triggering event but may be flat-footed.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.ragebarbarian.possessed"),
    ],
  },
  {
    name: "Intimidating Rage",
    description: "While raging, you may designate a single foe within 30 feet and attempt to demoralize it as a free action. A successfully demoralized target remains shaken for the duration of your rage. You may only target one foe with this ability per encounter.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.ragebarbarian.possessed"),
    ],
  },
  {
    name: "Karmic Strike",
    description: "On your turn, you may accept a -4 penalty to AC to gain the ability to take attacks of opportunity against any creature that successfully hits you with a melee attack or melee touch attack. The attacker must be within your threatened area, and this does not grant additional attacks of opportunity beyond your normal limit. The AC penalty and retaliatory capability persist until your next turn.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 13),
      eq("feats.combatexpertise.possessed"),
      eq("feats.dodge.possessed"),
    ],
  },
  {
    name: "Kiai Shout",
    description: "Performing a kiai shout is a standard action. All opponents within 30 feet who can hear you and have fewer Hit Dice or levels than you may become shaken for 1d6 rounds. A successful Will save (DC 10 + half your character level + your Cha modifier) negates the effect. You may use this ability three times per day.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 1),
      gte("abilities.charisma.total", 13),
    ],
  },
  {
    name: "Monkey Grip",
    description: "You may wield melee weapons one size category larger than normal with a -2 penalty on attack rolls, without changing the effort category required. A larger one-handed weapon remains one-handed for you, a larger light weapon remains light, and a larger two-handed weapon remains two-handed. You cannot wield an oversized weapon in your off hand, and this feat does not apply to double weapons.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 1),
    ],
  },
  {
    name: "Pain Touch",
    description: "A creature you successfully stun with a stunning attack becomes nauseated for 1 round immediately following the round it was stunned. Creatures immune to stunning are also immune to this effect, as are creatures more than one size category larger than you.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 2),
      gte("abilities.wisdom.total", 15),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Phalanx Fighting",
    description: "While using a heavy shield and a light weapon, you gain a +1 bonus to AC. Additionally, if you are within 5 feet of an ally who also has this feat and is similarly equipped with a heavy shield and light weapon, you form a shield wall. All participants in the shield wall receive an extra +2 bonus to AC (totaling +3 with this feat) and a +1 bonus on Reflex saves.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 1),
      eq("feats.shieldproficiency.possessed"),
    ],
    modifiers: [
      { target: "combat.ac.misc", operator: "add", value: "1", valueType: "number" },
    ],
  },
  {
    name: "Pin Shield",
    description: "This feat works against opponents of your size or within one size category who are using a shield. During a full attack, you may forfeit all off-hand attacks to pin the foe's shield with your off-hand weapon. Your remaining primary weapon attacks (with normal two-weapon fighting penalties) deny the foe any AC benefit from their shield until the end of your action. You must be wielding two weapons to use this feat.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Prone Attack",
    description: "You can attack from a prone position without penalty on the attack roll. If the attack hits, you may stand up immediately as a free action. While you are prone, opponents gain no bonus on melee attacks against you.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 2),
      gte("abilities.dexterity.total", 15),
      eq("feats.lightningreflexes.possessed"),
    ],
  },
  {
    name: "Ranged Disarm",
    description: "Select one ranged weapon in which you are proficient. You may attempt disarm attacks with that weapon against targets within 30 feet.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 5),
      gte("abilities.dexterity.total", 15),
      eq("feats.pointblankshot.possessed"),
      eq("feats.preciseshot.possessed"),
    ],
  },
  {
    name: "Ranged Pin",
    description: "You can pin a target's clothing or equipment to a nearby surface using a ranged attack. The target must be within 5 feet of a wall, tree, or similar surface and must be wearing some form of clothing, armor, or gear. Make a ranged attack roll (not a touch attack), then win an opposed grapple check (size modifiers apply normally). The pinned target can break free with a DC 15 Strength check or DC 15 Escape Artist check as a standard action.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 5),
      gte("abilities.dexterity.total", 15),
      eq("feats.pointblankshot.possessed"),
      eq("feats.preciseshot.possessed"),
    ],
  },
  {
    name: "Ranged Sunder",
    description: "Slashing and bludgeoning ranged weapons deal full damage (instead of half) when targeting objects. Piercing ranged weapons (such as arrows) can also be used for ranged sunder attempts but deal only half damage; halve the damage before applying hardness. You must be within 30 feet of the target to attempt a ranged sunder.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 5),
      gte("abilities.strength.total", 13),
      eq("feats.pointblankshot.possessed"),
      eq("feats.preciseshot.possessed"),
    ],
  },
  {
    name: "Rapid Stunning",
    description: "You may perform one additional stunning attack (or other special attack that counts against your daily stunning limit) per round.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.combatreflexes.possessed"),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Roundabout Kick",
    description: "When you score a critical hit on an unarmed attack, you immediately receive an additional unarmed attack against the same opponent at the same attack bonus used for the critical hit.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 15),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Sharp-Shooting",
    description: "Your ranged targets receive only a +2 bonus to AC from cover instead of the normal amount. This has no effect against targets with no cover or total cover.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 3),
      eq("feats.pointblankshot.possessed"),
      eq("feats.preciseshot.possessed"),
    ],
  },
  {
    name: "Shield Charge",
    description: "When you hit an opponent with a shield attack during a charge, you may attempt a free trip attack that does not provoke an attack of opportunity, in addition to dealing normal damage. If your trip attempt fails, the defender cannot attempt to trip you in return.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 3),
      eq("feats.improvedshieldbash.possessed"),
    ],
  },
  {
    name: "Shield Slam",
    description: "As a full-round action or charge action, you deliver a shield strike. If it hits, the target takes normal damage and must succeed on a Fortitude save (DC 10 + half your character level + your Str modifier) or be dazed for 1 round. Constructs, oozes, plants, undead, incorporeal creatures, and those immune to critical hits cannot be dazed.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.improvedshieldbash.possessed"),
      eq("feats.shieldcharge.possessed"),
    ],
  },
  {
    name: "Shock Trooper",
    description: "This feat grants three tactical maneuvers. Directed Bull Rush: On a successful bull rush during a charge, for every square you push the foe back, you may also push them one square laterally. Domino Rush: If your bull rush forces one foe into another foe's square, you may attempt a free trip against both simultaneously; neither foe can attempt to trip you on a failure. Heedless Charge: When charging with Power Attack at a penalty of -5 or worse, in addition to normal charge modifiers (-2 AC, +2 attack), you may redistribute any portion of your Power Attack penalty from your attack roll to your AC instead, up to your base attack bonus.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.improvedbullrush.possessed"),
      eq("feats.powerattack.possessed"),
    ],
  },
  {
    name: "Swarmfighting",
    description: "You may share a 5-foot square with any allied Small creature that also has this feat, at no penalty. When you engage a Medium or larger foe in melee while at least one other ally with this feat also threatens that target, you gain a +1 morale bonus on attack rolls. This bonus increases by +1 for each additional threatening ally with this feat beyond the first. The total morale bonus cannot exceed your Dexterity bonus.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 1),
      eqStr("identity.physiology.race.size", "Small"),
      gte("abilities.dexterity.total", 13),
    ],
  },
  {
    name: "Throw Anything",
    description: "You may throw any melee weapon you are proficient with as though it were a ranged weapon, using a range increment of 10 feet.",
    aptitudes: ["General", "Hulking Hurler Class Feature"],
    requirements: [
      gte("combat.bab", 2),
      gte("abilities.dexterity.total", 15),
    ],
  },
  {
    name: "Weakening Touch",
    description: "You must declare the use of this feat before making your attack roll (a miss wastes the attempt). Your unarmed strike deals no damage but instead imposes a -6 penalty to the target's Strength score for 1 minute. Multiple applications against the same target do not stack. Each use expends one daily use of Stunning Fist. Creatures immune to stun effects are unaffected.",
    aptitudes: ["General", "Fighter Bonus Feat"],
    requirements: [
      gte("combat.bab", 2),
      gte("abilities.wisdom.total", 17),
      eq("feats.improvedunarmedstrike.possessed"),
      eq("feats.stunningfist.possessed"),
    ],
  },
  {
    name: "Zen Archery",
    description: "You may substitute your Wisdom modifier for your Dexterity modifier on ranged attack rolls.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 1),
      gte("abilities.wisdom.total", 13),
    ],
  },
];

export const DIVINE_FEATS: FeatSeed[] = [
  {
    name: "Divine Cleansing",
    description: "By spending a standard action and expending one turn or rebuke undead attempt, you grant all allies within a 60-foot burst (yourself included) a +2 sacred bonus to Fortitude saves. This effect persists for a number of rounds equal to your Charisma modifier.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Divine Might",
    description: "As a free action, you expend one turn or rebuke undead attempt to add your Charisma bonus to your weapon damage for 1 full round.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.strength.total", 13),
      eq("feats.powerattack.possessed"),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Divine Resistance",
    description: "By spending a standard action and one turn or rebuke undead attempt, you grant all allies within a 60-foot burst (yourself included) resistance 5 against cold, electricity, and fire. This resistance does not stack with similar resistances from spells or special abilities. The protection lasts a number of rounds equal to your Charisma modifier.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.divinecleansing.possessed"),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Divine Shield",
    description: "As a standard action, you expend one turn or rebuke undead attempt to channel energy into your shield. The shield receives a bonus to its AC contribution equal to your Charisma modifier, lasting a number of rounds equal to half your character level.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
      eq("feats.shieldproficiency.possessed"),
    ],
  },
  {
    name: "Divine Vigor",
    description: "By spending a standard action and one turn or rebuke undead attempt, you increase your base speed by 10 feet and gain temporary hit points equal to +2 per character level. These benefits persist for a number of minutes equal to your Charisma modifier.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Sacred Vengeance",
    description: "As a free action, expend one turn undead attempt to add 2d6 damage to all successful melee attacks against undead for the remainder of the current round.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
];

export const TACTICAL_FEATS: FeatSeed[] = [
  {
    name: "Elusive target",
    description: "This feat provides three tactical maneuvers. Negate Power Attack: Designate one foe with your Dodge feat. If that foe employs Power Attack against you, the foe still suffers the attack roll penalty but receives no damage bonus. Diverting Defense: While flanked, designate one flanking attacker with your Dodge feat. That attacker's first attack in the round automatically misses you and may instead hit the other flanking creature (roll the attack normally; the other flanker is treated as flat-footed). Subsequent attacks from the designated attacker resolve normally. Cause Overreach: When you provoke an attack of opportunity by leaving a threatened square, if the foe misses, you may make a free trip attempt against that foe. If your trip fails, the foe cannot attempt to trip you in return.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 6),
      eq("feats.dodge.possessed"),
      eq("feats.mobility.possessed"),
    ],
  },
  {
    name: "Raptor School",
    description: "This feat provides three tactical maneuvers. Eagle's Swoop: When charging or leaping down from at least 10 feet, make a Jump check as a free action before attacking. Set the DC at 15 for +2 damage or 25 for +4 damage. Failure means you miss; failing by 5+ causes you to fall prone in an adjacent square. Falcon's Feathers: While wearing a cloak, as a standard action you can whip it around distractingly. Attempt a feint using your base attack bonus instead of Bluff. Success makes your target flat-footed against your next melee attack. Hawk's Eye: Spend 1 or more full rounds observing a foe (taking no other actions). Your next melee attack against that foe gains +2 on attack and damage per round spent observing, up to +6 for 3 rounds. If the target attacks you during observation, or you delay more than 3 rounds after observing, the bonus is lost.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 6),
      gte("abilities.wisdom.total", 13),
      gte("skills.jump.rank", 5),
    ],
  },
  {
    name: "Sun School",
    description: "This feat provides three tactical maneuvers. Inexorable Progress of Dawn: If your first two unarmed attacks from a flurry of blows both hit the same foe, that foe is pushed back 5 feet and you may advance 5 feet. Neither movement provokes attacks of opportunity. Blinding Sun of Noon: If you stun the same foe with unarmed attacks on two consecutive rounds, that foe is additionally confused for 1d4 rounds after the stun ends. Flash of Sunset: When you move adjacent to a foe through instantaneous movement (such as dimension door or abundant step), you may immediately make a single attack at your highest attack bonus.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 4),
      eq("feats.flurryofblowsmonk.possessed"),
    ],
  },
];

export const greaterResiliency: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Greater Resiliency: ${w}`,
  description: `Your existing damage reduction increases by 1 point. If your DR normally improves with level, it continues increasing at its previous rate on top of this bonus. You may select this feat only once. It does not alter what types of damage overcome your DR. If you have multiple forms of DR, choose which one to enhance when you take this feat.`,
  aptitudes: ["General"],
  properties: [{ type: "FEAT_FAMILY", value: "Greater Resiliency" }],
}));

export const powerCritical: FeatSeed[] = ALL_WEAPONS.map((w) => ({
  name: `Power Critical: ${w}`,
  description: `With your ${w}, you gain a +4 bonus on rolls to confirm critical threats.`,
  aptitudes: ["General", "Fighter Bonus Feat"],
  requirements: [
    gte("combat.bab", 4),
    eq(feat("Weapon Focus")),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Power Critical" }],
}));
