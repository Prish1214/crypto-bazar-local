import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  Shield, MapPin, Lock, Zap, Star, ArrowRight, CheckCircle2,
  Coins, MessageSquare, Camera, Users, TrendingUp, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CryptoBazar — Local USDT marketplace with cash escrow" },
      {
        name: "description",
        content:
          "Buy and sell USDT face-to-face in your city. Escrow-protected, reputation-backed, instant settlement after meet-up.",
      },
      { property: "og:title", content: "CryptoBazar — Local USDT marketplace" },
      {
        property: "og:description",
        content:
          "The safest way to trade USDT for cash locally. Escrow protection, verified merchants, in-app chat.",
      },
    ],
  }),
  component: Landing,
});

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-panel rounded-xl px-5 py-4">
      <div className="font-display text-2xl font-bold text-gradient-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="glass-panel group rounded-2xl p-6 transition-all hover:border-primary/30 hover:shadow-[var(--shadow-glow)]">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function Step({ n, title, desc, icon: Icon }: { n: string; title: string; desc: string; icon: any }) {
  return (
    <div className="glass-panel relative rounded-2xl p-6">
      <div className="absolute -top-3 left-6 rounded-full bg-[image:var(--gradient-primary)] px-3 py-1 text-xs font-bold text-primary-foreground">
        STEP {n}
      </div>
      <Icon className="mb-3 mt-2 h-6 w-6 text-primary" />
      <h4 className="font-display font-semibold">{title}</h4>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate({ to: "/wallet", replace: true });
      return;
    }
    let onboarded = false;
    try { onboarded = localStorage.getItem("cb.onboarded.v1") === "1"; } catch {}
    if (!onboarded) navigate({ to: "/onboarding", replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen px-4">
      <SiteHeader />

      {/* Hero */}
      <section className="relative mx-auto mt-16 max-w-7xl pb-20 text-center md:mt-24">
        <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass-strong px-4 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Now live in select cities — onboarding merchants weekly
        </div>

        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
          Buy & sell USDT
          <br />
          <span className="text-gradient-primary">in your city, for cash.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
          CryptoBazar is the local P2P marketplace for crypto. Escrow-protected
          meet-ups, verified merchants, instant settlement — no banks, no
          chargebacks, no surprises.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth">
            <Button variant="hero" size="xl">
              Start trading
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#how">
            <Button variant="glass" size="xl">How it works</Button>
          </a>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
          <Stat value="0.1%" label="Trade fee" />
          <Stat value="< 2 sec." label="Avg. settlement" />
          <Stat value="100%" label="Escrow protected" />
          <Stat value="24/7" label="In-app chat" />
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-7xl py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            A trade, in four steps.
          </h2>
          <p className="mt-3 text-muted-foreground">
            From listing to cash-in-hand, every step is protected.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          <Step n="01" icon={MapPin} title="Find a local listing" desc="Browse buy & sell offers in your city, filter by amount, price, and merchant rating." />
          <Step n="02" icon={Lock} title="USDT locked in escrow" desc="The seller's USDT is locked the moment a deal is accepted. The listing is paused for others." />
          <Step n="03" icon={MessageSquare} title="Meet & exchange cash" desc="Chat in-app, schedule the meeting, hand over cash at your agreed location." />
          <Step n="04" icon={Zap} title="Instant USDT release" desc="Buyer uploads proof, seller confirms — USDT releases in seconds. 0.1% fee." />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl py-16">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Built for serious traders.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every feature designed to make local crypto trading safer.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Feature icon={Shield} title="Escrow protection" desc="USDT is locked the moment a deal starts. No release until both parties confirm." />
          <Feature icon={Star} title="Reputation system" desc="Every successful trade builds your score. Verified badges for top merchants." />
          <Feature icon={MapPin} title="Local-first discovery" desc="See listings from your city by default. Filter by amount, price, and rating." />
          <Feature icon={Camera} title="Trade proof" desc="Upload image and video proof of cash handover with timestamped logs." />
          <Feature icon={MessageSquare} title="Private deal rooms" desc="Encrypted in-app chat keeps your trade conversations off other platforms." />
          <Feature icon={TrendingUp} title="Premium listings" desc="Featured slots and priority ranking for verified merchants who go pro." />
        </div>
      </section>

      {/* Trust CTA */}
      <section className="mx-auto max-w-7xl py-16">
        <div className="glass-strong relative overflow-hidden rounded-3xl px-6 py-14 text-center md:px-12">
          <div className="grid-bg absolute inset-0 -z-10 opacity-30" />
          <div className="absolute inset-x-0 -top-20 -z-10 mx-auto h-60 w-[60%] rounded-full bg-primary/20 blur-3xl" />

          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>

          <h2 className="font-display text-3xl font-bold md:text-5xl">
            Your crypto. Your city. <br className="hidden md:inline" />
            <span className="text-gradient-primary">Protected end-to-end.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Join the marketplace built for traders who want speed, privacy, and
            real-world settlement — without giving up control.
          </p>

          <ul className="mx-auto mt-7 grid max-w-2xl gap-2 text-left text-sm sm:grid-cols-2">
            {[
              "No bank intermediaries",
              "No chargebacks, ever",
              "Instant USDT settlement",
              "Verified merchant badges",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button variant="hero" size="xl">
                Create your account <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
