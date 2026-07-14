import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Shield, Coins, Users, Store, Wallet, ListOrdered, Handshake,
  ReceiptText, Settings as SettingsIcon, LayoutDashboard, MessageSquare, User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DealNotifier } from "@/components/deal-notifier";
import { db, type DealStatus } from "@/lib/db";

const navItems = [
  { to: "/marketplace", label: "Market", icon: Store },
  { to: "/deals", label: "Deals", icon: Handshake },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/wallet", label: "Wallet", icon: Wallet },
] as const;

const secondaryItems = [
  { to: "/listings", label: "Listings", icon: ListOrdered },
  { to: "/transactions", label: "History", icon: ReceiptText },
] as const;

const ACTIVE_DEAL_STATUSES: DealStatus[] = [
  "pending", "accepted", "escrow_funded", "meeting_proposed",
  "meeting_scheduled", "locked", "arrived", "verified", "cash_sent",
  "confirmed", "proof_uploaded", "disputed",
];

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeDealsCount, setActiveDealsCount] = useState(0);

  useEffect(() => {
    if (!user) { setActiveDealsCount(0); return; }
    let mounted = true;
    const loadActiveDeals = async () => {
      const { data } = await db
        .from("deals")
        .select("id,status")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .in("status", ACTIVE_DEAL_STATUSES as any);
      if (mounted) setActiveDealsCount(data?.length ?? 0);
    };
    loadActiveDeals();
    const channel = db
      .channel(`nav-deals-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `buyer_id=eq.${user.id}` }, loadActiveDeals)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `seller_id=eq.${user.id}` }, loadActiveDeals)
      .subscribe();
    const interval = window.setInterval(loadActiveDeals, 15000);
    return () => { mounted = false; window.clearInterval(interval); db.removeChannel(channel); };
  }, [user?.id]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 md:h-16 md:px-5">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
            <Coins className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-base font-bold tracking-tight md:text-lg">
            Crypto<span className="text-gradient-primary">Bazar</span>
          </span>
        </Link>

        {user && (
          <nav className="hidden items-center gap-0.5 md:flex">
            {[...navItems, ...secondaryItems].map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                  {n.to === "/deals" && activeDealsCount > 0 && (
                    <span className="ml-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                      {activeDealsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-1">
          {user ? (
            <>
              <Link to="/settings" className="hidden md:inline-flex">
                <Button size="icon" variant="ghost" title="Settings"><SettingsIcon className="h-4 w-4" /></Button>
              </Link>
              <Link to="/admin" className="hidden md:inline-flex">
                <Button size="icon" variant="ghost" title="Admin"><LayoutDashboard className="h-4 w-4" /></Button>
              </Link>
              <Link to="/settings" className="md:hidden">
                <Button size="icon" variant="ghost" title="Settings"><SettingsIcon className="h-4 w-4" /></Button>
              </Link>
              <Button size="sm" variant="ghost" className="hidden md:inline-flex" onClick={signOut}>Sign out</Button>
            </>
          ) : (
            <>
              <Link to="/auth"><Button size="sm" variant="ghost">Sign in</Button></Link>
              <Link to="/auth"><Button size="sm" variant="hero">Get started</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;

  const items = [
    { to: "/marketplace", label: "Market", icon: Store },
    { to: "/deals", label: "Deals", icon: Handshake },
    { to: "/wallet", label: "Wallet", icon: Wallet, primary: true },
    { to: "/chat", label: "Chat", icon: MessageSquare },
    { to: "/me", label: "Me", icon: UserIcon },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5 pb-1">
        {items.map((n) => {
          const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
          if (n.primary) {
            return (
              <Link
                key={n.to}
                to={n.to}
                className="flex flex-col items-center justify-center gap-1 -mt-6"
                aria-label={n.label}
              >
                <div className={cn(
                  "grid h-14 w-14 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[0_10px_30px_-8px_oklch(0.52_0.17_255_/_0.55)] ring-4 ring-background transition-transform active:scale-95",
                  active && "scale-105",
                )}>
                  <n.icon className="h-6 w-6" />
                </div>
                <span className={cn("text-[10px] font-semibold", active ? "text-primary" : "text-muted-foreground")}>{n.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <n.icon className={cn("h-[22px] w-[22px] transition-transform", active && "stroke-[2.4] scale-110")} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-16 hidden max-w-7xl px-4 pb-8 pt-10 md:block">
      <div className="rounded-2xl border border-border bg-card px-5 py-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[image:var(--gradient-primary)]">
              <Coins className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-bold">CryptoBazar</span>
            <span className="text-xs text-muted-foreground">· Local USDT marketplace</span>
          </div>
          <div className="flex items-center gap-5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Shield className="h-3 w-3" /> Escrow protected</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-3 w-3" /> Verified merchants</span>
          </div>
        </div>
        <p className="mt-4 text-center text-[10px] text-muted-foreground/70">
          © {new Date().getFullYear()} CryptoBazar. Trade responsibly.
        </p>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <DealNotifier />
      <SiteHeader />
      <main className={cn("mx-auto max-w-7xl px-[var(--space-screen-x)] py-[var(--space-screen-y)]", user && "pb-28 md:pb-6")}>
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setProfileReady(null); return; }
    (async () => {
      // Ensure a profile row exists — old accounts predate the signup trigger.
      const { data, error } = await db.from("profiles")
        .select("id").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        // No row yet — create one so downstream flows (deal code, wallet) work.
        await db.from("profiles").upsert(
          { id: user.id, full_name: user.user_metadata?.full_name ?? null },
          { onConflict: "id" },
        );
        if (!cancelled) setProfileReady(true);
        return;
      }
      setProfileReady(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || (user && profileReady === null)) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">Loading…</div>
      </PageShell>
    );
  }
  if (!user) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <h2 className="font-display text-xl font-semibold">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">You need an account to access this page.</p>
          <div className="mt-5">
            <Link to="/auth"><Button variant="hero">Sign in / Sign up</Button></Link>
          </div>
        </div>
      </PageShell>
    );
  }
  return <>{children}</>;
}
