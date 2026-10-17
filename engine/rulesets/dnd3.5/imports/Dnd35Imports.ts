import { ImportsPart } from "@/engine/core/module/index.ts";

import PcgenImporter from "./pcgen/PcgenImporter.ts";

/**
 * The 3.5 imports: a ruleset of the 3.5 rules, the built-in one or a custom one built on it, imports characters from
 * these programs' files, PCGen's first.
 */
export default class Dnd35Imports extends ImportsPart {
  protected override readonly importers = [new PcgenImporter()];
}
