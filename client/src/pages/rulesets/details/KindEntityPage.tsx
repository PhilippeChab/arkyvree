import { Navigate, useLocation, useParams } from "react-router-dom";

import { useRules } from "@/client/src/hooks/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import EntityDetailsPage from "./entities/EntityDetailsPage.tsx";
import ProgressionOwnerPage from "./owners/ProgressionOwnerPage.tsx";

/**
 * A ruleset entity's page, by its kind's URL segment (`section`), as its kind opens it, among every base rules' kinds
 * (a kind is one module's, and the app has loaded their rules before any page): a progression owner's page and its tab
 * (`tab`) for a kind whose row opens its progression, else its own page, which has no tabs.
 */
export default function KindEntityPage() {
  const {
    id = "",
    section = "",
    entityId = "",
    tab,
  } = useParams<{
    entityId: string;
    id: string;
    section: string;
    tab?: string;
  }>();
  const location = useLocation();
  const { all } = useRules();
  const rules = Object.values(all ?? {}).find((each) =>
    each.kinds.some((kind) => getUrlSegment(kind.type) === section),
  );
  const kind = rules?.kinds.find((each) => getUrlSegment(each.type) === section);
  if (rules && kind?.opens === "progression") return <ProgressionOwnerPage ownerType={kind.type} rules={rules} />;
  if (tab !== undefined)
    return <Navigate to={`/rulesets/${id}/${section}/${entityId}${location.search}`} replace state={location.state} />;
  return <EntityDetailsPage />;
}
