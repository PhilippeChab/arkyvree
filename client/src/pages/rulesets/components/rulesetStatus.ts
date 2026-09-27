import {
  Archive as ArchiveIcon,
  CheckCircle as PublishedIcon,
  EditNote as DraftIcon,
} from "@mui/icons-material";

/** A ruleset status's icon, color and explanation, for the list's pills and the page's chip. */
export const RULESET_STATUS = {
  Draft: {
    icon: DraftIcon,
    color: "info",
    tooltip: "Fully editable — add, edit, and delete entities. Only visible to you until published.",
  },
  Published: {
    icon: PublishedIcon,
    color: "success",
    tooltip: "Available for others to use. You can still add, edit, and delete entities — characters that depend on a deletion will block it.",
  },
  Archived: {
    icon: ArchiveIcon,
    color: "default",
    tooltip: "Read-only. Can be un-archived later.",
  },
} as const;
