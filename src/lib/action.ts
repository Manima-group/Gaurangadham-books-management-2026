import type { ZodError } from "zod";

export type ActionState = {
  status: "idle" | "success" | "error";
  /** Headline, e.g. "Successfully received 500 copies of Bhagavad Gita." */
  message?: string;
  /** Explains what happens next, or how to fix an error. */
  detail?: string;
  fieldErrors?: Record<string, string>;
  /** Optional link shown with a success message */
  next?: { label: string; href: string };
  at?: number;
};

export const idle: ActionState = { status: "idle" };

export function ok(message: string, detail?: string, next?: ActionState["next"]): ActionState {
  return { status: "success", message, detail, next, at: Date.now() };
}

export function fail(message: string, detail?: string, fieldErrors?: Record<string, string>): ActionState {
  return { status: "error", message, detail, fieldErrors, at: Date.now() };
}

export function fromZod(err: ZodError, message = "Please check the highlighted fields."): ActionState {
  const fe: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".");
    if (!fe[k]) fe[k] = i.message;
  }
  return fail(message, undefined, fe);
}
