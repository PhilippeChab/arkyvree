import { include } from "@/server/mixins.ts";

import { BaseRequirementReading } from "./BaseRequirementReading.ts";
import { ReadsAlignment } from "./concerns/ReadsAlignment.ts";
import { ReadsAnyFeats } from "./concerns/ReadsAnyFeats.ts";
import { ReadsFeatOptions } from "./concerns/ReadsFeatOptions.ts";
import { ReadsSkills } from "./concerns/ReadsSkills.ts";

/**
 * A prerequisite, read (a feat's, `FeatPrerequisites`; a class's, `ClassPrerequisites`): the requirements it gives,
 * what no requirement can say, the invalid paths (`BaseRequirementReading`), and the readings both kinds share, a
 * concern each (`concerns/`): an alignment, any feat of a family, a feat's options, any skill of a family.
 */
export class RequirementReading extends include(
  BaseRequirementReading,
  ReadsAlignment,
  ReadsAnyFeats,
  ReadsFeatOptions,
  ReadsSkills,
) {}
