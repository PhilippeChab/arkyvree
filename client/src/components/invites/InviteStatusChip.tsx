import { StatusChip } from "@/client/src/components/common/index.ts";

interface InviteStatusChipProps {
  /** Its invite's status: a contributor's (Pending, Active, Rejected, Revoked) or a campaign invite's. */
  status: string;
}

/** A status's color: pending orange, accepted green, rejected red, any other grey. */
function statusColor(status: string): "default" | "error" | "success" | "warning" {
  switch (status) {
    case "Pending":
      return "warning";
    case "Accepted":
    case "Active":
      return "success";
    case "Rejected":
      return "error";
    default:
      return "default";
  }
}

/** An invite's status, a contributor's too, in one color wherever it shows: the contributors' table, an invite's page. */
export function InviteStatusChip({ status }: InviteStatusChipProps) {
  return <StatusChip label={status} color={statusColor(status)} />;
}
