/** The contributor forms, empty: what their dialogs open on. */

import type { InviteContributorFormData } from "./InviteContributorDialog.tsx";

/** An invite's form, empty: an Editor's (a character's invite asks no role). */
export const EMPTY_INVITE: InviteContributorFormData = { email: "", role: "Editor" };
