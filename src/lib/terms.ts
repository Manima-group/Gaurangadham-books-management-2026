/**
 * Every user-facing label for statuses and record types lives here,
 * so technical words never leak into the interface.
 */

export const ROLE_LABEL = {
  admin: "Chakra Sevak",
  manager: "Sector Sevak",
  devotee: "Devotee",
  contact: "Contact Collection Sevak",
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
  transfer_out: "Books Transfer — sent",
  transfer_in: "Given to Devotee — Transfer / received",
  transfer_return: "Books Transfer — returned to sender",
  transfer_loss: "Books Transfer — written off",
};

export const SIZE_LABEL: Record<string, string> = { big: "Big book", small: "Small book" };
export type BookSize = "big" | "small";

export const TRANSFER_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  requested: { label: "Requested", tone: "blue", help: "Waiting for the source Dham's Sector Sevak to check and approve." },
  approved: { label: "Approved", tone: "purple", help: "Approved copies are reserved. Waiting for the sender to accept and send." },
  accepted: { label: "Accepted by sender", tone: "purple", help: "The sender is preparing the books." },
  sent: { label: "Dispatched — on the way", tone: "amber", help: "Books left the sender. The receiver confirms what arrives." },
  partially_received: { label: "Partially received", tone: "amber", help: "Some copies have not arrived yet. They stay “on the way” until received or reconciled." },
  disputed: { label: "Disputed", tone: "red", help: "The receiver reported missing, damaged or wrong books. The sending Dham reconciles." },
  received: { label: "Completed", tone: "green", help: "All books reached the receiver." },
  completed: { label: "Completed", tone: "green", help: "Every dispatched copy is accounted for." },
  declined: { label: "Rejected", tone: "red", help: "The source Dham could not give these books." },
  cancelled: { label: "Cancelled", tone: "gray", help: "The request was withdrawn before dispatch." },
};

/** Timeline wording for each recorded step. */
export const TRANSFER_EVENT: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  partially_approved: "Partially approved",
  declined: "Rejected",
  accepted: "Accepted by sender",
  sent: "Dispatched",
  received: "Received",
  partially_received: "Partially received",
  disputed: "Received with a problem",
  reconciled: "Reconciled",
  completed: "Completed",
  cancelled: "Cancelled",
};
