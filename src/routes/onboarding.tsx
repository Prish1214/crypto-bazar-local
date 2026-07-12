import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import {
  Shield, Lock, QrCode, Wallet, Rocket,
  ArrowRight, ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Welcome to CryptoBazar" },
      { name: "description", content: "Get started with CryptoBazar — the safest way to trade USDT locally." },
    ],
  }),
  component: OnboardingRoute,
});

const ONBOARDING_KEY = "cb.onboarded.v1";

type Slide = {
  icon: any;
  eyebrow: string;
  title: string;
  desc: string;
  accent: string;
};

const SLIDES: Slide[] = [
  {
    icon: Shield,
    eyebrow: "Local marketplace",
    title: "Trade USDT in your city, safely.",
    desc: "Discover verified local merchants. Every trade is protected by on-chain escrow — no chargebacks, no surprises.",
    accent: "from-blue-500 to-indigo-600",
  },
  {
    icon: Lock,
    eyebrow: "Private chat",
    title: "End-to-end encrypted messaging.",
    desc: "Talk to any user by username. No phone numbers, no leaks — coordinate rates and meet-ups on your terms.",
    accent: "from-cyan-500 to-blue-600",
  },
  {
    icon: QrCode,
    eyebrow: "Smart escrow",
    title: "QR verification & live cash proof.",
    desc: "Meet in person, scan to verify, capture live proof, and release funds only with your private 6-digit Deal Code.",
    accent: "from-violet-500 to-blue-600",
  },
  {
    icon: Wallet,
    eyebrow: "Fast wallet",
    title: "Instant deposits & withdrawals.",
    desc: "Top up USDT on BEP20, send between users, or cash out to any wallet — with live network fee estimates.",
    accent: "from-blue-500 to-sky-500",
  },
  {
    icon: Rocket,
    eyebrow: "You're ready",
    title: "Let's start trading.",
    desc: "Create your account in seconds. It only takes an email — no cards, no minimums.",
    accent: "from-indigo-500 to-blue-600",
  },
];

function OnboardingRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/onboarding") return <Outlet />;
  return <OnboardingScreen />;
}

function OnboardingScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const total = SLIDES.length;

  // If already signed in, never show slides — jump straight to wallet.
  useEffect(() => {
    if (loading) return;
    if (user) {
      try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
      navigate({ to: "/wallet", replace: true });
    }
  }, [user, loading, navigate]);

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    navigate({ to: "/auth" });
  };

  const next = () => (index < total - 1 ? setIndex(index + 1) : finish());
  const prev = () => index > 0 && setIndex(index - 1);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (dx < -40) next();
    else if (dx > 40) prev();
    startX.current = null;
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <button
          onClick={prev}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition ${index === 0 ? "invisible" : "hover:bg-muted"}`}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={finish}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Skip
        </button>
      </div>

      {/* Slides viewport */}
      <div
        className="relative flex-1 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s, i) => (
            <SlideView key={i} slide={s} active={i === index} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <div className="mx-auto mb-5 flex max-w-md items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-8 bg-primary" : "w-1.5 bg-muted-foreground/25"
              }`}
            />
          ))}
        </div>

        <div className="mx-auto max-w-md">
          <Button
            size="lg"
            onClick={next}
            className="h-14 w-full rounded-2xl bg-[image:var(--gradient-primary,linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary))))] text-base font-semibold shadow-lg shadow-primary/20"
          >
            {index === total - 1 ? "Get started" : "Continue"}
            <ArrowRight className="ml-1 h-5 w-5" />
          </Button>
          {index === total - 1 && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <button onClick={finish} className="font-medium text-primary hover:underline">
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SlideView({ slide, active }: { slide: Slide; active: boolean }) {
  const Icon = slide.icon;
  return (
    <div className="flex h-full w-full flex-shrink-0 flex-col items-center justify-center px-6">
      <div className="mx-auto w-full max-w-md">
        {/* Illustration card */}
        <div
          className={`relative mx-auto mb-10 aspect-square w-full max-w-[280px] overflow-hidden rounded-[36px] bg-gradient-to-br ${slide.accent} shadow-2xl shadow-primary/20 transition-all duration-700 ${
            active ? "scale-100 opacity-100" : "scale-95 opacity-70"
          }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="rounded-3xl bg-white/15 p-8 backdrop-blur-sm ring-1 ring-white/25">
              <Icon className="h-20 w-20 text-white" strokeWidth={1.5} />
            </div>
          </div>
        </div>

        <div
          className={`text-center transition-all duration-500 ${
            active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <div className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            {slide.eyebrow}
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
            {slide.title}
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            {slide.desc}
          </p>
        </div>
      </div>
    </div>
  );
}
