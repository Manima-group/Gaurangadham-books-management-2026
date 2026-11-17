/**
 * Every user-facing label for statuses and record types lives here,
 * so technical words never leak into the interface.
 */

export const ROLE_LABEL = {
  admin: "Chakra Sevak",
  manager: "Sector Sevak",
  devotee: "Devotee",
} as const;
export type Role = keyof typeof ROLE_LABEL;

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "purple";

export const REPORT_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  draft: { label: "Not Submitted", tone: "gray", help: "Saved but not yet sent to the Sector Sevak." },
  submitted: { label: "Being Reviewed", tone: "blue", help: "Sent to the Sector Sevak. Waiting for review." },
  approved: { label: "Approved", tone: "green", help: "Checked by the Sector Sevak. Book stock has been updated." },
  changes_required: { label: "Changes Required", tone: "amber", help: "The Sector Sevak asked for corrections. Please edit and send again." },
  rejected: { label: "Rejected", tone: "red", help: "The Sector Sevak did not accept this report. See the reason." },
};

export const MONEY_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  submitted: { label: "Waiting for Sector Sevak", tone: "blue", help: "The Sector Sevak has not yet confirmed receiving this money." },
  received: { label: "Received by Sector Sevak", tone: "green", help: "The Sector Sevak confirmed receiving this money." },
  disputed: { label: "Changes Required", tone: "amber", help: "The Sector Sevak could not match this money. See the note." },
};

/** Money position of a devotee or Dham. */
/** Handing over money is optional and can happen any time — so these labels inform, never alarm. */
export function moneyPosition(collected: number, submitted: number): { label: string; tone: Tone } {
  if (collected <= 0 && submitted <= 0) return { label: "Nothing to hand over", tone: "gray" };
  if (submitted >= collected) return { label: "All handed over", tone: "green" };
  if (submitted > 0) return { label: "Partly handed over", tone: "blue" };
  return { label: "Not handed over yet", tone: "gray" };
}

export const METHOD_LABEL: Record<string, string> = {
  cash: "Cash (handed over)",
  upi: "UPI",
  bank: "Bank transfer",
};

export const MOVEMENT_LABEL: Record<string, string> = {
  received: "Books received",
  assign_dham: "Assigned to Dham",
  assign_devotee: "Given to devotee",
  sold: "Sold",
  returned: "Returned to Dham",
  damaged: "Damaged / lost",
  correction: "Undone (correction)",
  transfer_out: "Sent to another Dham",
  transfer_in: "Received from another Dham",
};

export const SIZE_LABEL: Record<string, string> = { big: "Big book", small: "Small book" };
export type BookSize = "big" | "small";

export const TRANSFER_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  requested: { label: "Requested", tone: "blue", help: "Waiting for the sending Dham to check and approve." },
  approved: { label: "Approved", tone: "purple", help: "Approved. Waiting for the sending Dham to send the books." },
  sent: { label: "Sent — on the way", tone: "amber", help: "Books have left the sending Dham. Confirm when they arrive." },
  received: { label: "Received", tone: "green", help: "Books reached the requesting Dham. Counts are updated." },
  declined: { label: "Declined", tone: "red", help: "The sending Dham could not send these books." },
  cancelled: { label: "Cancelled", tone: "gray", help: "The request was withdrawn." },
};
