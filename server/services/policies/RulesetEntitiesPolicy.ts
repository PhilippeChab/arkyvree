import { type Aptitude, type Feat, type Item, type Klass, type Language, type Power, type Race, type Skill } from "@/shared/relations.ts";
import BasePolicy from "./BasePolicy.ts";

type RulesetEntity = Skill | Feat | Power | Item | Race | Language | Klass | Aptitude;

export default class RulesetEntitiesPolicy extends BasePolicy<RulesetEntity> {
  canCreate() {
    return true;
  }

  canRead() {
    return true;
  }

  canUpdate() {
    return true;
  }

  canDelete() {
    return true;
  }
}
