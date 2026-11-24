import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import type { AppUser } from "./session";

export const INVITE_DAYS = [30, 90, 180] as const;
/** Sign-ups allowed per network address per hour, and per invite per hour. */
export const RATE = { perIpHour: 30, perInviteHour: 120 };

export const newToken = () => randomBytes(24).toString("base64url"); // 192 bits, unguessable
export const ipHash = (ip: string) => createHash("sha256").update(`gd-reg:${ip}`).digest("hex").slice(0, 32);

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown").split(",")[0].trim();
}

/** Public address of this app (for the link inside the QR). */
export async function baseUrl() {
  const env = process.env.BETTER_AUTH_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export const inviteLink = (base: string, token: string) => `${base}/register/${token}`;

/**
 * The Dham and Sector an invite registers people under — always read from the server, never from the URL.
 * "Sector" = the Sector Sevak who looks after that Dham (the app has no separate sector table).
 */
export async function inviteContext(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { state: "invalid" as const };
  const [inv] = await db.select().from(schema.registrationInvite).where(eq(schema.registrationInvite.token, token));
  if (!inv) return { state: "invalid" as const };
  if (inv.revokedAt) return { state: "revoked" as const };
  if (inv.expiresAt < new Date()) return { state: "expired" as const };
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, inv.dhamId));
  if (!d || !d.isActive) return { state: "invalid" as const };
  const sevaks = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(and(eq(schema.user.dhamId, d.id), eq(schema.user.role, "manager"), eq(schema.user.isActive, true), eq(schema.user.isCoSevak, false)));
  return { state: "ok" as const, invite: inv, dham: d, sector: sectorLabel(d.name, sevaks.map((s) => s.name)) };
}

export const sectorLabel = (dham: string, sevaks: string[]) => (sevaks.length ? `Sector of ${sevaks.join(", ")}` : `${dham} Sector`);

/** Invites a Sevak may see/manage: own Dham (Sector Sevak) or any (Chakra Sevak). */
export async function invitesFor(u: AppUser) {
  const now = new Date();
  const conds = [isNull(schema.registrationInvite.revokedAt), gt(schema.registrationInvite.expiresAt, now)];
  if (u.role !== "admin") conds.push(eq(schema.registrationInvite.dhamId, u.dhamId ?? -1));
  return db
    .select({ inv: schema.registrationInvite, dham: schema.dham.name })
    .from(schema.registrationInvite)
    .innerJoin(schema.dham, eq(schema.dham.id, schema.registrationInvite.dhamId))
    .where(and(...conds))
    .orderBy(desc(schema.registrationInvite.createdAt));
}

export const qrDataUrl = (link: string) => QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#0f1d3a", light: "#ffffff" } });
export const qrPng = (link: string) => QRCode.toBuffer(link, { margin: 1, width: 900, errorCorrectionLevel: "M", color: { dark: "#0f1d3a", light: "#ffffff" } });

/** May this Sevak review / change access of this person? Sector Sevak: devotees of their own Dham. Chakra Sevak: any devotee. */
export function canManageAccess(u: AppUser, target: { role: string; dhamId: number | null }) {
  if (target.role !== "devotee") return false;
  if (u.role === "admin") return true;
  return u.role === "manager" && u.dhamId != null && target.dhamId === u.dhamId;
}
