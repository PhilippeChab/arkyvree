import { include } from "@/lib/mixins.ts";

import { BaseRequirementReading } from "./BaseRequirementReading.ts";
import { ReadsAlignment } from "./concerns/ReadsAlignment.ts";
import { ReadsAnyFeats } from "./concerns/ReadsAnyFeats.ts";
import { ReadsCasting } from "./concerns/ReadsCasting.ts";
import { ReadsClassFeatures } from "./concerns/ReadsClassFeatures.ts";
import { ReadsFeatOptions } from "./concerns/ReadsFeatOptions.ts";
import { ReadsSizes } from "./concerns/ReadsSizes.ts";
import { ReadsSkills } from "./concerns/ReadsSkills.ts";

/**
 * A prerequisite, read (a feat's, `FeatPrerequisites`; a class's, `ClassPrerequisites`): the requirements it gives,
 * what no requirement can say, the invalid paths (`BaseRequirementReading`), and the readings both kinds share, a
 * concern each (`concerns/`): an alignment, any feat of a family, spellcasting, a class feature (any class's), a feat's
 * options and an exotic weapon's proficiency, a size, a skill's ranks.
 */
export class RequirementReading extends include(
  BaseRequirementReading,
  ReadsAlignment,
  ReadsAnyFeats,
  ReadsCasting,
  ReadsClassFeatures,
  ReadsFeatOptions,
  ReadsSizes,
  ReadsSkills,
) {}
