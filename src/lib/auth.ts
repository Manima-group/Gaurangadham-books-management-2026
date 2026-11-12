import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    disableSignUp: true, // accounts are created by Admin only
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days — devotees should rarely need to log in again
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "devotee" },
      dhamId: { type: "number", input: false, required: false },
      phone: { type: "string", input: false, required: false },
      isActive: { type: "boolean", input: false, defaultValue: true },
      onboarded: { type: "boolean", input: false, defaultValue: false },
    },
  },
  plugins: [nextCookies()],
});

/** Hash a password exactly the way Better Auth does, for admin-created accounts. */
export async function hashPassword(pw: string) {
  const ctx = await auth.$context;
  return ctx.password.hash(pw);
}
