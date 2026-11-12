/**
 * Every user-facing label for statuses and record types lives here,
 * so technical words never leak into the interface.
 */

export const ROLE_LABEL = {
  admin: "Global Admin",
  manager: "Dham Manager",
  devotee: "Devotee",
} as const;
export type Role = keyof typeof ROLE_LABEL;

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "purple";

export const REPORT_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  draft: { label: "Not Submitted", tone: "gray", help: "Saved but not yet sent to the Manager." },
  submitted: { label: "Being Reviewed", tone: "blue", help: "Sent to the Manager. Waiting for review." },
  approved: { label: "Approved", tone: "green", help: "Checked by the Manager. Book stock has been updated." },
  changes_required: { label: "Changes Required", tone: "amber", help: "The Manager asked for corrections. Please edit and send again." },
  rejected: { label: "Rejected", tone: "red", help: "The Manager did not accept this report. See the reason." },
};

export const MONEY_STATUS: Record<string, { label: string; tone: Tone; help: string }> = {
  submitted: { label: "Waiting for Manager", tone: "blue", help: "The Manager has not yet confirmed receiving this money." },
  received: { label: "Received by Manager", tone: "green", help: "The Manager confirmed receiving this money." },
  disputed: { label: "Changes Required", tone: "amber", help: "The Manager could not match this money. See the note." },
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
};

export const SIZE_LABEL: Record<string, string> = { big: "Big book", small: "Small book" };
export type BookSize = "big" | "small";
