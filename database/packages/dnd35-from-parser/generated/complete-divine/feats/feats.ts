import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { eq, gte, or } from "@/database/packages/dnd35/seed-utils.ts";

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Arcane Disciple",
    description: "You gain access to the spells of your selected domain, adding them to your arcane class spell list. If you possess arcane casting from multiple classes, you must designate which class benefits from this feat; this choice is permanent for that instance of the feat. You learn and prepare these spells normally for your class, but Wisdom (not your usual spellcasting ability) determines the saving throw DC. You also need a Wisdom score of at least 10 + the spell's level to prepare or cast any spell acquired through this feat. Per day, you can prepare (or cast spontaneously, if applicable) no more than one domain spell of each spell level.",
    aptitudes: ["General"],
    requirements: [
      gte("spellcasting.arcane", 1),
      gte("skills.knowledgereligion.rank", 4),
      gte("skills.spellcraft.rank", 4),
    ],
  },
  {
    name: "Augment Healing",
    description: "Whenever you cast a Conjuration [Healing] spell, it restores an additional +2 hit points per level of the spell. For instance, a 1st-level cleric using cure light wounds with this feat heals 1d8+3 hp. An 8th-level cleric who has the Healing domain casting cure moderate wounds would heal 2d8+13 hp (9 from caster level including the Healing domain's +1 bonus, plus 4 from this feat). A 13th-level druid casting heal would restore 144 hp (130 from caster level plus 14 from the feat, as heal is a 7th-level druid spell).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.heal.rank", 4),
    ],
  },
  {
    name: "Domain Focus",
    description: "Spells you cast from one chosen domain benefit from a +1 caster level increase. This applies to caster level checks for overcoming spell resistance and to level-dependent variables like duration. Casting a domain spell from a non-domain spell slot does not gain this benefit, even if that spell also appears on your domain list.",
    aptitudes: ["General"],
  },
  {
    name: "Empower Turning",
    description: "Your turn or rebuke undead attempts affect more undead than normal. After calculating your turning damage (cleric level + Charisma modifier + roll), multiply the total by 1.5.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Extra Wild Shape",
    description: "You gain two additional daily uses of wild shape. If you can assume elemental form through wild shape, you also receive one extra elemental wild shape use per day.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Improved Smiting",
    description: "Your smite attacks bypass damage reduction as though they were aligned, and they inflict an additional +1d6 damage to creatures of a specific opposing alignment. If your smite already has an inherent alignment (such as a paladin's smite evil being good-aligned), it deals the extra damage to foes of that alignment and overcomes DR as the opposite alignment. If your smite lacks an inherent alignment, you select one alignment component (chaotic, evil, good, or lawful) when taking this feat; your smites then overcome DR as that alignment and deal +1d6 extra damage to foes of the opposing alignment. The chosen component must match part of your own alignment, and this selection is permanent. Changing your alignment so the chosen component no longer applies causes you to lose this feat's benefits.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.charisma.total", 13),
      eq("feats.smiteevilpaladin.possessed"),
    ],
  },
  {
    name: "Magical Beast Wild Shape",
    description: "Your wild shape ability extends to magical beast forms. The size restriction matches your normal animal size limitation. You acquire all supernatural abilities of the magical beast whose shape you assume.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 25),
      gte("skills.knowledgenature.rank", 27),
    ],
  },
  {
    name: "Negative Energy Burst",
    description: "By expending one rebuke or command undead attempt, you emit a 60-foot burst of negative energy. Make a standard rebuke (or command) check, but the burst targets living creatures instead of undead. Creatures that would be rebuked by the result gain one negative level; those that would be commanded gain two negative levels. The Fortitude DC to remove these negative levels after 24 hours equals 10 + half your effective turning level + your Charisma modifier.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.charisma.total", 25),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Positive Energy Aura",
    description: "Any undead creature entering within 15 feet of you is automatically subjected to a turning effect at no cost in turning attempts and with no turning damage roll required. However, only undead whose Hit Dice do not exceed your effective cleric level minus 10 are turned, and only those whose Hit Dice do not exceed your effective cleric level minus 20 are destroyed. Undead with total cover relative to you are unaffected, just as with standard turning.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.charisma.total", 25),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Practiced Spellcaster",
    description: "Your caster level for one chosen spellcasting class increases by 4, though it cannot exceed your total Hit Dice. If you cannot immediately benefit from the full increase, any remaining bonus applies as you gain additional non-caster Hit Dice later. Characters with multiple spellcasting classes must designate which class receives this benefit. This feat does not grant additional spells per day or spells known; it only raises your effective caster level for purposes such as spell resistance penetration, duration, and other level-dependent effects.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("skills.spellcraft.rank", 4),
    ],
  },
  {
    name: "Quicken Turning",
    description: "You may perform a turn or rebuke undead attempt as a free action. The limitation of one turning attempt per round still applies.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Spell Focus (Chaos)",
    description: "The save DC for all your spells bearing an alignment descriptor (chaos, evil, good, or law) that corresponds to your own alignment increases by +1. This bonus does not stack with bonuses from other Spell Focus feats.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.relevantalignment.possessed"),
    ],
  },
  {
    name: "Spell Focus (Evil)",
    description: "The save DC for all your spells bearing an alignment descriptor (chaos, evil, good, or law) that corresponds to your own alignment increases by +1. This bonus does not stack with bonuses from other Spell Focus feats.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.relevantalignment.possessed"),
    ],
  },
  {
    name: "Spell Focus (Good)",
    description: "The save DC for all your spells bearing an alignment descriptor (chaos, evil, good, or law) that corresponds to your own alignment increases by +1. This bonus does not stack with bonuses from other Spell Focus feats.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.relevantalignment.possessed"),
    ],
  },
  {
    name: "Spell Focus (Law)",
    description: "The save DC for all your spells bearing an alignment descriptor (chaos, evil, good, or law) that corresponds to your own alignment increases by +1. This bonus does not stack with bonuses from other Spell Focus feats.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.relevantalignment.possessed"),
    ],
  },
  {
    name: "Spontaneous Healer",
    description: "You gain the ability to spontaneously convert your prepared spells into cure spells from your class spell list, mirroring a cleric's spontaneous casting. You can use this ability a number of times per day equal to your Wisdom modifier.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.knowledgereligion.rank", 4),
    ],
  },
  {
    name: "Spontaneous Summoner",
    description: "You can spontaneously convert prepared spells into summon nature's ally spells from your class list, in the same manner a druid does. The number of times you may do this per day equals your Wisdom modifier.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 13),
      gte("skills.knowledgenature.rank", 4),
    ],
  },
  {
    name: "Spontaneous Wounder",
    description: "You gain the ability to spontaneously convert your prepared spells into inflict spells from your class spell list, functioning like a cleric's spontaneous casting of inflict spells. You can use this ability a number of times per day equal to your Wisdom modifier.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 13),
      gte("skills.knowledgereligion.rank", 4),
    ],
  },
  {
    name: "Zone of Animation",
    description: "By expending a rebuke or command undead attempt, you raise corpses within your rebuke/command range as undead. The total HD of undead you animate equals the number of HD that your check result would normally command. You cannot animate more corpses than are available in range, nor can you exceed your total commanded undead limit (accounting for those already under your control) with any single use. Animated undead fall under your command automatically, subject to your normal command cap. Recently deceased corpses rise as zombies; older remains become upgraded.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.charisma.total", 25),
      eq("feats.undeadmastery.possessed"),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
];

export const WILD_FEATS: FeatSeed[] = [
  {
    name: "Boar's Ferocity",
    description: "When your hit points drop to 0 or below without being killed outright, you may expend one use of wild shape as a free action (usable even outside your turn) to keep fighting as though you were neither disabled nor dying. This benefit persists for 1 minute.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Cheetah's Speed",
    description: "By expending one use of wild shape, you increase your base land speed to 50 feet. Additionally, once per hour you can sprint at 10 times your normal speed as part of a charge action. This enhancement lasts for 1 hour.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Eagle's Wings",
    description: "By expending one wild shape use, you sprout feathered wings that grant a fly speed of 60 feet with average maneuverability. The wings persist for 1 hour.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Elephant's Hide",
    description: "By expending one wild shape use, you gain a natural armor bonus of +7 that does not stack with any existing natural armor. This benefit lasts for 10 minutes.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Fast Wild Shape",
    description: "You can activate wild shape as a move action instead of a standard action.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.dexterity.total", 13),
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Grizzly's Claws",
    description: "By expending one wild shape use, you manifest two primary claw attacks, each made at your full base attack bonus and adding your Strength modifier to damage. The claws inflict piercing and slashing damage equivalent to a short sword of your size (1d6 for Medium, 1d4 for Small). The claws last for 1 hour.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Lion's Pounce",
    description: "When making a charge, you may expend one wild shape use as a free action to deliver a full attack at the end of the charge instead of a single attack.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Oaken Resilience",
    description: "Expending one wild shape use grants you immunity to critical hits, poison, sleep effects, paralysis, polymorph, and stunning. You also gain exceptional stability, providing a +8 bonus on checks to resist bull rush and trip attempts. These benefits last for 10 minutes.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Serpent's Venom",
    description: "By expending one wild shape use, you gain a secondary bite attack (made at your base attack bonus -5, adding half your Strength modifier to damage) that deals bludgeoning, piercing, and slashing damage equal to a dagger of your size (1d4 for Medium, 1d3 for Small). The bite also delivers poison (Fortitude DC 10 + half your HD + your Constitution modifier; initial and secondary damage 1d6 Constitution).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Swim like a Fish",
    description: "Expending one wild shape use causes you to develop gills for underwater breathing (you retain the ability to breathe air as well). Webbing forms between your fingers and toes, granting a swim speed of 40 feet and a +8 bonus on Swim checks. These effects last for 1 hour.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.wildshapedruid.possessed"),
    ],
  },
  {
    name: "Wolverine's Rage",
    description: "If you sustained damage during the previous round, you may expend one wild shape use as a free action on your turn to enter a frenzy. While in this state, you gain +2 to Strength, +2 to Constitution, and suffer a -2 penalty to AC. The frenzy lasts 5 rounds and cannot be ended early.",
    aptitudes: ["General"],
  },
];

export const EPIC_FEATS: FeatSeed[] = [
  {
    name: "Bonus Domain",
    description: "Select one additional domain from those offered by your deity. You receive the granted power and spell access of that domain, functioning identically to your other domain spells.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("abilities.wisdom.total", 21),
      gte("spellcasting.divine", 9),
    ],
  },
];

export const METAMAGIC_FEATS: FeatSeed[] = [
  {
    name: "Consecrate Spell",
    description: "Applying this metamagic feat gives a spell the good descriptor. If the modified spell inflicts damage, half that damage (rounded down) stems from pure divine energy and therefore bypasses resistance or immunity to energy-based attacks. For instance, a consecrated fire storm from a 16th-level cleric inflicts 16d6 damage: half is fire and the other half is untyped divine power, so fire-immune creatures still take the divine portion. The modified spell occupies a slot one level higher than its actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Corrupt Spell",
    description: "This metamagic feat applies the evil descriptor to a spell. When the spell inflicts damage, half of it (rounded down) comes from raw divine power and cannot be reduced by energy resistance or immunity. The modified spell requires a spell slot one level above the spell's normal level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Rapid Spell",
    description: "This metamagic feat can only be applied to spells whose casting time exceeds 1 standard action. A rapid spell that normally takes 1 full round to cast instead requires only a standard action. Spells measured in rounds become 1 full round, those measured in minutes become 1 minute, and those measured in hours become 1 hour. A rapid spell occupies a spell slot one level higher than normal.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Reach Spell",
    description: "A touch-range spell modified by this feat can be delivered at a range of up to 30 feet. The spell functions as a ray, requiring a successful ranged touch attack to affect the target. A reach spell uses a spell slot two levels higher than its actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Transdimensional Spell",
    description: "A spell enhanced with this metamagic feat fully affects incorporeal creatures, creatures on the Ethereal Plane or the Plane of Shadow, and creatures occupying extradimensional spaces within the spell's area. This includes ethereal beings, creatures using blink or shadow walk, manifested ghosts, and creatures inside spaces created by effects like rope trick or portable hole. You still need to perceive a creature to target it directly, but area effects (bursts, cones, emanations, and spreads) can catch creatures you cannot perceive. The modified spell uses a slot one level higher than normal.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
];

export const DIVINE_FEATS: FeatSeed[] = [
  {
    name: "Disciple of the Sun",
    description: "When you use your turn undead ability, you may expend two turn attempts instead of one. Doing so destroys the affected undead outright rather than merely turning them.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Divine Metamagic",
    description: "Upon selecting this feat, pick one metamagic feat you already possess. As a free action, you can channel the energy from your turn or rebuke undead ability to fuel that metamagic feat when applied to divine spells you know. The cost is one turn or rebuke attempt plus one additional attempt per spell level increase imposed by the metamagic feat. Since you power the metamagic through channeled energy, the spell does not require a higher-level spell slot.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Divine Spell Power",
    description: "As a free action, you may expend a turn or rebuke undead attempt and make a turning check (gaining a special +3 bonus along with any other modifiers that normally apply to your turning checks). The turning check result serves as a modifier to your caster level for the next divine spell you cast that round. For example, a turning check result of 16 grants a +2 caster level bonus, while a result of 8 imposes a -1 caster level penalty. If no divine spell is cast before your next turn, the bonus is wasted. This feat does not influence arcane spellcasting.",
    aptitudes: ["General"],
    requirements: [
      gte("spellcasting.divine", 1),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Domain Spontaneity",
    description: "Choose one domain you have access to each time you take this feat. You can sacrifice a prepared divine spell of equal or higher level, along with one daily turn undead attempt, to spontaneously cast any spell from that domain. This functions like the way good clerics spontaneously convert spells into cure spells.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Elemental Healing",
    description: "As a standard action, you can expend a rebuke attempt to release a 60-foot burst of restorative energy. All creatures with an elemental subtype within range that you could normally rebuke are healed for 1d8 hit points per two cleric levels.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Elemental Smiting",
    description: "Once per round as a free action when making a melee attack, you may spend a turn attempt. If your attack hits a creature that you could normally turn due to its elemental subtype, you add your cleric level as bonus damage. A missed attack wastes the turn attempt with no effect.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Glorious Weapons",
    description: "As a standard action, you may expend a turn or rebuke attempt to imbue the melee weapons (including natural weapons) of every ally within a 60-foot burst with an alignment. Weapons become good-aligned if you channel positive energy, or evil-aligned if you channel negative energy, allowing them to overcome the corresponding damage reduction. This lasts until the end of your next turn.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Profane Boost",
    description: "As a standard action, you can expend a rebuke undead attempt to envelop every creature in a 60-foot burst with an aura of negative energy. Any inflict spell cast on an affected creature before the end of your next turn is automatically maximized, without increasing the spell's level or casting time.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Sacred Boost",
    description: "As a standard action, you may spend a turn undead attempt to surround every creature within a 60-foot burst with an aura of positive energy. Any cure spell cast on an affected creature before the end of your next turn is automatically maximized, with no change to the spell's level or casting time.",
    aptitudes: ["General"],
    requirements: [
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "Sacred Healing",
    description: "By spending a turn undead attempt as a full-round action, you grant fast healing 3 to every living creature within a 60-foot burst. This fast healing persists for a number of rounds equal to 1 + your Charisma modifier (minimum 1 round).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.heal.rank", 8),
      or(eq("feats.turnorrebukeundeadcleric.possessed"), eq("feats.turnundeadpaladin.possessed")),
    ],
  },
  {
    name: "True Believer",
    description: "Once per day, immediately before making a saving throw, you may invoke this feat to gain a +2 insight bonus on that save. This feat also qualifies you to use relics associated with your chosen deity.",
    aptitudes: ["General"],
  },
];

export const FAITH_FEATS: FeatSeed[] = [
  {
    name: "Pious Defense",
    description: "When incoming damage would reduce you to 0 or fewer hit points, you may spend 1 faith point to suffer only half the damage from that attack.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.knowledgereligion.rank", 2),
    ],
  },
  {
    name: "Pious Soul",
    description: "You may spend a faith point to add 1d6 to any d20 roll you make for an attack, saving throw, or ability check. This can be done after seeing the d20 result, provided the GM has not yet announced success or failure. Multiple faith points can be spent at once for cumulative dice.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.knowledgereligion.rank", 2),
    ],
  },
  {
    name: "Pious Spellsurge",
    description: "When casting a spell, you may expend 2 faith points to gain a +1d6 bonus that applies either to the save DC of that spell or to your effective caster level for it (your choice).",
    aptitudes: ["General"],
    requirements: [
      gte("skills.knowledgereligion.rank", 4),
    ],
  },
];

export const ITEM_CREATION_FEATS: FeatSeed[] = [
  {
    name: "Sanctify Relic",
    description: "You can create relics, which are special magic items imbued with divine significance.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.itemcreation.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
];
