import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { APP_NAME, APP_TAGLINE, MANIMA_LOGO, MANIMA_LOGO_LIGHT_SVG, MANIMA_NAME, MANIMA_URL } from "@/lib/brand";
import { BrandMark } from "@/components/brandmark";
import { LoginForm } from "./form";
import { ForgetSavedPages } from "@/components/pwa";

export const metadata = { title: `Log in · ${APP_NAME}` };

const POINTS = [
  { icon: "📚", title: "Know where every book is", body: "Central store, each Dham, and every devotee — always up to date." },
  { icon: "📝", title: "Daily sales in a minute", body: "Devotees tap how many they sold. The app does all the maths." },
  { icon: "💰", title: "Money you can trust", body: "Collected, submitted and pending — clearly shown, never forced to balance." },
];

export default async function LoginPage() {
  const u = await getUser();
  if (u) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <ForgetSavedPages />
      {/* Brand panel */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-6 pb-10 pt-8 text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <BrandMark size={60} />
          <div className="leading-tight">
            <p className="font-display text-xl font-extrabold">{APP_NAME}</p>
            <p className="text-sm text-brand-200/90">{APP_TAGLINE}</p>
          </div>
        </div>
        <div className="relative mt-8 hidden lg:block">
          <h1 className="max-w-md font-display text-4xl font-extrabold leading-[1.15] tracking-tight">
            Every book, every sale, every rupee — <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">in one simple place.</span>
          </h1>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl ring-1 ring-white/15">{p.icon}</span>
                <div>
                  <p className="font-semibold">{p.title}</p>
                  <p className="text-sm text-blue-100/70">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <a href={MANIMA_URL} target="_blank" rel="noopener noreferrer" className="relative mt-10 hidden items-center gap-3 lg:flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MANIMA_LOGO_LIGHT_SVG} alt="" className="h-12 w-16 object-contain drop-shadow-[0_0_10px_rgb(253_177_116/0.5)]" />
          <span className="leading-tight">
            <span className="block text-[10px] uppercase tracking-[0.2em] text-blue-200/60">Developed by</span>
            <span className="block font-semibold">{MANIMA_NAME}</span>
          </span>
        </a>
      </section>

      {/* Form panel */}
      <section className="flex items-start justify-center px-4 py-8 sm:items-center sm:px-6 lg:py-12">
        <div className="w-full max-w-md animate-fade-up">
          <div className="rounded-3xl border border-stone-200/70 bg-white p-6 shadow-lift sm:p-8">
            <h2 className="font-display text-2xl font-extrabold text-ink-900">Welcome back 🙏</h2>
            <p className="mb-6 mt-1.5 text-sm leading-relaxed text-ink-500">
              Log in with the mobile number or email your Admin or Dham Manager registered for you.
            </p>
            <LoginForm />
          </div>
          <p className="mt-5 text-center text-sm text-ink-500">
            New here? Your Dham Manager or Admin creates your account and gives you your password.
          </p>
          <a href={MANIMA_URL} target="_blank" rel="noopener noreferrer" className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-500 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MANIMA_LOGO} alt="" className="h-6 w-8 object-contain" />
            Developed by <span className="font-semibold text-ink-700">{MANIMA_NAME}</span>
          </a>
        </div>
      </section>
    </main>
  );
}
