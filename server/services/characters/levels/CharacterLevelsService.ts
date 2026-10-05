import { include } from "@/server/mixins.ts";

import { ChangesLevels } from "./dnd3.5/concerns/ChangesLevels.ts";
import { CountsSlots } from "./dnd3.5/concerns/CountsSlots.ts";
import { OffersClasses } from "./dnd3.5/concerns/OffersClasses.ts";
import { OffersFeats } from "./dnd3.5/concerns/OffersFeats.ts";
import { OffersPowers } from "./dnd3.5/concerns/OffersPowers.ts";
import { Previews } from "./dnd3.5/concerns/Previews.ts";
import { ReadsLevels } from "./dnd3.5/concerns/ReadsLevels.ts";

/**
 * A character's levels: what a level-up offers and its slots, its preview, and adding, editing and removing levels.
 * Each concern is D&D 3.5's (`dnd3.5/concerns/`, on the helpers beside them: the projection, the slot distribution, the
 * validation): when a second ruleset ships, its operations dispatch from here by the character's ruleset.
 */
class CharacterLevelsService extends include(
  Object,
  CountsSlots,
  OffersClasses,
  OffersFeats,
  OffersPowers,
  Previews,
  ReadsLevels,
  ChangesLevels,
) {}

export default new CharacterLevelsService();
