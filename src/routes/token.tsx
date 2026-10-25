import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bell, CheckCircle2, Gift, Handshake, Loader2,
  Lock, MessageCircle, Rocket, ShieldCheck, Sparkles, Star, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { BrandMark } from "@/components/brand-mark";
import { apiUrl } from "@/lib/api-base";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/token")({
  head: () => ({
    meta: [
      { title: "Krypto Token — Launching soon | KryptoBazar" },
      {
        name: "description",
        content:
          "The Krypto Token is coming. Join the waitlist, earn airdrop points from verified escrow trades, and claim at launch.",
      },
      { property: "og:title", content: "Krypto Token — Launching soon | KryptoBazar" },
      {
        property: "og:description",
        content:
          "Join the Krypto Token waitlist. Earn airdrop points from verified escrow trades on KryptoBazar and claim at launch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Krypto Token — Launching soon | KryptoBazar" },
      {
        name: "twitter:description",
        content:
          "Join the Krypto Token waitlist. Earn airdrop points from verified escrow trades and claim at launch.",
      },
    ],
  }),
  component: TokenPage,
});

// Launch countdown target (UTC). Update this when the launch date is fixed.
const TOKEN_LAUNCH_ISO = "2026-12-01T12:00:00Z";

// Airdrop reward model (preliminary, shown transparently on the page).
const BASE_POINTS_PER_1000_USDT = 100; // 100 KRYPTO points per 1,000 USDT verified volume
const TIERS = [
  { min: 0, label: "Starter", mult: 1 },
  { min: 10_000, label: "Bronze", mult: 1.25 },
  { min: 50_000, label: "Silver", mult: 1.5 },
  { min: 250_000, label: "Gold", mult: 2 },
] as const;

const SOCIALS = {
  telegram: "https://t.me/kryptobazar",
  x: "https://x.com/kryptobazar",
  discord: "https://discord.gg/kryptobazar",
};

function useCountdown(targetIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => {
    const diff = new Date(targetIso).getTime() - now;
    if (diff <= 0) return null;
    const s = Math.floor(diff / 1000);
    return {
      days: Math.floor(s / 86400),
      hours: Math.floor((s % 86400) / 3600),
      mins: Math.floor((s % 3600) / 60),
      secs: s % 60,
    };
  }, [now, targetIso]);
}

function Countdown() {
  const t = useCountdown(TOKEN_LAUNCH_ISO);
  if (!t) {
    return (
      <div className="font-display text-2xl font-bold text-gradient-primary">Launching soon</div>
    );
  }
  const cells = [
    { v: t.days, l: "Days" },
    { v: t.hours, l: "Hours" },
    { v: t.mins, l: "Min" },
    { v: t.secs, l: "Sec" },
  ];
  return (
    <div className="flex justify-center gap-2.5 sm:gap-3">
      {cells.map((c) => (
        <div key={c.l} className="glass-panel w-[68px] rounded-xl px-2 py-3 sm:w-20">
          <div className="font-display text-2xl font-bold tabular-nums text-gradient-primary">
            {String(c.v).padStart(2, "0")}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{c.l}</div>
        </div>
      ))}
    </div>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setMessage("");
    try {
      const res = await fetch(apiUrl("/api/token/waitlist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(data?.error ?? "Couldn't join right now. Please try again.");
        return;
      }
      setState("ok");
      setMessage(data?.message ?? "You're on the list!");
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (state === "ok") {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="h-11 flex-1 rounded-xl"
        aria-label="Email address"
      />
      <Button type="submit" variant="hero" size="lg" className="rounded-xl" disabled={state === "loading"}>
        {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Join waitlist
      </Button>
      {state === "error" && (
        <p className="text-xs text-destructive sm:hidden" role="alert">{message}</p>
      )}
    </form>
  );
}

function RewardCalculator() {
  const [volume, setVolume] = useState(25_000);
  const tier = useMemo(() => [...TIERS].reverse().find((t) => volume >= t.min) ?? TIERS[0], [volume]);
  const estimate = Math.round((volume / 1000) * BASE_POINTS_PER_1000_USDT * tier.mult);

  return (
    <div className="glass-panel mx-auto max-w-xl rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Gift className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-semibold">Airdrop reward calculator</h3>
      </div>

      <label className="text-xs font-medium text-muted-foreground" htmlFor="calc-volume">
        Your monthly verified trade volume (USDT)
      </label>
      <Input
        id="calc-volume"
        type="number"
        min={0}
        step={500}
        value={volume}
        onChange={(e) => setVolume(Math.max(0, Number(e.target.value) || 0))}
        className="mt-1.5 h-11 rounded-xl"
      />

      <input
        type="range"
        min={0}
        max={500_000}
        step={1000}
        value={Math.min(volume, 500_000)}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="mt-4 w-full accent-[var(--primary)]"
        aria-label="Volume slider"
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border bg-background/60 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tier</div>
          <div className="mt-0.5 font-display text-sm font-bold text-primary">{tier.label}</div>
          <div className="text-[10px] text-muted-foreground">×{tier.mult} multiplier</div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
          <div className="text-[10px] uppercase tracking-wider text-primary/70">Estimated reward</div>
          <div className="mt-0.5 font-display text-sm font-bold tabular-nums text-primary">
            {estimate.toLocaleString("en-US")} KRYPTO
          </div>
          <div className="text-[10px] text-primary/60">at token launch</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {TIERS.map((t) => (
          <div
            key={t.label}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-center text-[10px]",
              t.label === tier.label ? "border-primary/40 bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground",
            )}
          >
            <div className="font-semibold">{t.label}</div>
            <div>{t.min === 0 ? "any volume" : `${(t.min / 1000).toLocaleString("en-US")}k+`} · ×{t.mult}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        Formula: {BASE_POINTS_PER_1000_USDT} KRYPTO points per 1,000 USDT of completed, escrow-verified
        trade volume × tier multiplier. Preliminary and may change before launch.
      </p>
    </div>
  );
}

function TrustCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <Icon className="h-5 w-5 text-primary" />
      <h4 className="mt-3 font-display text-sm font-semibold">{title}</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function TokenPage() {
  const steps = [
    { icon: Bell, title: "Join the waitlist", desc: "Drop your email below. You'll get launch updates, the snapshot date, and your claim window — nothing else." },
    { icon: Handshake, title: "Trade & earn points", desc: "Every completed, escrow-verified trade on KryptoBazar earns KRYPTO points. The 0% trade-fee era makes every deal count." },
    { icon: Rocket, title: "Claim at launch", desc: "At token generation we snapshot eligible wallets. Claim your KRYPTO straight from your KryptoBazar wallet — no gas gymnastics." },
  ];

  const roadmap = [
    { phase: "Now", title: "Waitlist open", desc: "Points accrue from verified trades. Community channels go live.", done: true },
    { phase: "Q4 2026", title: "Snapshot", desc: "Eligibility check and final snapshot of points and wallets.", done: false },
    { phase: "Launch", title: "Token generation", desc: "KRYPTO goes live; eligible members claim their allocation.", done: false },
    { phase: "Post-launch", title: "Utility expands", desc: "Merchant boosts, fee-tier staking, and community governance.", done: false },
  ];

  return (
    <div className="min-h-screen px-4">
      <SiteHeader />

      {/* Hero */}
      <section className="relative mx-auto mt-14 max-w-3xl pb-16 text-center md:mt-20">
        <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

        <div className="mx-auto mb-5 w-fit">
          <div className="inline-block rounded-[28%] p-1 shadow-[var(--shadow-glow)] ring-1 ring-primary/20">
            <BrandMark className="[&_img]:h-20 [&_img]:w-20 sm:[&_img]:h-24 sm:[&_img]:w-24" />
          </div>
        </div>

        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full glass-strong px-4 py-1.5 text-xs font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Krypto Token · Launching soon
        </div>

        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
          The token behind the <span className="text-gradient-primary">bazaar.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
          KRYPTO rewards the people who actually trade — verified, escrow-protected
          volume, not speculation. Join the waitlist and earn from day one.
        </p>

        <div className="mt-8">
          <Countdown />
        </div>

        <div className="mt-9">
          <WaitlistForm />
          <p className="mt-3 text-[11px] text-muted-foreground">
            No spam, ever. One email at snapshot, one at launch.
          </p>
        </div>
      </section>

      {/* Reward calculator */}
      <section className="mx-auto max-w-7xl py-12">
        <div className="mb-8 text-center">
          <h2 className="font-display text-2xl font-bold md:text-4xl">See what you'd earn</h2>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Points come from real, completed trades — not from buying your way in.
          </p>
        </div>
        <RewardCalculator />
      </section>

      {/* How the airdrop works */}
      <section className="mx-auto max-w-7xl py-12">
        <div className="mb-8 text-center">
          <h2 className="font-display text-2xl font-bold md:text-4xl">The airdrop, in three steps.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="glass-panel relative rounded-2xl p-6">
              <div className="absolute -top-3 left-6 rounded-full bg-[image:var(--gradient-primary)] px-3 py-1 text-xs font-bold text-primary-foreground">
                STEP {i + 1}
              </div>
              <s.icon className="mb-3 mt-2 h-6 w-6 text-primary" />
              <h4 className="font-display font-semibold">{s.title}</h4>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust cards */}
      <section className="mx-auto max-w-7xl py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrustCard icon={ShieldCheck} title="Escrow-verified only" desc="Only completed, escrow-protected deals earn points. No fake volume, no wash trading." />
          <TrustCard icon={Users} title="Community first" desc="No insider presale allocations. The airdrop rewards active traders and early supporters." />
          <TrustCard icon={Lock} title="Your keys, your claim" desc="Claim straight from your KryptoBazar wallet at launch. We never hold your tokens." />
          <TrustCard icon={Star} title="Transparent rules" desc="The full point formula and tiers are published on this page before the snapshot." />
        </div>
      </section>

      {/* Roadmap */}
      <section className="mx-auto max-w-2xl py-12">
        <div className="mb-8 text-center">
          <h2 className="font-display text-2xl font-bold md:text-4xl">Roadmap</h2>
          <p className="mt-2 text-sm text-muted-foreground">Preliminary — dates may shift as the network grows.</p>
        </div>
        <div className="space-y-3">
          {roadmap.map((r) => (
            <div key={r.title} className="glass-panel flex items-start gap-3 rounded-2xl p-4 sm:p-5">
              <div
                className={cn(
                  "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  r.done ? "bg-[image:var(--gradient-primary)] text-primary-foreground" : "border border-border bg-secondary text-muted-foreground",
                )}
              >
                {r.done ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Rocket className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-display text-sm font-semibold">{r.title}</h4>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{r.phase}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Community */}
      <section className="mx-auto max-w-3xl py-12">
        <div className="glass-strong relative overflow-hidden rounded-3xl px-6 py-10 text-center">
          <div className="grid-bg absolute inset-0 -z-10 opacity-30" />
          <h2 className="font-display text-2xl font-bold md:text-3xl">Join the community</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Announcements, airdrop updates, and early access happen in our channels first.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href={SOCIALS.telegram} target="_blank" rel="noreferrer">
              <Button variant="hero" size="lg" className="rounded-xl"><MessageCircle className="h-4 w-4" /> Telegram</Button>
            </a>
            <a href={SOCIALS.x} target="_blank" rel="noreferrer">
              <Button variant="glass" size="lg" className="rounded-xl">X (Twitter)</Button>
            </a>
            <a href={SOCIALS.discord} target="_blank" rel="noreferrer">
              <Button variant="glass" size="lg" className="rounded-xl">Discord</Button>
            </a>
          </div>
          <div className="mt-8">
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              Back to KryptoBazar <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mx-auto max-w-3xl pb-10">
        <p className="text-center text-[10px] leading-relaxed text-muted-foreground/80">
          Airdrop amounts, tiers, and dates shown here are preliminary and may change before the token
          launch. Points are promotional rewards, not a purchase, investment, or promise of value.
          Nothing on this page is financial advice.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
}
