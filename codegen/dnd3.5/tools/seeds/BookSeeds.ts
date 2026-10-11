import { include } from "@/lib/mixins.ts";

import { BaseBookSeeds } from "./BaseBookSeeds.ts";
import { CollectsAptitudes } from "./concerns/CollectsAptitudes.ts";
import { Copies } from "./concerns/Copies.ts";

/**
 * A book's seeds: each kind of its references' seeds (`BaseBookSeeds`: `classes`, `feats`, `spells`…, each built once
 * per reference), and what's made of several kinds, a concern each (`concerns/`): the aptitudes its seeds use, what it
 * copies from the core rules.
 */
export class BookSeeds extends include(BaseBookSeeds, CollectsAptitudes, Copies) {}
