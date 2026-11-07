/**
 * The descriptions the SRD 5.2.1 doesn't give, in our own words, as Pathfinder's classes and races have: a class's,
 * a species', a weapon's and an armor's. The SRD gives them none (a class opens on its Core Traits table, a weapon is a
 * row of the Weapons table), and the data has none either. Each is one short sentence.
 */

/** An armor's description, the Shield's too, by its name. */
export const ARMOR_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Breastplate: "A fitted metal chest plate.",
  "Chain Mail": "A full suit of interlocking metal rings.",
  "Chain Shirt": "A shirt of metal rings, worn under clothing.",
  "Half Plate Armor": "Metal plates covering most of the body.",
  "Hide Armor": "Thick furs and pelts.",
  "Leather Armor": "Stiffened leather.",
  "Padded Armor": "Quilted layers of cloth.",
  "Plate Armor": "Shaped metal plates covering the whole body.",
  "Ring Mail": "Leather with heavy metal rings sewn on.",
  "Scale Mail": "A coat of overlapping metal scales.",
  Shield: "A wood or metal shield, carried in one hand.",
  "Splint Armor": "Metal strips riveted onto leather.",
  "Studded Leather Armor": "Leather reinforced with rivets.",
};

/** A class's description, by its name. */
export const CLASS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Barbarian: "A fierce warrior who fights in a Rage.",
  Bard: "A performer whose music and words carry magic.",
  Cleric: "A priest who channels divine magic.",
  Druid: "A guardian of nature who casts primal magic and takes animal forms.",
  Fighter: "A master of weapons and armor.",
  Monk: "A martial artist who fights with fists and focus.",
  Paladin: "A holy warrior bound by a sacred oath.",
  Ranger: "A wilderness hunter who mixes weapons and nature magic.",
  Rogue: "A sneaky expert who strikes where it hurts most.",
  Sorcerer: "A spellcaster born with magic in their blood.",
  Warlock: "A spellcaster whose magic comes from a pact with a patron.",
  Wizard: "A scholar who learns spells from a spellbook.",
};

/** A species' description, by its name. */
export const SPECIES_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Dragonborn: "Proud folk with draconic ancestry and a breath weapon.",
  Dwarf: "Sturdy, hardy folk who see well in the dark.",
  Elf: "Graceful folk of fey descent with keen senses.",
  Gnome: "Small, clever folk with a gift for magic.",
  Goliath: "Towering folk descended from giants.",
  Halfling: "Small, lucky folk who slip past danger.",
  Human: "Adaptable folk found in every land.",
  Orc: "Strong, tireless folk who keep fighting when hurt.",
  Tiefling: "Folk with fiendish ancestry and a touch of infernal magic.",
};

/** A weapon's description, by its name. */
export const WEAPON_DESCRIPTIONS: Readonly<Record<string, string>> = {
  Battleaxe: "A heavy axe, swung in one hand or two.",
  Blowgun: "A tube that shoots needles with a puff of breath.",
  Club: "A simple wooden club.",
  Dagger: "A short blade, easy to hide and to throw.",
  Dart: "A small weighted spike, thrown by hand.",
  Flail: "A spiked ball on a chain, fixed to a handle.",
  Glaive: "A long pole topped with a heavy blade.",
  Greataxe: "A huge axe, swung with both hands.",
  Greatclub: "A massive wooden club, swung with both hands.",
  Greatsword: "A huge sword, swung with both hands.",
  Halberd: "A long pole topped with an axe blade and a spike.",
  "Hand Crossbow": "A small crossbow, fired with one hand.",
  Handaxe: "A small axe, for chopping or throwing.",
  "Heavy Crossbow": "A large, powerful crossbow.",
  Javelin: "A light spear made for throwing.",
  Lance: "A long spear used from horseback.",
  "Light Crossbow": "A crossbow light enough to carry anywhere.",
  "Light Hammer": "A small hammer, for striking or throwing.",
  Longbow: "A tall bow that shoots far.",
  Longsword: "A straight, double-edged blade, used in one hand or two.",
  Mace: "A metal club with a heavy head.",
  Maul: "A huge hammer, swung with both hands.",
  Morningstar: "A club topped with a spiked metal ball.",
  Musket: "A long firearm that shoots lead balls.",
  Pike: "A very long spear that strikes from a distance.",
  Pistol: "A small firearm, fired with one hand.",
  Quarterstaff: "A long wooden staff, used in one hand or two.",
  Rapier: "A thin, light sword made for quick thrusts.",
  Scimitar: "A light, curved sword.",
  Shortbow: "A small bow, easy to handle.",
  Shortsword: "A short blade for quick strikes.",
  Sickle: "A curved farming blade.",
  Sling: "A strap that hurls stones or bullets.",
  Spear: "A pointed shaft, thrown or thrust.",
  Trident: "A three-pronged spear.",
  "War Pick": "A heavy pick that punches through armor.",
  Warhammer: "A heavy war hammer, used in one hand or two.",
  Whip: "A long leather lash that strikes from a distance.",
};

/** A name's description among `descriptions` (`what`, their kind, for a refusal): refused when it has none. */
export function readDescription(descriptions: Readonly<Record<string, string>>, name: string, what: string): string {
  const description = descriptions[name];
  if (!description) throw new Error(`${name}: no ${what} description in codegen/dnd5.2/tools/terms/descriptions.ts`);
  return description;
}
