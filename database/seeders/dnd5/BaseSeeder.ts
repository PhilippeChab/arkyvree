import { include } from "@/lib/mixins.ts";

import { SeedsAptitudes } from "./concerns/SeedsAptitudes.ts";
import { SeedsCoreRules } from "./concerns/SeedsCoreRules.ts";
import { SeedsFeats } from "./concerns/SeedsFeats.ts";
import { Dnd5ContentSeeder } from "./Dnd5ContentSeeder.ts";

/**
 * The D&D 5th Edition seeder's core, which its other steps (`concerns/`) build on: a content seeder of its content
 * (`Dnd5ContentSeeder`: its context, the rows and their inserts), and the steps that write its aptitudes, abilities,
 * saves and languages, and feats, which the others name.
 */
export abstract class BaseSeeder extends include(Dnd5ContentSeeder, SeedsAptitudes, SeedsCoreRules, SeedsFeats) {}
