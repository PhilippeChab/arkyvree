import ruleset from "@/database/packages/dnd35/v1/0_ruleset.ts";
import aptitudes from "@/database/packages/dnd35/v1/1_aptitudes.ts";
import languages from "@/database/packages/dnd35/v1/2_languages.ts";
import races from "@/database/packages/dnd35/v1/3_races.ts";
import abilities from "@/database/packages/dnd35/v1/4_abilities.ts";
import skills from "@/database/packages/dnd35/v1/5_skills.ts";
import saves from "@/database/packages/dnd35/v1/6_saves.ts";
import feats from "@/database/packages/dnd35/v1/feats/index.ts";
import classes from "@/database/packages/dnd35/v1/classes/index.ts";
import items from "@/database/packages/dnd35/v1/items/index.ts";
import powers from "@/database/packages/dnd35/v1/9_powers.ts";
import wizardSchools from "@/database/packages/dnd35/v1/10_wizardSchools.ts";
import domains from "@/database/packages/dnd35/v1/11_domains.ts";
import familiars from "@/database/packages/dnd35/v1/familiars/seed.ts";
import animalcompanions from "@/database/packages/dnd35/v1/animalcompanions/seed.ts";
import mounts from "@/database/packages/dnd35/v1/mounts/seed.ts";

export default [
  ruleset, aptitudes, languages, races, abilities, skills, saves, feats, classes,
  items, powers, wizardSchools, domains,
  familiars, animalcompanions, mounts,
];
