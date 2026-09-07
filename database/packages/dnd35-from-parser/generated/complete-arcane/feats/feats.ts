import type { FeatSeed } from "@/database/packages/dnd35/v1/feats/types.ts";
import { eq, feat, gte, or } from "@/database/packages/dnd35/seed-utils.ts";
import { MAGIC_SCHOOLS } from "@/shared/dnd3.5/spells.ts";

export const GENERAL_FEATS: FeatSeed[] = [
  {
    name: "Arcane mastery",
    description: "You can take 10 on caster level checks (as if the caster level check was a skill check). You can use this feat even while under stress.",
    aptitudes: ["General"],
    requirements: [
      gte("spellcasting.arcane", 1),
    ],
  },
  {
    name: "Arcane Preparation",
    description: "Each day, you can use one or more of your spell slots to prepare spells you know, usually for the purpose of applying a metamagic feat to the spell--but without an increase in its casting time. Preparing a spell uses a spell slot of the appropriate level, and once prepared, that slot can't be used for anything else until the prepared spell is cast.",
    aptitudes: ["General"],
    requirements: [
      gte("spellcasting.arcane", 1),
    ],
  },
  {
    name: "Battle Caster",
    description: "You are able to wear armor one category heavier than you can normally wear while still avoiding the chance of arcane spell failure. For example, if you have the ability to normally wear light armor without incurring a chance of spell failure, you can wear medium armor and continue to cast spells as normal. This ability does not extend to shields, nor does it apply to spells gained from spellcasting classes other than the class that provides the ability to cast arcane spells while in armor.",
    aptitudes: ["General"],
  },
  {
    name: "Collegiate Wizard",
    description: "You begin play with knowledge of six 1st-level spells plus 1 per point of Intelligence modifier. Each time you gain a wizard level, you may add four spells to your spellbook without additional research. In addition, you gain a +2 bonus on all Knowledge (arcana) checks.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.intelligence.total", 13),
      or(gte("spellcasting.arcane", 1), gte("spellcasting.divine", 1)),
      gte("classes.wizard.level", 1),
    ],
    modifiers: [
      { target: "skills.knowledgearcana.misc", operator: "add", value: "2", valueType: "number" },
    ],
  },
  {
    name: "Communicator",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--arcane mark, comprehend languages, message.",
    aptitudes: ["General"],
  },
  {
    name: "Double Wand Wielder",
    description: "As a full-round action, you can wield a wand in each hand (if you have both hands free), with one wand designated as your primary wand and the other your secondary wand. Each use of the secondary wand expends 2 charges from it instead of 1.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.craftwand.possessed"),
      eq("feats.twoweaponfighting.possessed"),
    ],
  },
  {
    name: "Enhance Spell",
    description: "The damage cap for your spells increases by 10 dice for spells that deal a number of dice of damage equal to your caster level (such as fireball) or by 5 dice for spells that deal a number of dice of damage equal to half your level (such as searing light). An enhanced spell uses up a spell slot four levels higher than the spell's actual level (or as modifi ed by any other metamagic feats). This feat has no effect on spells that don't specifically deal a number of dice of damage equal to your level or half your level, even if the spell's effect is otherwise dictated by your level. Thus, it has no effect on magic missile (though your level determines how many missiles you fire), Melf's acid arrow (though your level indicates how many rounds the acid deals damage), or produce flame (though you add your level to the base 1d4 points of damage dealt).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.maximizespell.possessed"),
    ],
  },
  {
    name: "Extra Edge",
    description: "You gain a +1 bonus on your warmage edge, plus an additional +1 bonus per four warmage levels. For instance, an 8th-level warmage with 18 Intelligence gets a +7 bonus on the damage dealt by any spell that deals hit point damage.",
    aptitudes: ["General"],
    requirements: [
      gte("classes.warmage.level", 4),
    ],
  },
  {
    name: "Extra Invocation",
    description: "You learn one additional invocation from the list available to you, choosing an invocation of one grade lower than the highest grade of invocation you know. For example, a 6thlevel warlock could learn a least invocation, while a 16th-level warlock could learn any least, lesser, or greater invocation.",
    stackable: true,
    aptitudes: ["General"],
  },
  {
    name: "Extra Slot",
    description: "You gain one extra spell slot in your daily allotment, at any level up to one lower than the highest level of spell you can currently cast. For example, a 4th-level sorcerer (maximum spell level 2nd) gains either an extra 0-level or 1stlevel slot, and is able to cast any spell he knows of the chosen level one more time each day. Likewise, a 4th-level wizard can prepare any extra 0-level or 1st-level spell he knows. Once selected, the extra spell slot never changes level.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 4), gte("spellcasting.divine", 4)),
    ],
  },
  {
    name: "Extra Spell",
    description: "You learn one additional spell at any level up to one lower than the highest level of spell you can currently cast. Thus, a 4th-level sorcerer (maximum spell level 2nd) gains a new 0-level or 1st-level spell known with which to expand her repertoire. For classes such as wizard that have more options for learning spells, Extra Spell is generally used to learn a specifi c spell that the character lacks access to and would be unable to research.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
    ],
  },
  {
    name: "Extra Spell Secret",
    description: "You choose one spell known to you that becomes permanently modifi ed as though affected by Enlarge Spell, Extend Spell, Still Spell, or Silent Spell. The spell's level does not change, nor does the choice of spell and modifi cation once chosen. As you go up in level, you can choose the same spell to be modifi ed in different ways with multiple spell secrets (either from additional uses of this feat or through the spell secret class ability). You do not need to have the metamagic feat that you apply to the spell.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("classes.wujen.level", 3),
      or(gte("spellcasting.arcane", 2), gte("spellcasting.divine", 2)),
    ],
  },
  {
    name: "Guardian Spirit",
    description: "Your watchful spirit allows you to reroll your initiative two times per day, as well as allowing you to reroll any saving throw once per day. These effects must be used immediately after the initial initiative check or saving throw is made.",
    aptitudes: ["General"],
    requirements: [
      gte("classes.wujen.level", 1),
    ],
  },
  {
    name: "Heighten Spell-like ability",
    description: "Choose one of your spell-like abilities (subject to the restrictions below) to use at a heightened level up to three times per day (or the ability's normal use limit, whichever is less). The spell-level equivalent of the heightened spell-like ability is two higher than its normal level (to a maximum of 9th level), with all effects dependent on spell level (including saving throw DCs) calculated at the higher level. The spell-like ability you wish to heighten can be chosen only from those abilities that duplicate a spell of a level less than or equal to 1/2 your caster level (round down), minus 2. For a summary, see the Caster Level to Empower column in the table.",
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 6), gte("spellcasting.divine", 6)),
    ],
  },
  {
    name: "Innate Spell",
    description: "Choose any spell you can cast. You can now cast this spell at will as a spell-like ability once per round. One spell slot eight levels higher than the innate spell is permanently used to power it, and any XP cost for the innate spell is paid each time you use it. As well, you must have any focus required by the spell in order to use it as a spell-like ability, and if the innate spell has a costly material component, you must use an item worth 50 times that cost as a focus. Since an innate spell is a spell-like ability and not an actual spell, a cleric can't lose it to spontaneously cast a cure or infl ict spell. As well, spellcasters who become unable to cast spells of the level of the spell slot used to power the innate spell become unable to use the spell-like ability.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.quickenspell.possessed"),
      eq("feats.silentspell.possessed"),
      eq("feats.stillspell.possessed"),
    ],
  },
  {
    name: "Insightful",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--detect magic, detect secret doors, read magic.",
    aptitudes: ["General"],
  },
  {
    name: "Mage Slayer",
    description: "You gain a +1 bonus on Will saving throws. Spellcasters you threaten may not cast defensively (they automatically fail their Concentration checks to do so), but they are aware that they cannot cast defensively while being threatened by a character with this feat.",
    aptitudes: ["General"],
    requirements: [
      gte("combat.bab", 3),
      gte("skills.spellcraft.rank", 2),
    ],
    modifiers: [
      { target: "saves.will.misc", operator: "add", value: "1", valueType: "number" },
    ],
  },
  {
    name: "Maximize Spell-like Ability",
    description: "Choose one of your spell-like abilities (subject to the restrictions below) to use at maximum effectiveness up to three times per day (or the ability's normal use limit, whichever is less). All variable, numeric effects of the spelllike ability are maximized, dealing maximum damage, curing the maximum number of hit points, affecting the maximum number of targets, and so on. For example, a 10th-level warlock's maximized eldritch blast deals 36 points of damage three times per day. Saving throws and opposed checks (such as the one you make when you cast dispel magic) are not affected, nor are spell-like abilities without random variables. An empowered maximized spell-like ability gains the benefit of each feat separately (getting the maximum result plus one-half the normally rolled result). For example, a fire mephit's empowered maximized scorching ray would deal 24 points of damage plus one-half of 4d6 points of damage. The spell-like ability you wish to maximize can be chosen only from those abilities that duplicate a spell of a level less than or equal to 1/2 your caster level (round down), minus 2. For a summary, see the Caster Level to Empower column in the table.",
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 6), gte("spellcasting.divine", 6)),
    ],
  },
  {
    name: "Necropolis Born",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--cause fear, ghost sound, touch of fatigue. Save DC 10 + spell level + your Cha modifier.",
    aptitudes: ["General"],
  },
  {
    name: "Night Haunt",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--dancing lights, prestidigitation, unseen servant. Save DC 10 + spell level + your Cha modifier.",
    aptitudes: ["General"],
  },
  {
    name: "Obtain Familiar",
    description: "You can obtain a familiar in the same manner as a sorcerer or wizard. As with a sorcerer or wizard, obtaining a familiar takes 24 hours and uses up magic materials worth 100 gp. For the purpose of determining familiar abilities that depend on your arcane caster class level, your levels in all classes that allow you to cast arcane spells stack.",
    aptitudes: ["General"],
    requirements: [
      or(gte("spellcasting.arcane", 3), gte("spellcasting.divine", 3)),
      gte("skills.knowledgearcana.rank", 4),
    ],
  },
  {
    name: "Pierce Magical Concealment",
    description: "Your fierce contempt for magic allows you to disregard the miss chance granted by spells or spell-like abilities such as darkness, blur, invisibility, obscuring mist, ghostform, and spells when used to create concealment effects (such as a wizard using permanent image to fill a corridor with illusory fire and smoke). In addition, when facing a creature protected by mirror image, you can immediately pick out the real creature from its figments. Your ability to ignore the miss chance granted by magical concealment doesn't grant you any ability to ignore nonmagical concealment (so you would still have a 20% miss chance against an invisible creature hiding in fog, for example).",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.constitution.total", 13),
      eq("feats.blindfight.possessed"),
      eq("feats.mageslayer.possessed"),
    ],
  },
  {
    name: "Pierce Magical Protection",
    description: "Your contempt for magic is so fierce that as a standard action you can make a melee attack that ignores any bonuses to Armor Class granted by spells (including spell trigger or spell completion effects created by magic items such as wands or potions). If you deal damage to your opponent, you also instantly and automatically dispel all that opponent's spells and spell effects that grant a bonus to Armor Class.",
    aptitudes: ["General"],
    requirements: [
      gte("abilities.constitution.total", 13),
      eq("feats.mageslayer.possessed"),
    ],
  },
  {
    name: "Practiced Spellcaster",
    description: "Your caster level for the chosen spellcasting class increases by 4. This benefit can't increase your caster level to higher than your Hit Dice. However, even if you can't benefit from the full bonus immediately, if you later gain Hit Dice in levels of nonspellcasting classes, you might be able to apply the rest of the bonus. For example, a human 5th-level sorcerer/3rd-level fighter who selects this feat would increase his sorcerer caster level from 5th to 8th (since he has 8 Hit Dice). If he later gained a fighter level, he would gain the remainder of the bonus and his sorcerer caster level would become 9th (since he now has 9 Hit Dice). A character with two or more spellcasting classes (such as a bard/sorcerer or a ranger/druid) must choose which class gains the feat's effect. This feat does not affect your spells per day or spells known. It increases your caster level only, which would help you penetrate spell resistance and increase the duration and other effects of your spells.",
    stackable: true,
    aptitudes: ["General"],
    requirements: [
      gte("skills.spellcraft.rank", 4),
    ],
  },
  {
    name: "Ranged Spell Specialization",
    description: "Damage-dealing spells that require a ranged touch attack roll gain a +2 bonus on the damage they deal. This extra damage applies only to the first successful attack of spells that create multiple rays or missiles, or to the first round of damage for spells that deal damage over multiple rounds on a single successful attack (such as Melf's acid arrow). Because you must be able to strike precisely, the extra damage applies only to targets within 30 feet. Only spells that deal hit point damage can be affected by this feat.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.weaponfocusrangedspell.possessed"),
      or(gte("spellcasting.arcane", 4), gte("spellcasting.divine", 4)),
    ],
  },
  {
    name: "Reckless Wand Wielder",
    description: "By expending an additional charge, you can use a wand as if its caster level was 2 higher than its normal level, changing all the spell's level-dependent effects. For example, by expending 2 charges at once, a wand of magic missile (created at caster level 3rd) can be used at caster level 5th, fi ring three missiles instead of two. You can expend only 1 extra charge at a time using this feat.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.craftwand.possessed"),
      gte("skills.usemagicdevice.rank", 1),
    ],
  },
  {
    name: "Soul of the North",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--chill touch, ray of frost, resistance. Save DC 10 + spell level + your Cha modifier.",
    aptitudes: ["General"],
  },
  {
    name: "Spell Hand",
    description: "An innate talent for magic grants you the following spell-like abilities as a 1st-level caster: 1/day--mage hand, open/close, Tenser's fl oating disk. Save DC 10 + spell level + your Cha modifier.",
    aptitudes: ["General"],
  },
  {
    name: "Touch Spell Specialization",
    description: "Damage-dealing spells that require a melee touch attack roll gain a +2 bonus on the damage they deal. This extra damage applies only to the fi rst successful attack of spells that allow multiple touch attacks (such as chill touch). Only spells that deal hit point damage can be affected by this feat.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.weaponfocustouchspell.possessed"),
      or(gte("spellcasting.arcane", 4), gte("spellcasting.divine", 4)),
    ],
  },
  {
    name: "Wandstrike",
    description: "As a standard action, you can make a melee touch attack with a wand, expending one charge to deal 1d6 points of damage to the creature struck. You apply no extra damage to this attack regardless of its source (including sneak attack, favored enemy, and smite bonuses), but you can activate the wand as part of the attack. If the spell cast from the wand is a ray or a targeted spell, the creature struck is the spell's target (with ray spells hitting automatically). If the spell affects an area or creates a spread, you can designate the spell's point of origin at any grid intersection point of the creature's space (but doing so might put you in the affected area). Spells with an effect that does not cover an area (such as the various summon monster spells) cannot be used with a wandstrike attack.",
    aptitudes: ["General"],
    requirements: [
      gte("skills.usemagicdevice.rank", 4),
    ],
  },
];

export const METAMAGIC_FEATS: FeatSeed[] = [
  {
    name: "Black Lore of Moil",
    description: "Any necromancy spell you cast can be cast instead as a Moilian spell, dealing an extra 1d6 points of negative energy damage +1d6 per two spell levels (+1d6 for 1st-level spells, +2d6 for 2nd- or 3rd-level spells, and so on). If the spell normally allows a saving throw, the target takes half the negative energy damage on a successful save, regardless of the outcome of the save on the spell's normal effect. In addition to its normal spell components, a Moilian spell requires the creation and expenditure of a Moilian runebone-- a small human bone (often a fi nger bone) scribed with carefully prepared arcane markings. Only a character trained in the Black Lore of Moil knows the secrets of creating a runebone, which takes 1 hour to craft and requires special inks and powders costing 25 gp per die of negative energy damage to be generated. For example, a runebone capable of adding 3d6 points of negative energy damage to a spell costs 75 gp to craft. While the maximum negative energy damage dealt by a Moilian spell is based on the spell's level, the actual damage is limited by the runebone. For example, if a sorcerer casts fi nger of death (a 7th-level spell, so normally +4d6) with a 75-gp (3d6) runebone, the spell deals only 3d6 points of additional negative energy damage. A Moilian spell uses a spell slot of the spell's normal level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.spellfocusnecromancy.possessed"),
      or(gte("spellcasting.arcane", 7), gte("spellcasting.divine", 7)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Born of the Three Thunders",
    description: "When you cast a spell with either the electricity descriptor or the sonic descriptor that deals hit point damage, you can declare that spell to be a spell of the three thunders, with half its damage dealt as electricity damage and half dealt as sonic damage. In addition, the spell concludes with a mighty thunderclap that stuns all creatures that take damage from the spell for 1 round unless they succeed on a Fortitude save, then knocks stunned creatures prone unless they succeed on a Reflex save (both saves at the same DC as the base spell). Channeling the three thunders is costly, though, and you are automatically dazed for 1 round after doing so. A three thunders spell uses a spell slot of the spell's normal level. In addition, its descriptor changes to include both energy types--for example, a lightning bolt of the three thunders is an evocation [electricity, sonic] spell.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.energysubstitutionelectricity.possessed"),
      gte("skills.knowledgenature.rank", 4),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Chain Spell",
    description: "Any spell that specifies a single target and has a range greater than touch can be chained so as to affect that primary target normally, then arc to a number of secondary targets equal to your caster level (maximum 20). Each arc affects one secondary target chosen by you, all of which must be within 30 feet of the primary target, and none of which can be affected more than once. You can choose to affect fewer secondary targets than the maximum. If the chained spell deals damage, the secondary targets each take half as much damage as the primary target (rounded down) and can attempt Reflex saving throws for half damage (whether the spell allows the original target a save or not). For spells that don't deal damage, the save DCs against arcing effects are reduced by 4. For example, if a 10th-level wizard normally casts cause fear at DC 14, a chained cause fear could target a goblin chieftain at DC 14 and up to ten of his nearby guards at DC 10. A chained spell uses up a spell slot three levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Cooperative Spell",
    description: "While the two of you are adjacent, you and another spellcaster with the Cooperative Spell feat can simultaneously cast the same spell at the same time in the round. Add +2 to the save DC of cooperatively cast spells and +1 to caster level checks to beat the target's spell resistance (if any), using the higher base DC and level check of either caster. A cooperative spell uses up a spell slot of the same level as the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Delay Spell",
    description: "When casting a spell, you set a delay of 1 to 5 rounds before it takes effect. The delay time cannot be changed once set; the spell activates just before your turn on the round you designate. Only area, personal, and touch spells can be affected by this feat. Any decisions you would make about the spell (including attack rolls, designating targets, or determining or shaping an area) are decided when the spell is cast, with any of its effects (including damage and saving throws) decided when the spell triggers. If conditions change during the delay period in ways that would make the spell impossible to cast (the target you designate moves beyond the spell's range, for example), the spell fails. During the delay period, a delayed spell can be dispelled normally, and it can be detected in the area or on the target (as applicable). A delayed spell uses up a spell slot three levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Energy Admixture",
    description: "Choose one type of energy (acid, cold, electricity, or fire) that matches an energy type you have selected for substitution via the Energy Substitution feat. You can then modify any spell with an energy descriptor by adding an equal amount of the chosen type of energy to the spell's normal effects. The altered spell works normally in all respects except for the type and amount of damage dealt, with each type of energy counting separately toward the spell's damage cap. Thus, an acid fi reball cast at 6th level deals 6d6 points offiredamage and 6d6 points of acid damage (rolled separately), while the same acid fi reball cast at 10th level or higher deals 10d6 points offiredamage and 10d6 points of acid damage. Even opposed types of energy (such asfireand cold) can be combined using this feat. An energy admixed spell uses up a spell slot four levels higher than the spell's actual level. As well, the spell's descriptor changes to include both energy types present in the spell-for example, the acid fi reball described above is an evocation [acid, fire] spell.",
    stackable: true,
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.energysubstitution.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Energy Substitution",
    description: "Choose one type of energy (acid, cold, electricity, or fire). You can then modify any spell with an energy descriptor to use the chosen type of energy instead. An energy substituted spell uses a spell slot of the spell's normal level. The spell's descriptor changes to the new energy type-for example, a fireball composed of cold energy is an evocation [cold] spell.",
    stackable: true,
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      gte("skills.knowledgearcana.rank", 5),
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Explosive Spell",
    description: "On a failed Refl ex save, an explosive spell ejects any creature caught in its area, sending it to a location outside the nearest edge of that area, dealing additional damage and further knocking creatures prone. For example, all creatures in the area of an explosive fireball that fail their saving throws not only take full damage but are pushed to the closest square outside the perimeter of the spell's 20-foot-radius spread. Likewise, an explosive lightning bolt moves targets that fail their saves to outside the area defi ned by the squares the bolt's line passes through. Any creature moved in this manner also takes an additional 1d6 points of damage per 10 feet moved (no additional damage if moved less than 10 feet by the effect) and is knocked prone. If some obstacle prevents a blasted creature from being moved to the edge of the effect, the creature is stopped and takes 1d6 points of damage from striking the barrier (in addition to any damage taken from the distance moved before then). In any event, this movement does not provoke attacks of opportunity. Explosive Spell can be applied only to spells that allow Refl ex saves and affect an area (a cone, cylinder, line, or burst). An explosive spell uses up a spell slot two levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Fortify Spell",
    description: "A fortified spell is treated as having a higher caster level for the purpose of defeating a target's spell resistance. You prepare and cast the spell in a higher-level spell slot than normal, with each additional level giving a +2 bonus on spell penetration checks for the altered spell. Spells that are not subject to spell resistance are not affected. A fortified spell uses up a spell slot at least one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Lord of the Uttercold",
    description: "You can turn spells with the cold descriptor into uttercold spells. Half the damage dealt by an uttercold spell is cold damage, and the other half is negative energy damage. The spell's saving throw remains unchanged, but creatures can apply cold resistance or immunity to cold only to the cold portion of the damage. An undead creature can be healed by the negative energy damage of an uttercold spell, though if it doesn't have resistance to cold, the effects of damage and healing cancel each other out. An uttercold spell uses a spell slot of the spell's normal level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.energysubstitutioncold.possessed"),
      gte("skills.knowledgetheplanes.rank", 9),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Nonlethal Substitution",
    description: "Choose one type of energy (acid, cold, electricity, or fire). You can then modify any spell with the chosen descriptor to deal nonlethal damage instead of normal energy damage. The nonlethal spell works normally in all respects except the type of damage dealt-for example, a nonlethal fireball has the same range and area, but since it deals nonlethal damage instead of energy damage, it will not damage objects or set fire to combustibles in the area. A nonlethal spell uses a spell slot one level higher than the spell's normal level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      gte("skills.knowledgearcana.rank", 5),
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Persistent Spell",
    description: "Spells with a fixed or personal range can have their duration increased to 24 hours. Spells of instantaneous duration cannot be affected by this feat, nor can spells whose effects are discharged. You don't need to maintain concentration on persistent detect spells (such as detect magic or detect thoughts) for you to be aware of the mere presence or absence of the subject detected, but gaining additional information requires concentration as normal. A persistent spell uses up a spell slot six levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.extendspell.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Repeat Spell",
    description: "A repeated spell is automatically cast again at the beginning of your turn in the following round. No matter where you might have moved in the previous round, the second spell originates from the same location and affects the same area as the original spell. If the original spell designates a ranged target, the repeated spell affects the same target if it is within 30 feet of its original position; otherwise, the second spell fails. Touch range spells cannot be affected by this feat. A repeated spell uses up a spell slot three levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sanctum Spell",
    description: "A sanctum spell has an effective spell level 1 higher than its normal level if cast in your sanctum, but if not cast in the sanctum, the spell has an effective spell level 1 lower than normal. All effects dependent on spell level (including save DCs) are calculated according to the adjusted level. A sanctum spell uses a spell slot of the spell's normal level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sculpt Spell",
    description: "You can modify an area spell by changing the area's shape to either a cylinder (10-foot radius, 30 feet high), a 40-foot cone, four 10-foot cubes, a ball (20-foot-radius spread), or a 120-foot line. The sculpted spell works normally in all respects except for its shape. For example, a lightning bolt whose area is changed to a ball deals the same amount of damage, but affects a 20-foot-radius spread. A sculpted spell uses a spell slot one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Split Ray",
    description: "You can cause any ray spell tofireone additional ray beyond the number normally allowed. The additional ray requires a separate ranged touch attack roll to hit and deals damage as normal. It can be fi red at the same target as the fi rst ray or at a different target, but all rays must be aimed at targets within 30 feet of each other and fi red simultaneously. A split ray spell uses a spell slot two levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Empower",
    description: "Once per day, you can apply the effect of the Empower Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Empower Spell normally if you have it",
    aptitudes: ["General", "Wizard Bonus Feat", "Warmage Class Feature"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Extend",
    description: "Once per day, you can apply the effect of the Extend Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Extend Spell normally if you have it.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Maximize",
    description: "Once per day, you can apply the effect of the Maximize Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Maximize Spell normally if you have it.",
    aptitudes: ["General", "Wizard Bonus Feat", "Warmage Class Feature"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Quicken",
    description: "Once per day, you can apply the effect of the Quicken Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Quicken Spell normally.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.quickenspell.possessed"),
      eq("feats.suddenempower.possessed"),
      eq("feats.suddenextend.possessed"),
      eq("feats.suddenmaximize.possessed"),
      eq("feats.suddensilent.possessed"),
      eq("feats.suddenstill.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Silent",
    description: "Once per day, you can apply the effect of the Silent Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Silent Spell normally if you have it.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Still",
    description: "Once per day, you can apply the effect of the Still Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Still Spell normally if you have it.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Sudden Widen",
    description: "Once per day, you can apply the effect of the Widen Spell feat to any spell you cast without increasing the level of the spell or specially preparing it ahead of time. You can still use Widen Spell normally if you have it.",
    aptitudes: ["General", "Wizard Bonus Feat", "Warmage Class Feature"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Transdimensional Spell",
    description: "A transdimensional spell has its full normal effect on incorporeal creatures, creatures on the Ethereal Plane or the Plane of Shadow, and creatures within an extradimensional space in the spell's area. Such creatures include ethereal creatures, creatures that are blinking or shadow walking, manifested ghosts, and creatures within the extradimensional space of a rope trick, portable hole, or familiar pocket. You must be able to perceive a creature to target it with a transdimensional spell, but you do not need to perceive a creature to catch it in the area of a burst, cone, emanation, or spread. A transdimensional spell uses up a spell slot one level higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
  {
    name: "Twin Spell",
    description: "Casting a twinned spell causes the spell to take effect twice in the same area or on the same target simultaneously. Any variable characteristics (including attack rolls) or decisions you would make about the spell (including target and area), are applied to both spells, with affected creatures receiving all the effects of each spell individually (including getting two saving throws if applicable). A spell whose effects wouldn't stack if it was cast twice under normal circumstances will create redundant effects if successfully twinned. For example, a twinned charm person doesn't create a more potent or long-lasting effect, but any ally of the target would have to succeed on two dispel attempts in order to free the target from the charm. As with other metamagic feats, twinning a spell does not affect its vulnerability to counterspelling, so a single successful counterspell negates both instances of a twinned spell. A twinned spell uses up a spell slot four levels higher than the spell's actual level.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      eq("feats.metamagic.*.possessed"),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Metamagic" },
    ],
  },
];

export const ITEM_CREATION_FEATS: FeatSeed[] = [
  {
    name: "Craft Contingent Spell",
    description: "You can make contingent any spell that you know. Crafting a contingent spell takes one day for each 1,000 gp in its base price (spell level Ã- caster level Ã- 100 gp). To craft a contingent spell, you must spend 1/25 of this base price in XP and use up raw materials costing one-half the base price. Some spells incur extra costs in material components or XP (as noted in their descriptions), which must be paid when the contingent spell is created. See Contingent Spells, for more information.",
    aptitudes: ["General", "Wizard Bonus Feat"],
    requirements: [
      or(gte("spellcasting.arcane", 11), gte("spellcasting.divine", 11)),
    ],
    properties: [
      { type: "FEAT_FAMILY", value: "Item Creation" },
    ],
  },
];

export const DRACONIC_FEATS: FeatSeed[] = [
  {
    name: "Draconic Breath",
    description: "As a standard action, you can change arcane spell energy into a breath weapon of your draconic heritage energy type. The breath weapon is a 30-foot cone (fire or cold) or a 60-foot line (acid or electricity) that deals 2d6 points of damage per level of the spell that you expended to create the effect. Any creature in the area can make a Reflex save (DC 10 + level of the spell used + your Cha modifier) for half damage. This is a supernatural ability.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
];

export const HERITAGE_FEATS: FeatSeed[] = [
  {
    name: "Draconic Claw",
    description: "You gain claws. You can make a natural attack with your claw, dealing damage based on your size (Small 1d4, Medium 1d6, Large 1d8). In any round when you cast a spell with a casting time of 1 standard action, you can make a single claw attack as a swift action against an opponent you threaten",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
  {
    name: "Draconic Flight",
    description: "After you cast an arcane spell with a casting time of 1 standard action, you gain a fl y speed equal to 10 feet per level of the spell you just cast for the remainder of your turn",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
  {
    name: "Draconic Heritage",
    description: "Choose one dragon from the Draconic Heritage list below and gain the indicated skill as a class skill. This is your draconic heritage, which cannot be changed once the feat has been taken. Half-dragons must choose the same dragon kind as their dragon parent. In addition, you gain a bonus on saving throws against sleep and paralysis, as well as spells and abilities with the energy type of your Draconic Heritage. This bonus is equal to the number of draconic feats you have. Draconic Heritage. Dragon -- Energy ----- Skill. Black -----Acid ---------Hide. Blue ------Electricity --- Listen. Green ----Acid -------- Move Silently. Red ------ Fire --------- Intimidate. White ---- Cold -------- Balance. Brass ---- Fire -------- Gather Information. Bronze -- Electricity -- Survival. Copper -- Acid -------- Hide. Gold ----- Fire --------- Heal. Silver ---- Cold -------- Disguise.",
    aptitudes: ["General"],
    requirements: [
      gte("classes.sorcerer.level", 1),
    ],
  },
  {
    name: "Draconic Legacy",
    description: "Based on your draconic heritage, add the following spells to your list of spells known. Each spell is added at the level that a spellcaster would normally gain it unless otherwise indicated. Draconic Legacy Dragon Kind Spells Known Black Charm animal (snakes and lizards only), deeper darkness, insect plague. Blue --- Major image, mirage arcane, ventriloquism. Green - Charm person, dominate person, plant growth. Red ---- Detect secret doors, suggestion, true seeing. White -- Obscuring mist, sleet storm, wall of ice (5th level). Brass - Control winds, endure elements, tongues Bronze Control water (5th level), speak with animals, water breathing. Copper - Silent image, stone shape, wall of stone Gold Bless, daylight, dispel evil. Silver -- Air walk (5th level), feather fall, wind wall.",
    aptitudes: ["General"],
  },
  {
    name: "Draconic Power",
    description: "Your caster level increases by 1, and you add 1 to the save DC of all arcane spells with the energy descriptor of the same energy type as determined by your draconic heritage.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
  {
    name: "Draconic Presence",
    description: "Whenever you cast an arcane spell, all opponents within 10 feet of you who have fewer Hit Dice than you become shaken for a number of rounds equal to the level of the spell you cast. The effect is negated by a Will save (DC 10 + level of the spell cast + your Cha modifier). A successful save indicates that the opponent is immune to your draconic presence for 24 hours. This ability does not affect creatures with an Intelligence of 3 or lower or creatures that are already shaken, nor does it have any effect on dragons.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
  {
    name: "Draconic Resistance",
    description: "You gain resistance to the energy type of your draconic heritage equal to three times the number of draconic feats you currently have (including draconic feats you take after gaining this feat).",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
  {
    name: "Draconic Skin",
    description: "Your natural armor increases by 1.",
    aptitudes: ["General"],
    requirements: [
      eq("feats.draconicheritage.possessed"),
    ],
  },
];

export const arcaneDefense: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({
  name: `Arcane Defense: ${s}`,
  description: `You get a +3 bonus on your saving throws against spells from the chosen school.`,
  aptitudes: ["General"],
  requirements: [
    eq(feat(`Spell Focus: ${s}`)),
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Arcane Defense" }],
}));

export const precociousApprentice: FeatSeed[] = MAGIC_SCHOOLS.map((s) => ({
  name: `Precocious Apprentice: ${s}`,
  description: `Choose one 2nd-level spell from a school of magic you have access to. You gain an extra 2nd-level spell slot that must be used initially to cast only the chosen spell. Until your level is high enough to allow you to cast 2nd-level spells, you must succeed on a DC 8 caster level check to successfully cast this spell; if you fail, the spell is miscast to no effect. Your caster level with the chosen spell is your normal caster level, even if this level is insufficient to cast the spell under normal circumstances. When you become able to cast 2nd-level spells, you lose the benefit described above but retain the extra 2nd-level spell slot, which you can use to prepare or spontaneously cast a spell of 2nd level or lower as you normally would. Finally, you gain a +2 bonus on all Spellcraft checks.`,
  aptitudes: ["General"],
  modifiers: [
    { target: `skills.spellcraft.misc`, operator: "add", value: "2", valueType: "number" },
  ],
  properties: [{ type: "FEAT_FAMILY", value: "Precocious Apprentice" }],
}));
