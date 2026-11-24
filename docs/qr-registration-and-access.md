# QR Self-Registration & Access

## Flow
1. **Sector Sevak → People → Registration QR** (`/people/registration`): create a link valid 30/90/180 days. The Dham is fixed on the server (a Sector Sevak can only create for their own Dham; a Chakra Sevak picks one). Token: 192-bit random, URL-safe.
2. **Download QR as PDF** (`/api/register/qr/<id>`): Dham name, Sector, QR, and "Scan this QR to register as a devotee under <Dham>, <Sector>". Only the Sevak of that Dham or a Chakra Sevak can download.
3. **Landing page** `/register/<token>` shows "You are registering under: <Dham> — <Sector>". Expired, revoked or unknown tokens show a clear message.
4. **Sign-up** with name, mobile, password, consent. No SMS/OTP (no paid provider). `email_verified` stays false — an unverified phone is never treated as verified.
5. The person is **logged in at once** to a limited "Awaiting Sector Sevak Approval" screen. Every other page/action/API redirects or returns 401/403 while pending.
6. **Review queue** `/people/requests`: search, select one or many, approve (bulk) or do-not-approve (reason required). Possible duplicates (same name in same Dham) are flagged; accounts are never merged. One account per mobile number — a second sign-up with the same number is refused ("log in").
7. **Approval grants nothing.** Two independent permissions, both OFF by default:
   - **Book Distribution** — books, sales, money, transfers, stalls.
   - **Dham Sales View** — read-only totals of own Dham (`/dham-sales`), no devotee names, no sources.
   They can be ticked at approval or toggled later on the devotee list (with an optional reason).
8. **Audit:** `access_audit` stores actor, target, permission, old, new, timestamp, reason for approval decisions and every toggle. Shown on the requests page.
9. Profile/account shows "Book Distribution: Enabled/Disabled" and "Dham Sales View: Enabled/Disabled".

## Rate limiting
`registration_attempt` (hashed IP, invite, time). Max 30 sign-up attempts per network address per hour and 120 per invite per hour (a temple Wi-Fi shares one address). Raise/lower in `src/lib/registration.ts` (`RATE`).

## Who can manage
Sector Sevak: devotees of own Dham. Chakra Sevak: any devotee. Enforced in `canManageAccess()` on the server. Updates are conditional (no lost update if two Sevaks act at once).

## Revoking
"Turn off this QR" sets `revoked_at`; the link stops working immediately. Existing registrations are not affected.
