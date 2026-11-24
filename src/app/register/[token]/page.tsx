import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { inviteContext } from "@/lib/registration";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { BrandMark } from "@/components/brandmark";
import { RegisterForm } from "./form";

export const metadata = { title: `Register · ${APP_NAME}` };

export default async function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await getUser();
  if (u) redirect("/dashboard"); // already logged in: never re-register or change Dham
  const ctx = await inviteContext(token);
  return (
    <main className="flex min-h-dvh items-start justify-center bg-paper px-4 py-8 sm:items-center">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark size={48} />
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold text-ink-900">{APP_NAME}</p>
            <p className="text-sm text-ink-500">{APP_TAGLINE}</p>
          </div>
        </div>
        <div className="rounded-3xl border border-stone-200/70 bg-white p-6 shadow-lift sm:p-8">
          {ctx.state === "ok" ? (
            <>
              <h1 className="font-display text-2xl font-extrabold text-ink-900">Register as a devotee 🙏</h1>
              <div className="mb-5 mt-3 rounded-2xl border border-brand-200 bg-brand-50/70 p-3.5" data-testid="register-context">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-800">You are registering under</p>
                <p className="mt-1 font-display text-lg font-bold text-ink-900">
                  {ctx.dham.name} — {ctx.sector}
                </p>
              </div>
              <RegisterForm token={token} />
            </>
          ) : (
            <div data-testid="register-invalid">
              <h1 className="font-display text-2xl font-extrabold text-ink-900">
                {ctx.state === "expired" ? "This QR code has expired" : ctx.state === "revoked" ? "This QR code was turned off" : "This link is not valid"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">Please ask your Sector Sevak for a new registration QR code or link.</p>
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-sm text-ink-500">
          Already registered? <Link href="/login" className="font-semibold text-brand-700 underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}
