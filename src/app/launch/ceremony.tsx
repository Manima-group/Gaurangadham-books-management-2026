"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, APP_TAGLINE, PRABHUPADA_IMG } from "@/lib/brand";

/**
 * Launch ceremony.
 * Tap "Launch" (browsers only allow sound after a tap) → 10 seconds of falling flowers and
 * devotional music (tanpura drone, temple bells, conch — all played live by the browser, no
 * recordings) → the last 5 seconds count down 5·4·3·2·1 with a tick → gong → the app opens.
 */
const LAUNCHER = "His Grace Vedavit Nimai Das Prabhuji";
const TOTAL = 10; // seconds of flowers and music
const COUNT_FROM = 5;
const GO_TO = "/dashboard"; // not signed in → the login page

type Phase = "ready" | "blessing" | "countdown" | "launched";

/* ---------------- Music (Web Audio) ---------------- */

type Audio = { ctx: AudioContext; master: GainNode };

function startAudio(): Audio | null {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return { ctx, master };
  } catch {
    return null;
  }
}

/** Tanpura-like drone on Sa and Pa (C and G), swelling in and fading at the end. */
function drone({ ctx, master }: Audio, seconds: number) {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.16, now + 2);
  out.gain.setValueAtTime(0.16, now + seconds - 1.5);
  out.gain.linearRampToValueAtTime(0, now + seconds + 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  lp.connect(out).connect(master);
  for (const [f, g] of [[130.81, 0.5], [196, 0.35], [261.63, 0.3], [65.41, 0.4]] as const) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.18 + Math.random() * 0.2;
    lfoGain.gain.value = f * 0.003; // gentle "jivari" shimmer
    lfo.connect(lfoGain).connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og).connect(lp);
    o.start(now);
    lfo.start(now);
    o.stop(now + seconds + 1);
    lfo.stop(now + seconds + 1);
  }
}

/** One temple-bell strike: inharmonic partials with a long ring. */
function bell({ ctx, master }: Audio, at: number, freq: number, vol = 0.12, ring = 3.2) {
  for (const [ratio, amp] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol * amp, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + ring / ratio ** 0.4);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + ring + 0.1);
  }
}

/** A conch (shankh) call: a breathy horn that swells and falls. */
function conch({ ctx, master }: Audio, at: number, dur = 2.4) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, at);
  o.frequency.linearRampToValueAtTime(233, at + dur * 0.5);
  o.frequency.linearRampToValueAtTime(218, at + dur);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 700;
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(0.22, at + 0.6);
  g.gain.setValueAtTime(0.22, at + dur - 0.7);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(bp).connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.1);
}

/** The countdown tick: a short wooden click. */
function tick({ ctx, master }: Audio, at: number, high = false) {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(high ? 1500 : 1100, at);
  o.frequency.exponentialRampToValueAtTime(400, at + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + 0.12);
}

function playCeremony(a: Audio) {
  const t = a.ctx.currentTime + 0.05;
  drone(a, TOTAL);
  conch(a, t, 2.4);
  // Bells on a pentatonic (Bhupali-like) phrase: Sa Re Ga Pa Dha
  const notes = [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33, 523.25, 659.25, 783.99];
  notes.forEach((f, i) => bell(a, t + 0.9 + i * 0.78, f, 0.09));
  for (let i = 0; i < COUNT_FROM; i++) tick(a, t + (TOTAL - COUNT_FROM) + i, i === COUNT_FROM - 1);
  bell(a, t + TOTAL, 261.63, 0.3, 5); // gong-like final strike
  bell(a, t + TOTAL, 392, 0.18, 4.5);
}

/* ---------------- Flowers ---------------- */

const FLOWERS = ["marigold", "rose", "jasmine", "lotus", "petal"] as const;
type Flower = { id: number; kind: (typeof FLOWERS)[number]; left: number; size: number; delay: number; dur: number; spin: number; sway: number };

function Bloom({ kind, size }: { kind: Flower["kind"]; size: number }) {
  if (kind === "marigold")
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <ellipse key={i} cx="20" cy="9" rx="5" ry="9" fill={i % 2 ? "#f59e0b" : "#ea7a12"} transform={`rotate(${i * (360 / 14)} 20 20)`} />
        ))}
        <circle cx="20" cy="20" r="7" fill="#f7b733" />
        <circle cx="20" cy="20" r="3.5" fill="#d9611a" />
      </svg>
    );
  if (kind === "rose")
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        <path d="M20 4 C30 8 34 18 28 28 C24 34 16 34 12 28 C6 18 10 8 20 4Z" fill="#e11d48" />
        <path d="M20 10 C26 13 27 20 23 25 C20 28 16 26 15 22 C14 17 16 12 20 10Z" fill="#fb7185" />
      </svg>
    );
  if (kind === "jasmine")
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <ellipse key={i} cx="20" cy="10" rx="5.5" ry="9" fill="#fffdf5" stroke="#f2e8c9" strokeWidth="0.8" transform={`rotate(${i * 72} 20 20)`} />
        ))}
        <circle cx="20" cy="20" r="3" fill="#facc15" />
      </svg>
    );
  if (kind === "lotus")
    return (
      <svg width={size} height={size} viewBox="0 0 48 40" aria-hidden>
        <path d="M24 6 C30 14 30 24 24 32 C18 24 18 14 24 6Z" fill="#f9a8d4" />
        <path d="M24 32 C16 30 10 22 10 14 C17 16 22 22 24 32Z" fill="#f472b6" />
        <path d="M24 32 C32 30 38 22 38 14 C31 16 26 22 24 32Z" fill="#f472b6" />
        <path d="M24 33 C14 34 6 30 3 24 C11 23 19 27 24 33Z" fill="#ec4899" />
        <path d="M24 33 C34 34 42 30 45 24 C37 23 29 27 24 33Z" fill="#ec4899" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 1 C16 5 17 12 10 19 C3 12 4 5 10 1Z" fill="#f97316" opacity="0.9" />
    </svg>
  );
}

function makeFlowers(n: number): Flower[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    kind: FLOWERS[i % FLOWERS.length],
    left: Math.random() * 100,
    size: 16 + Math.random() * 26,
    delay: Math.random() * (TOTAL - 3),
    dur: 4.5 + Math.random() * 3.5,
    spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
    sway: 20 + Math.random() * 60,
  }));
}

/* ---------------- Page ---------------- */

export function Ceremony() {
  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(COUNT_FROM);
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const audio = useRef<Audio | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); audio.current?.ctx.close().catch(() => {}); }, []);

  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  function launch() {
    if (phase !== "ready") return;
    audio.current = startAudio();
    if (audio.current) playCeremony(audio.current);
    setFlowers(makeFlowers(reduce ? 24 : 90));
    setPhase("blessing");
    const at = (s: number, f: () => void) => timers.current.push(window.setTimeout(f, s * 1000));
    for (let i = 0; i < COUNT_FROM; i++) at(TOTAL - COUNT_FROM + i, () => { setPhase("countdown"); setCount(COUNT_FROM - i); });
    at(TOTAL, () => setPhase("launched"));
    at(TOTAL + 2, () => window.location.assign(GO_TO));
  }

  return (
    <main className="launch-bg relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10 text-white">
      {/* soft temple glow + rays */}
      <div aria-hidden className="launch-rays pointer-events-none absolute left-1/2 top-[38%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2" />

      {/* falling flowers */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        {flowers.map((f) => (
          <span
            key={f.id}
            className="launch-flower absolute top-0"
            style={{ left: `${f.left}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s`, ["--spin" as string]: `${f.spin}deg`, ["--sway" as string]: `${f.sway}px` }}
          >
            <Bloom kind={f.kind} size={f.size} />
          </span>
        ))}
      </div>

      <section className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative mb-5">
          <span aria-hidden className="launch-halo absolute inset-[-22px] rounded-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PRABHUPADA_IMG} alt="Srila Prabhupada" className="relative h-28 w-28 rounded-full object-cover ring-4 ring-brand-300/80 sm:h-32 sm:w-32" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-200/90">ISKCON · Gaurangadham</p>
        <h1 className="mt-2 font-display text-[34px] font-extrabold leading-tight sm:text-5xl">
          <span className="launch-gold">{APP_NAME}</span>
        </h1>
        <p className="mt-1 text-base text-blue-100/80">{APP_TAGLINE}</p>

        <div className="mt-6 rounded-2xl bg-white/[0.06] px-5 py-3 ring-1 ring-white/10">
          <p className="text-sm text-blue-100/75">{phase === "launched" ? "Launched by" : "To be launched by"}</p>
          <p className="font-display text-xl font-bold text-brand-100 sm:text-2xl">{LAUNCHER}</p>
        </div>

        <div className="mt-8 flex min-h-[11rem] w-full flex-col items-center justify-center" aria-live="polite">
          {phase === "ready" && (
            <>
              <button
                type="button"
                onClick={launch}
                className="launch-button group relative inline-flex min-h-16 items-center gap-3 rounded-full bg-gradient-to-b from-brand-400 to-brand-600 px-10 text-xl font-bold text-white shadow-[0_14px_40px_-10px_rgb(242_107_29/0.9)] transition hover:from-brand-500 hover:to-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
                data-testid="launch"
              >
                <span aria-hidden className="text-2xl">🪔</span> Launch the Application
              </button>
              <p className="mt-3 text-sm text-blue-100/70">Turn your sound on 🔔</p>
            </>
          )}
          {phase === "blessing" && (
            <div className="launch-in">
              <p className="font-display text-2xl font-bold text-brand-100">🙏 Hare Krishna 🙏</p>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-blue-50/90">
                Hare Krishna Hare Krishna Krishna Krishna Hare Hare<br />Hare Rama Hare Rama Rama Rama Hare Hare
              </p>
            </div>
          )}
          {phase === "countdown" && (
            <div key={count} className="launch-count font-display text-[110px] font-extrabold leading-none text-white sm:text-[140px]" data-testid="count">
              {count}
            </div>
          )}
          {phase === "launched" && (
            <div className="launch-in">
              <p className="font-display text-3xl font-extrabold text-brand-100">✨ Jaya! Grantha Seva is live ✨</p>
              <p className="mt-2 text-blue-100/80">Opening the application…</p>
            </div>
          )}
        </div>

        <p className="mt-6 max-w-md text-xs leading-relaxed text-blue-100/60">
          Dedicated to His Divine Grace A.C. Bhaktivedanta Swami Prabhupāda, Founder-Ācārya of ISKCON.
        </p>
      </section>
    </main>
  );
}
